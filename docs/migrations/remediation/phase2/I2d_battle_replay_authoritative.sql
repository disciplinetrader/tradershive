-- =============================================================================
-- Phase 2 · Increment 2d — authoritative battle-replay trade recording, then
-- lock paper_trades INSERT. Run as postgres. Rollback: I2d_rollback.sql.
-- Prereq: I2c applied (paper_trades scored UPDATE already locked).
--
-- The crossover: replay battles read paper_trades for rankings/settlement, but
-- the fill was executed client-side against a shared tape. Today the row is
-- written through the authenticated client with a client-supplied price and P&L.
-- This RPC becomes the single trust boundary:
--   - ownership: the account is the caller's AND belongs to this battle;
--   - battle: exists, is a replay battle, is UNRANKED, symbol matches the tape;
--   - PRICE AUTHORITY: entry_price and exit_price must fall inside the traded
--     range (low..high) of the dataset candle they claim to have filled on, or
--     the record is refused (fail closed). No candle => refused: an authoritative
--     price cannot be minted without the tape.
-- P&L itself is recomputed by the trusted TS server fn (it holds the symbol
-- metadata) from these bar-validated prices, never taken from the browser. For
-- the engine-priced symbols this path admits, the paper formula equals the
-- engine's, so the number does not diverge from the blotter — see battle-pnl.ts.
-- service_role only.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.record_battle_replay_trade(
  _user_id uuid, _battle_id uuid, _account_id uuid, _fields jsonb
) RETURNS TABLE(id uuid, pnl numeric, battle_id uuid, observation_cursor integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_acct_owner uuid; v_acct_battle uuid;
  v_status text; v_ranked boolean; v_dataset text; v_symbol text; v_tf text;
  v_from timestamptz; v_to timestamptz;
  v_entry numeric := (_fields->>'entry_price')::numeric;
  v_exit  numeric := (_fields->>'exit_price')::numeric;
  v_open  timestamptz := (_fields->>'opened_at')::timestamptz;
  v_close timestamptz := (_fields->>'closed_at')::timestamptz;
  v_lo numeric; v_hi numeric; v_eps numeric;
  v_id uuid;
BEGIN
  -- ownership + battle linkage (qualify battle_id: it is also an OUT column name)
  SELECT pa.user_id, pa.battle_id INTO v_acct_owner, v_acct_battle
    FROM public.paper_accounts pa WHERE pa.id=_account_id;
  IF v_acct_owner IS NULL OR v_acct_owner <> _user_id THEN
    RAISE EXCEPTION 'record_battle_replay_trade: account not owned by caller' USING ERRCODE='P0001';
  END IF;
  IF v_acct_battle IS DISTINCT FROM _battle_id THEN
    RAISE EXCEPTION 'record_battle_replay_trade: account does not belong to this battle' USING ERRCODE='P0001';
  END IF;

  SELECT b.status::text, b.ranked, b.replay_dataset_id, b.replay_symbol, b.replay_timeframe, b.replay_from, b.replay_to
    INTO v_status, v_ranked, v_dataset, v_symbol, v_tf, v_from, v_to
    FROM public.battles b WHERE b.id=_battle_id;
  IF v_symbol IS NULL AND v_dataset IS NULL THEN
    RAISE EXCEPTION 'record_battle_replay_trade: battle not found' USING ERRCODE='P0002';
  END IF;
  IF v_dataset IS NULL THEN
    RAISE EXCEPTION 'record_battle_replay_trade: not a replay battle' USING ERRCODE='P0001';
  END IF;
  IF v_ranked THEN
    RAISE EXCEPTION 'record_battle_replay_trade: ranked replay battles are not supported' USING ERRCODE='P0001';
  END IF;
  IF v_symbol IS DISTINCT FROM (_fields->>'symbol') THEN
    RAISE EXCEPTION 'record_battle_replay_trade: symbol does not match the tape' USING ERRCODE='P0001';
  END IF;

  -- fills must sit inside the loaded tape window
  IF v_open < v_from OR v_close > v_to OR v_close < v_open THEN
    RAISE EXCEPTION 'record_battle_replay_trade: fill times outside the dataset window' USING ERRCODE='P0001';
  END IF;

  -- PRICE AUTHORITY: entry within the entry candle's traded range.
  -- historical_candles.timeframe is an enum (timeframe_kind); compare as text.
  SELECT hc.low, hc.high INTO v_lo, v_hi FROM public.historical_candles hc
    WHERE hc.symbol=v_symbol AND hc.timeframe::text=v_tf AND hc.ts <= v_open AND hc.ts >= v_from
    ORDER BY hc.ts DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'record_battle_replay_trade: no entry candle to validate the fill price' USING ERRCODE='P0001';
  END IF;
  v_eps := GREATEST(abs(v_hi), abs(v_lo)) * 1e-9;
  IF v_entry < v_lo - v_eps OR v_entry > v_hi + v_eps THEN
    RAISE EXCEPTION 'record_battle_replay_trade: entry price % outside traded range [%,%]', v_entry, v_lo, v_hi USING ERRCODE='P0001';
  END IF;

  -- ... and exit within the exit candle's traded range
  SELECT hc.low, hc.high INTO v_lo, v_hi FROM public.historical_candles hc
    WHERE hc.symbol=v_symbol AND hc.timeframe::text=v_tf AND hc.ts <= v_close AND hc.ts >= v_from
    ORDER BY hc.ts DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'record_battle_replay_trade: no exit candle to validate the fill price' USING ERRCODE='P0001';
  END IF;
  v_eps := GREATEST(abs(v_hi), abs(v_lo)) * 1e-9;
  IF v_exit < v_lo - v_eps OR v_exit > v_hi + v_eps THEN
    RAISE EXCEPTION 'record_battle_replay_trade: exit price % outside traded range [%,%]', v_exit, v_lo, v_hi USING ERRCODE='P0001';
  END IF;

  -- Authoritative insert. enforce_battle_rules_on_trade still fires here and
  -- owns battle-live/window/symbol enforcement via created_at=now().
  INSERT INTO public.paper_trades(
    user_id, account_id, battle_id, symbol, market, direction, order_type, status,
    lot_size, entry_price, exit_price, stop_loss, take_profit, risk_amount,
    pnl, rr_realized, commission, close_reason, opened_at, closed_at, observation_cursor)
  VALUES(
    _user_id, _account_id, _battle_id,
    v_symbol,
    (_fields->>'market')::public.paper_market,
    (_fields->>'direction')::public.paper_direction,
    COALESCE((_fields->>'order_type')::public.paper_order_type,'market'),
    'closed',
    (_fields->>'lot_size')::numeric, v_entry, v_exit,
    NULLIF(_fields->>'stop_loss','')::numeric,
    NULLIF(_fields->>'take_profit','')::numeric,
    NULLIF(_fields->>'risk_amount','')::numeric,
    (_fields->>'pnl')::numeric,
    (_fields->>'rr_realized')::numeric,
    COALESCE(NULLIF(_fields->>'commission','')::numeric,0),
    NULLIF(_fields->>'close_reason','')::public.paper_close_reason,
    v_open, v_close,
    (_fields->>'observation_cursor')::integer)
  RETURNING paper_trades.id INTO v_id;

  RETURN QUERY SELECT v_id, (_fields->>'pnl')::numeric, _battle_id, (_fields->>'observation_cursor')::integer;
END $fn$;

REVOKE ALL ON FUNCTION public.record_battle_replay_trade(uuid,uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_battle_replay_trade(uuid,uuid,uuid,jsonb) TO service_role;

-- Contract: with the only legitimate INSERT path now service-role, revoke the
-- authenticated client's ability to insert paper_trades rows directly. This is
-- the INSERT lock deferred by I2c.
REVOKE INSERT ON public.paper_trades FROM authenticated;

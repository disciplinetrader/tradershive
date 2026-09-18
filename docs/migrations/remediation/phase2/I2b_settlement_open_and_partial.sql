-- =============================================================================
-- Phase 2 · Increment 2b — open_trade RPC + extended partial_close_trade.
-- Additive/replace. Run as postgres. Rollback: I2b_rollback.sql.
-- Prereq: I2_settlement_core applied.
-- =============================================================================

-- open_trade — authoritative insert of an OPEN paper_trades row. The TS server
-- fn does broker validation and derives the entry price from the trusted price
-- resolver; this RPC sets user_id/status/opened_at server-side and records the
-- 'opened' position_history event. Whitelisted columns only. service_role only.
-- Drop the 4-arg form first: adding _opened_payload with a default would
-- otherwise leave two overloads and make the grant/rollback ambiguous.
DROP FUNCTION IF EXISTS public.open_trade(uuid,uuid,numeric,jsonb);
CREATE OR REPLACE FUNCTION public.open_trade(
  _user_id uuid, _account_id uuid, _entry_price numeric, _fields jsonb,
  _opened_payload jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_id uuid; v_owner uuid;
BEGIN
  SELECT user_id INTO v_owner FROM public.paper_accounts
    WHERE id=_account_id AND deleted_at IS NULL AND COALESCE(is_archived,false)=false;
  IF v_owner IS NULL OR v_owner <> _user_id THEN
    RAISE EXCEPTION 'open_trade: account % not owned by caller or unavailable', _account_id USING ERRCODE='P0001';
  END IF;

  INSERT INTO public.paper_trades(
    user_id, account_id, status, opened_at, entry_price,
    symbol, market, direction, order_type, lot_size,
    stop_loss, take_profit, risk_amount, reward_amount, rr_planned,
    commission, swap, notes, screenshot_path, strategy_id, tag_ids, fx_rate)
  SELECT _user_id, _account_id, 'open', now(), _entry_price,
    _fields->>'symbol',
    (_fields->>'market')::public.paper_market,
    (_fields->>'direction')::public.paper_direction,
    COALESCE((_fields->>'order_type')::public.paper_order_type, 'market'),
    (_fields->>'lot_size')::numeric,
    NULLIF(_fields->>'stop_loss','')::numeric,
    NULLIF(_fields->>'take_profit','')::numeric,
    NULLIF(_fields->>'risk_amount','')::numeric,
    NULLIF(_fields->>'reward_amount','')::numeric,
    NULLIF(_fields->>'rr_planned','')::numeric,
    COALESCE(NULLIF(_fields->>'commission','')::numeric, 0),
    COALESCE(NULLIF(_fields->>'swap','')::numeric, 0),
    NULLIF(_fields->>'notes',''),
    NULLIF(_fields->>'screenshot_path',''),
    NULLIF(_fields->>'strategy_id','')::uuid,
    CASE WHEN _fields ? 'tag_ids' THEN ARRAY(SELECT jsonb_array_elements_text(_fields->'tag_ids')::uuid) ELSE '{}'::uuid[] END,
    NULLIF(_fields->>'fx_rate','')::numeric
  RETURNING id INTO v_id;

  INSERT INTO public.position_history(user_id, account_id, trade_id, event, payload)
  VALUES (_user_id, _account_id, v_id, 'opened',
          jsonb_build_object('entry_price', _entry_price, 'lot_size', (_fields->>'lot_size')::numeric)
          || COALESCE(_opened_payload, '{}'::jsonb));
  RETURN v_id;
END $fn$;

-- Extended partial_close_trade: apply the reduced lot/commission/swap to the
-- open row AND realize the closed slice's money, atomically. Drop the core
-- (money-only) 4-arg version first so there is exactly one function.
DROP FUNCTION IF EXISTS public.partial_close_trade(uuid,uuid,numeric,jsonb);
CREATE OR REPLACE FUNCTION public.partial_close_trade(
  _trade_id uuid, _user_id uuid, _raw_pnl numeric,
  _new_lot_size numeric, _new_commission numeric, _new_swap numeric, _payload jsonb DEFAULT '{}'::jsonb
) RETURNS TABLE(pnl numeric, new_balance numeric) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_trade public.paper_trades%ROWTYPE; v_balance numeric; v_nbp boolean; v_pnl numeric := _raw_pnl;
BEGIN
  SELECT * INTO v_trade FROM public.paper_trades WHERE id=_trade_id AND user_id=_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'partial_close_trade: trade % not found', _trade_id USING ERRCODE='P0002'; END IF;
  IF v_trade.status <> 'open' THEN RAISE EXCEPTION 'partial_close_trade: trade % not open', _trade_id USING ERRCODE='P0001'; END IF;
  IF _new_lot_size <= 0 THEN RAISE EXCEPTION 'partial_close_trade: remaining lot must be > 0' USING ERRCODE='P0001'; END IF;

  SELECT balance, negative_balance_protection INTO v_balance, v_nbp
    FROM public.paper_accounts WHERE id=v_trade.account_id AND user_id=_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'partial_close_trade: account not found'; END IF;

  IF v_nbp AND (v_balance + v_pnl) < 0 THEN v_pnl := -v_balance; END IF;
  v_balance := CASE WHEN v_nbp THEN GREATEST(0, v_balance + v_pnl) ELSE v_balance + v_pnl END;

  UPDATE public.paper_trades
     SET lot_size=_new_lot_size, commission=_new_commission, swap=_new_swap, updated_at=now()
   WHERE id=_trade_id AND user_id=_user_id AND status='open';
  IF NOT FOUND THEN RAISE EXCEPTION 'partial_close_trade: lost race for %', _trade_id USING ERRCODE='P0001'; END IF;

  UPDATE public.paper_accounts SET balance=v_balance, equity=v_balance, updated_at=now() WHERE id=v_trade.account_id;
  PERFORM public._apply_settlement_stats(v_trade.account_id, _user_id, v_pnl, false);
  INSERT INTO public.position_history(user_id, account_id, trade_id, event, payload)
  VALUES(_user_id, v_trade.account_id, _trade_id, 'partial_close', _payload || jsonb_build_object('pnl', v_pnl));
  RETURN QUERY SELECT v_pnl, v_balance;
END $fn$;

REVOKE ALL ON FUNCTION public.open_trade(uuid,uuid,numeric,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.partial_close_trade(uuid,uuid,numeric,numeric,numeric,numeric,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.open_trade(uuid,uuid,numeric,jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.partial_close_trade(uuid,uuid,numeric,numeric,numeric,numeric,jsonb) TO service_role;

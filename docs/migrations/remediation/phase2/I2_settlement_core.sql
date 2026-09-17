-- =============================================================================
-- Phase 2 · Increment 2 (core) — authoritative trade settlement RPCs
-- Closes (core of): C-1/C-3 double-close & concurrent settlement, and gives
-- paper trading a service-authoritative money path. ADDITIVE ("expand"):
-- creates functions only; no table lock, no caller change yet — nothing breaks.
-- STATUS: rehearsal first. Run as postgres. Rollback: I2_settlement_core_rollback.sql
--
-- Design: P&L is computed in TypeScript (needs symbol pip/contract specs) from a
-- SERVER-derived price and passed in as _raw_pnl. The RPC owns the invariant:
-- it locks the trade + account rows, enforces status='open' (double-close
-- impossible), clamps the loss against the LOCKED balance (negative-balance
-- protection), and writes paper_trades + paper_accounts + account_statistics +
-- position_history in one transaction. Mirrors src/lib/paper-trading/settlement.ts
-- (clampRealizedPnl / nextBalance / nextStatistics). service_role only.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Internal: apply one settlement to account_statistics (mirrors nextStatistics).
-- _counts_as_trade=false is a partial realization (money only; no trade counter).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._apply_settlement_stats(
  _account_id uuid, _user_id uuid, _pnl numeric, _counts_as_trade boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE s public.account_statistics%ROWTYPE; v_total int; v_wins int; v_losses int; v_be int;
BEGIN
  SELECT * INTO s FROM public.account_statistics WHERE account_id=_account_id;
  IF NOT FOUND THEN
    s.total_trades:=0; s.wins:=0; s.losses:=0; s.breakevens:=0;
    s.gross_profit:=0; s.gross_loss:=0; s.net_pnl:=0; s.best_trade:=0; s.worst_trade:=0;
  END IF;
  v_total  := COALESCE(s.total_trades,0) + (CASE WHEN _counts_as_trade THEN 1 ELSE 0 END);
  v_wins   := COALESCE(s.wins,0)   + (CASE WHEN _counts_as_trade AND _pnl>0 THEN 1 ELSE 0 END);
  v_losses := COALESCE(s.losses,0) + (CASE WHEN _counts_as_trade AND _pnl<0 THEN 1 ELSE 0 END);
  v_be     := COALESCE(s.breakevens,0) + (CASE WHEN _counts_as_trade AND _pnl=0 THEN 1 ELSE 0 END);
  INSERT INTO public.account_statistics(
    account_id, user_id, total_trades, wins, losses, breakevens, win_rate,
    gross_profit, gross_loss, net_pnl, best_trade, worst_trade, updated_at)
  VALUES(_account_id, _user_id, v_total, v_wins, v_losses, v_be,
    CASE WHEN v_total>0 THEN (v_wins::numeric/v_total)*100 ELSE 0 END,
    COALESCE(s.gross_profit,0) + (CASE WHEN _pnl>0 THEN _pnl ELSE 0 END),
    COALESCE(s.gross_loss,0)   + (CASE WHEN _pnl<0 THEN abs(_pnl) ELSE 0 END),
    COALESCE(s.net_pnl,0) + _pnl,
    CASE WHEN _counts_as_trade THEN GREATEST(COALESCE(s.best_trade,0), _pnl) ELSE COALESCE(s.best_trade,0) END,
    CASE WHEN _counts_as_trade THEN LEAST(COALESCE(s.worst_trade,0), _pnl) ELSE COALESCE(s.worst_trade,0) END,
    now())
  ON CONFLICT (account_id) DO UPDATE SET
    total_trades=EXCLUDED.total_trades, wins=EXCLUDED.wins, losses=EXCLUDED.losses,
    breakevens=EXCLUDED.breakevens, win_rate=EXCLUDED.win_rate,
    gross_profit=EXCLUDED.gross_profit, gross_loss=EXCLUDED.gross_loss, net_pnl=EXCLUDED.net_pnl,
    best_trade=EXCLUDED.best_trade, worst_trade=EXCLUDED.worst_trade, updated_at=now();
END $fn$;

-- ---------------------------------------------------------------------------
-- close_trade — settle a full close atomically. Returns the authoritative
-- clamped pnl and new balance. RAISES if the trade is not the caller's or not
-- open (so a double / concurrent close settles exactly once).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_trade(
  _trade_id uuid, _user_id uuid, _exit_price numeric, _raw_pnl numeric,
  _rr_realized numeric, _close_reason text, _closed_at timestamptz DEFAULT now()
) RETURNS TABLE(pnl numeric, new_balance numeric, close_reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_trade public.paper_trades%ROWTYPE;
  v_balance numeric; v_nbp boolean; v_pnl numeric := _raw_pnl; v_reason text := _close_reason;
BEGIN
  -- Lock the trade; the status guard makes a second concurrent close a no-op-raise.
  SELECT * INTO v_trade FROM public.paper_trades
   WHERE id=_trade_id AND user_id=_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'close_trade: trade % not found for user', _trade_id USING ERRCODE='P0002'; END IF;
  IF v_trade.status <> 'open' THEN RAISE EXCEPTION 'close_trade: trade % is % not open', _trade_id, v_trade.status USING ERRCODE='P0001'; END IF;

  SELECT balance, negative_balance_protection INTO v_balance, v_nbp
    FROM public.paper_accounts WHERE id=v_trade.account_id AND user_id=_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'close_trade: account not found for trade %', _trade_id; END IF;

  -- Clamp the loss against the locked balance (authoritative; mirrors clampRealizedPnl).
  IF v_nbp AND (v_balance + v_pnl) < 0 THEN
    v_pnl := -v_balance;
    IF v_reason = 'manual' THEN v_reason := 'liquidation'; END IF;
  END IF;

  UPDATE public.paper_trades SET
    status='closed', exit_price=_exit_price, pnl=v_pnl, rr_realized=_rr_realized,
    close_reason=v_reason::public.paper_close_reason, closed_at=_closed_at, updated_at=now()
   WHERE id=_trade_id AND user_id=_user_id AND status='open';
  IF NOT FOUND THEN RAISE EXCEPTION 'close_trade: lost the settlement race for %', _trade_id USING ERRCODE='P0001'; END IF;

  v_balance := CASE WHEN v_nbp THEN GREATEST(0, v_balance + v_pnl) ELSE v_balance + v_pnl END;
  UPDATE public.paper_accounts SET balance=v_balance, equity=v_balance, updated_at=now() WHERE id=v_trade.account_id;

  PERFORM public._apply_settlement_stats(v_trade.account_id, _user_id, v_pnl, true);

  INSERT INTO public.position_history(user_id, account_id, trade_id, event, payload)
  VALUES(_user_id, v_trade.account_id, _trade_id, 'closed',
    jsonb_build_object('exit_price', _exit_price, 'pnl', v_pnl, 'close_reason', v_reason));

  RETURN QUERY SELECT v_pnl, v_balance, v_reason;
END $fn$;

-- ---------------------------------------------------------------------------
-- partial_close_trade — realize a slice; money reaches balance+net_pnl but the
-- trade stays open and counters are not incremented (countsAsTrade=false).
-- The caller has already reduced lot_size / commission / swap on the row via
-- its own validated write; this RPC owns the money movement only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.partial_close_trade(
  _trade_id uuid, _user_id uuid, _raw_pnl numeric, _payload jsonb DEFAULT '{}'::jsonb
) RETURNS TABLE(pnl numeric, new_balance numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_trade public.paper_trades%ROWTYPE; v_balance numeric; v_nbp boolean; v_pnl numeric := _raw_pnl;
BEGIN
  SELECT * INTO v_trade FROM public.paper_trades WHERE id=_trade_id AND user_id=_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'partial_close_trade: trade % not found', _trade_id USING ERRCODE='P0002'; END IF;
  IF v_trade.status <> 'open' THEN RAISE EXCEPTION 'partial_close_trade: trade % not open', _trade_id USING ERRCODE='P0001'; END IF;

  SELECT balance, negative_balance_protection INTO v_balance, v_nbp
    FROM public.paper_accounts WHERE id=v_trade.account_id AND user_id=_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'partial_close_trade: account not found'; END IF;

  IF v_nbp AND (v_balance + v_pnl) < 0 THEN v_pnl := -v_balance; END IF;
  v_balance := CASE WHEN v_nbp THEN GREATEST(0, v_balance + v_pnl) ELSE v_balance + v_pnl END;
  UPDATE public.paper_accounts SET balance=v_balance, equity=v_balance, updated_at=now() WHERE id=v_trade.account_id;

  PERFORM public._apply_settlement_stats(v_trade.account_id, _user_id, v_pnl, false);

  INSERT INTO public.position_history(user_id, account_id, trade_id, event, payload)
  VALUES(_user_id, v_trade.account_id, _trade_id, 'partial_close', _payload || jsonb_build_object('pnl', v_pnl));

  RETURN QUERY SELECT v_pnl, v_balance;
END $fn$;

-- Grants: service_role only (the trusted TS server fns call these; the browser cannot).
REVOKE ALL ON FUNCTION public._apply_settlement_stats(uuid,uuid,numeric,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.close_trade(uuid,uuid,numeric,numeric,numeric,text,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.partial_close_trade(uuid,uuid,numeric,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._apply_settlement_stats(uuid,uuid,numeric,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.close_trade(uuid,uuid,numeric,numeric,numeric,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.partial_close_trade(uuid,uuid,numeric,jsonb) TO service_role;

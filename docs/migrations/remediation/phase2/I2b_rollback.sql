-- =============================================================================
-- Phase 2 · Increment 2b ROLLBACK. Run as postgres.
--
-- Drops open_trade and the extended (7-arg) partial_close_trade, then restores
-- the core money-only (4-arg) partial_close_trade from I2_settlement_core so the
-- database returns exactly to its post-I2 state. Safe only once the TS callers
-- have been reverted (open_trade / 7-arg partial are no longer invoked).
-- =============================================================================

DROP FUNCTION IF EXISTS public.open_trade(uuid,uuid,numeric,jsonb,jsonb);
DROP FUNCTION IF EXISTS public.open_trade(uuid,uuid,numeric,jsonb);
DROP FUNCTION IF EXISTS public.partial_close_trade(uuid,uuid,numeric,numeric,numeric,numeric,jsonb);

-- Restore the money-only 4-arg partial_close_trade (identical to I2 core).
CREATE OR REPLACE FUNCTION public.partial_close_trade(
  _trade_id uuid, _user_id uuid, _raw_pnl numeric, _payload jsonb DEFAULT '{}'::jsonb
) RETURNS TABLE(pnl numeric, new_balance numeric) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_trade public.paper_trades%ROWTYPE; v_balance numeric; v_nbp boolean; v_pnl numeric := _raw_pnl;
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

REVOKE ALL ON FUNCTION public.partial_close_trade(uuid,uuid,numeric,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.partial_close_trade(uuid,uuid,numeric,jsonb) TO service_role;

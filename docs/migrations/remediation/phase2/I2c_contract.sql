-- =============================================================================
-- Phase 2 · Increment 2c — table contract (money / stats / scored-column lock).
-- Run as postgres. Rollback: I2c_rollback.sql.
--
-- CONTRACT step of expand -> migrate -> contract. Every legitimate writer of the
-- money / statistics / scored columns now goes through a service-role path:
--   - balance / equity / statistics  -> settlement RPCs (_apply_settlement_stats,
--     close_trade, partial_close_trade) and supabaseAdmin (createAccount,
--     resetAccount, prop-challenge provisioning).
--   - scored trade columns (entry/exit/pnl/status/lot/…) -> open_trade / close /
--     partial RPCs.
-- So `authenticated` can lose direct write access to them. SELECT is untouched.
--
-- DEFERRED (documented follow-up): paper_trades INSERT is NOT revoked here.
-- battle-replay.functions still inserts a closed paper_trades row via the
-- authenticated client with a client-supplied pnl; revoking INSERT before that
-- caller is migrated to an authoritative recompute RPC would break battle replay.
-- The INSERT revoke lands in the battle-replay increment (I2d), once the P&L is
-- server-recomputed. Locking the scored UPDATE columns here already stops a
-- forged edit of an existing row; the remaining gap is a forged fresh insert,
-- closed next.
-- =============================================================================

-- Drift guard: fail loudly if a locked column has been renamed/removed, so the
-- lock can never silently miss its target.
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(t.tbl||'.'||t.col, ', ') INTO missing
  FROM (VALUES
    ('paper_accounts','balance'),('paper_accounts','equity'),('paper_accounts','starting_balance'),
    ('paper_trades','entry_price'),('paper_trades','exit_price'),('paper_trades','pnl'),
    ('paper_trades','status'),('paper_trades','lot_size'),('paper_trades','stop_loss'),
    ('paper_trades','take_profit'),('paper_trades','notes'),('paper_trades','deleted_at'),
    ('account_statistics','net_pnl')
  ) AS t(tbl,col)
  LEFT JOIN information_schema.columns c
    ON c.table_schema='public' AND c.table_name=t.tbl AND c.column_name=t.col
  WHERE c.column_name IS NULL;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'I2c drift guard: expected column(s) missing: %', missing;
  END IF;
END $$;

-- ---- paper_accounts: no direct insert; update limited to config/cosmetic ----
REVOKE INSERT, UPDATE ON public.paper_accounts FROM authenticated;
GRANT UPDATE(
  name, leverage, max_daily_risk_pct, max_trade_risk_pct,
  margin_call_level, stop_out_level, negative_balance_protection,
  is_archived, is_active, deleted_at, default_commission, default_swap
) ON public.paper_accounts TO authenticated;

-- ---- account_statistics: SELECT-only for authenticated ----
REVOKE INSERT, UPDATE ON public.account_statistics FROM authenticated;

-- ---- paper_trades: update limited to owner-management columns ----
-- INSERT deliberately retained until battle-replay is migrated (see header).
REVOKE UPDATE ON public.paper_trades FROM authenticated;
GRANT UPDATE(stop_loss, take_profit, notes, deleted_at) ON public.paper_trades TO authenticated;

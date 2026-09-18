-- =============================================================================
-- Phase 2 · Increment 3c — prop-challenge authoritative-result contract.
-- Run as postgres. Rollback: I3c_rollback.sql.
--
-- tickPropChallenge derives equity/P&L/verdict server-side from the locked
-- paper_accounts.equity and closed paper_trades, but it previously PERSISTED the
-- result via the authenticated client — so a client could forge a passed or
-- over-funded challenge with a direct PostgREST write to prop_challenges /
-- prop_challenge_days. Those writers are now service-role (createChallenge /
-- tickPropChallenge / abandonPropChallenge use supabaseAdmin), so revoke the
-- authenticated client's INSERT/UPDATE on both tables. SELECT stays (the HUD
-- reads them); table-level DELETE on prop_challenges is untouched so a user can
-- still delete their own challenge.
-- =============================================================================

REVOKE INSERT, UPDATE ON public.prop_challenges     FROM authenticated;
REVOKE INSERT, UPDATE ON public.prop_challenge_days FROM authenticated;

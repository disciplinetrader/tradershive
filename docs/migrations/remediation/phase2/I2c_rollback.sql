-- =============================================================================
-- Phase 2 · Increment 2c ROLLBACK. Run as postgres.
--
-- Restores the pre-I2c `authenticated` grants: full INSERT + UPDATE (all columns)
-- on the three tables. SELECT / REFERENCES were never revoked. The table-level
-- GRANT subsumes the narrower column-level grants I2c added.
-- =============================================================================

GRANT INSERT, UPDATE ON public.paper_accounts    TO authenticated;
GRANT INSERT, UPDATE ON public.account_statistics TO authenticated;
GRANT UPDATE          ON public.paper_trades      TO authenticated;

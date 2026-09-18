-- =============================================================================
-- Phase 2 · Increment 3c ROLLBACK. Run as postgres.
-- Restores the pre-I3c authenticated INSERT/UPDATE on the prop tables.
-- =============================================================================

GRANT INSERT, UPDATE ON public.prop_challenges     TO authenticated;
GRANT INSERT, UPDATE ON public.prop_challenge_days TO authenticated;

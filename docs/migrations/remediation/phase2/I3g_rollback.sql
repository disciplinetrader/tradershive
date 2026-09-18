-- =============================================================================
-- Phase 2 · Increment 3g ROLLBACK. Run as postgres.
-- Drops the prop-expiry function. (If the prop-expiry cron was scheduled, the
-- owner unschedules it first: SELECT cron.unschedule('prop-expiry-hourly');)
-- =============================================================================
DROP FUNCTION IF EXISTS public.expire_prop_challenges();

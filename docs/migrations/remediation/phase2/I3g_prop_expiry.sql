-- =============================================================================
-- Phase 2 · Increment 3g — server-side prop-challenge expiry (O-2 prop cron).
-- Run as postgres. Rollback: I3g_rollback.sql.
--
-- WHY A CRON IS NEEDED. tickPropChallenge is HUD-driven (runs from the trader's
-- open page and after a trade close). Breach/pass depend on equity, which only
-- moves when a trade closes — so those are covered by the trade path. But EXPIRY
-- is purely time-based: a challenge whose duration elapses without hitting the
-- profit target must fail even if the trader never opens the HUD again. Nothing
-- does that today — production has 6 active challenges, 5 of them already past
-- ends_at and still 'active'. This service-role function performs that one
-- browser-independent transition, idempotently.
--
-- Result columns are locked to authenticated (I3c); this is service-role.
-- The intended schedule (NOT installed here — production cron is owner-gated):
--   SELECT cron.schedule('prop-expiry-hourly', '5 * * * *',
--                        $$ SELECT public.expire_prop_challenges(); $$);
-- =============================================================================

CREATE OR REPLACE FUNCTION public.expire_prop_challenges()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE v_count integer;
BEGIN
  WITH expired AS (
    UPDATE public.prop_challenges
       SET status = 'failed',
           result = 'failed',
           breach_reason = 'Challenge duration elapsed without reaching the profit target',
           breach_at = COALESCE(breach_at, now()),
           completed_at = COALESCE(completed_at, now()),
           updated_at = now()
     WHERE status = 'active'
       AND ends_at IS NOT NULL
       AND ends_at < now()
    RETURNING 1)
  SELECT count(*) INTO v_count FROM expired;
  RETURN v_count;
END $fn$;

REVOKE ALL ON FUNCTION public.expire_prop_challenges() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_prop_challenges() TO service_role;

-- EC-2 — schedule the economic calendar sync.
--
-- Run the two statements BELOW THE HEADER separately, in order.
--
-- Auth: the endpoint reads CRON_SECRET (falling back to
-- HISTORICAL_SYNC_CRON_SECRET) and accepts it as the x-cron-secret header.
-- Verified 2026-08-18: an unauthenticated POST returns 401, not 503, so the
-- secret is already set on the server. Substitute its value for <CRON_SECRET>
-- below. Never give it a VITE_ prefix.
--
-- Host: tradershive.lovable.app is the PUBLISHED deployment — it answers 200
-- with an x-deployment-id header. The project--<uuid>.lovable.app alias is the
-- gated preview (403 + noindex on normal pages, no deployment id); the hook
-- happens to answer there because /api/public/* is exempt from site auth, but
-- it is not the origin to schedule against.
--
-- Cadence: daily. A window missed is lost for ever, and this source publishes
-- one week forward-only; a failed run then costs a day rather than a week.
-- Not more often — the host rate-limits (measured: HTTP 429 after a burst).
-- 05:17 UTC keeps clear of the jobs that cluster on the hour, and lands after
-- the US session and before the European releases.
--
-- Timeout: pg_net defaults to 5000 ms, and this endpoint does real work — an
-- outbound fetch to the upstream feed plus an upsert of ~96 rows. Five seconds
-- is not a safe budget for that, and the first manual trigger on 2026-08-18
-- timed out at exactly 5000 ms. An explicit 30 s is set below. Do NOT drop it
-- back to the default.
--
-- Host: RESOLVED 2026-08-19. tradershive.lovable.app is correct — it is the
-- published deployment (200 + x-deployment-id; the project--<uuid> alias is
-- the gated preview), and the five repaired jobs now authenticate against it
-- successfully, which proves reachability from pg_net rather than inferring it.
--
-- Statement 1 errors on first application because the job does not exist yet.
-- That is expected; it is here so the pair is safe to re-run.

select cron.unschedule('economic-calendar-daily');

select cron.schedule(
  'economic-calendar-daily',
  '17 5 * * *',
  $$
  select net.http_post(
    url                  := 'https://tradershive.lovable.app/api/public/hooks/economic-calendar',
    headers              := '{"Content-Type":"application/json","x-cron-secret":"<CRON_SECRET>"}'::jsonb,
    body                 := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

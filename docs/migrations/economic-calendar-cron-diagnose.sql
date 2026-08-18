-- EC-2 diagnosis — pg_net times out against the calendar endpoint.
--
-- Observed 2026-08-18: three attempts, all timed_out=true, no status_code.
-- Stage times are unreliable evidence — the negative TCP/SSL values show the
-- breakdown is derived by subtraction, so a connect that never completes dumps
-- its time into whichever bucket is left. Do not conclude "DNS failed once,
-- HTTP failed twice"; conclude "it hung, three times".
--
-- What IS known: pre-existing rows in net._http_response carry status_code 401.
-- A 401 is a completed round trip, so pg_net can reach SOMETHING. Two
-- hypotheses remain, and they need different fixes:
--
--   H1  Our endpoint is slower than pg_net's 5000 ms default. It performs a
--       real outbound fetch to faireconomy plus an upsert, and that upstream
--       was rate-limiting earlier today — a 429 path can hang. Fix: raise the
--       timeout.
--   H2  tradershive.lovable.app specifically is unreachable from Supabase's
--       network, while project--<uuid>.lovable.app is not. Fix: schedule
--       against the alias, and BA-3 was right by accident.
--
-- Run the probes, wait ~35 seconds for the slowest, then read the results back
-- and match on id. Substitute <CRON_SECRET>.

-- ── probes ────────────────────────────────────────────────────────────────
-- Cheap paths deliberately: a root GET does no work on our server, so if it
-- also times out the cause cannot be endpoint duration.

select 'A · third-party baseline'  as probe, net.http_get(url := 'https://example.com') as request_id
union all
select 'B · published host root',   net.http_get(url := 'https://tradershive.lovable.app/')
union all
select 'C · preview alias root',    net.http_get(url := 'https://project--237f7325-035a-4d38-a67f-36c64e02b573.lovable.app/')
union all
select 'D · endpoint, 30s timeout', net.http_post(
  url                  := 'https://tradershive.lovable.app/api/public/hooks/economic-calendar',
  headers              := '{"Content-Type":"application/json","x-cron-secret":"<CRON_SECRET>"}'::jsonb,
  body                 := '{}'::jsonb,
  timeout_milliseconds := 30000
)
union all
select 'E · endpoint on the alias', net.http_post(
  url                  := 'https://project--237f7325-035a-4d38-a67f-36c64e02b573.lovable.app/api/public/hooks/economic-calendar',
  headers              := '{"Content-Type":"application/json","x-cron-secret":"<CRON_SECRET>"}'::jsonb,
  body                 := '{}'::jsonb,
  timeout_milliseconds := 30000
);

-- ── read back (wait ~35s first) ───────────────────────────────────────────

select id, status_code, timed_out, left(coalesce(error_msg, ''), 60) as error,
       left(coalesce(content, ''), 160) as body
  from net._http_response
 order by id desc
 limit 6;

-- ── how to read it ────────────────────────────────────────────────────────
--
-- A times out          → pg_net egress is broken generally. Nothing about our
--                        hosts; escalate to Supabase. (Unlikely — the historic
--                        401s prove round trips have completed.)
-- A ok, B times out,
--   C returns 403      → H2. The published host is unreachable from this
--                        network; schedule against the alias and record why.
-- B and C both ok,
--   D returns 200      → H1. Pure duration: the 5000 ms default was the whole
--                        problem. Reschedule with an explicit timeout.
-- B ok but D still
--   times out at 30s   → the endpoint is hanging, not merely slow. Most likely
--                        the upstream feed fetch has no timeout of its own and
--                        is stalling on a rate-limited connection — that would
--                        be a real defect in ingest.server.ts worth fixing
--                        rather than papering over with a longer cron timeout.
-- D and E disagree     → host-specific, same conclusion as H2.
--
-- Note D writes rows if it succeeds. That is fine and is the point.

-- ── has pg_net EVER been pointed at the published host? ───────────────────
--
-- net._http_response does not retain the request URL, so historic attribution
-- is impossible from there. cron.job.command DOES contain the full statement,
-- URL included — so this shows every host that has ever been scheduled.
--
-- If only project--<uuid> appears, then today's timeout is the FIRST time
-- pg_net has been asked to reach tradershive.lovable.app at all. That makes it
-- a new data point rather than a regression, and makes H2 more likely.

select jobid, jobname, schedule, active,
       substring(command from 'https?://[^/'']+') as target_host
  from cron.job
 order by jobid;

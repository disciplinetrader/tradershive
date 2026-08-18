-- EC-2 — fire the calendar sync once, now, instead of waiting for 05:17 UTC.
--
-- Deliberately the SQL route rather than curl. A curl from a laptop proves the
-- endpoint and the secret; it does NOT prove that the database's pg_net can
-- reach the host. The cron job runs from the database, so the manual trigger
-- has to as well or it tests a different network path than the one that will
-- actually run.
--
-- Substitute the real value for <CRON_SECRET>. This is the identical call the
-- scheduled job makes.

-- Timeout is explicit. pg_net defaults to 5000 ms, which this endpoint does
-- not fit inside — the first trigger timed out at exactly 5000 ms.

select net.http_post(
  url                  := 'https://tradershive.lovable.app/api/public/hooks/economic-calendar',
  headers              := '{"Content-Type":"application/json","x-cron-secret":"<CRON_SECRET>"}'::jsonb,
  body                 := '{}'::jsonb,
  timeout_milliseconds := 30000
) as request_id;

-- ── WRITE DOWN THE request_id ABOVE ───────────────────────────────────────
--
-- pg_net is ASYNCHRONOUS: the statement returns a request id immediately and
-- the response lands later. Wait ~35 seconds.
--
-- Do NOT read it back with `order by created desc limit N`. Several jobs are
-- scheduled every minute and are currently failing with 401s (EC-4); they
-- insert rows in the gap and take the top of that list. That has already
-- produced one confident wrong conclusion in this investigation — three
-- identical 401 rows that were never the requests being looked for.
--
-- Filter by the exact id instead.

select id, status_code, timed_out,
       left(coalesce(error_msg, ''), 80) as error,
       left(coalesce(content, ''), 300)  as body
  from net._http_response
 where id = <REQUEST_ID>;

-- Reading the result
-- ------------------
-- 200 with a body like:
--   {"ok":true,"fetched":96,"upserted":96,"errors":[],
--    "windowFrom":"2026-08-16T22:30:00.000Z",
--    "windowTo":"2026-08-21T14:00:00.000Z","withActual":0}
--   → working. withActual:0 is expected with this provider (EC-1), not a fault.
--
-- 200 with "ok":false and a 429 in errors
--   → the upstream feed rate-limited us. Harmless: nothing is written, the
--     table is unchanged, and the next daily run picks it up. Do not retry in
--     a loop; that is what earned the 429.
--
-- 401 → the x-cron-secret value does not match CRON_SECRET. Note that five
--       OTHER jobs are 401ing continuously (EC-4), so a 401 here would mean
--       this trigger shares their stale secret rather than the server's.
-- 503 → CRON_SECRET is unset on the server (it was set as of 2026-08-18).
--
-- timed_out=true at 30 s → NOT simply "slow". Thirty seconds is far past a
--       cold start, so the endpoint is hanging. Two candidates, and they are
--       distinguishable: run economic-calendar-cron-probe.sql. If the
--       published host's ROOT also times out, it is host reachability (H2)
--       and the job belongs on the alias. If root answers fine, the hang is
--       inside the handler — most likely `syncEconomicCalendar`'s fetch has no
--       timeout of its own and is stalling on a rate-limited connection. Fix
--       that in ingest.server.ts; do not raise the cron timeout again.
--
-- Then confirm the rows with economic-calendar-cron-verify.sql.

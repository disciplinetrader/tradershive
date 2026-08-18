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

select net.http_post(
  url     := 'https://tradershive.lovable.app/api/public/hooks/economic-calendar',
  headers := '{"Content-Type":"application/json","x-cron-secret":"<CRON_SECRET>"}'::jsonb,
  body    := '{}'::jsonb
) as request_id;

-- pg_net is ASYNCHRONOUS: the statement above returns a request id
-- immediately, and the response lands a moment later. Wait a few seconds, then
-- read it back. `select *` rather than named columns because the response
-- table's shape varies across pg_net versions, and the body is the point.

select * from net._http_response order by created desc limit 3;

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
-- 401 → the x-cron-secret value does not match CRON_SECRET.
-- 503 → CRON_SECRET is unset on the server (it was set as of 2026-08-18).
--
-- Then confirm the rows with economic-calendar-cron-verify.sql.

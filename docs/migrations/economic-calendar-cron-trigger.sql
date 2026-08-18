-- EC-2 — fire the calendar sync once, now.
--
-- ONE substitution, in statement 1 only: <CRON_SECRET>. Statement 2 is
-- ready to paste as-is.

-- ── STATEMENT 1 ───────────────────────────────────────────────────────────
-- Replace <CRON_SECRET> with the real value. Everything else is final.
-- The 30 s timeout is explicit: pg_net defaults to 5000 ms, which this
-- endpoint does not fit inside — the first attempt timed out at exactly that.

select net.http_post(
  url                  := 'https://tradershive.lovable.app/api/public/hooks/economic-calendar',
  headers              := '{"Content-Type":"application/json","x-cron-secret":"<CRON_SECRET>"}'::jsonb,
  body                 := '{}'::jsonb,
  timeout_milliseconds := 30000
) as request_id;

-- ── STATEMENT 2 ───────────────────────────────────────────────────────────
-- Wait ~35 seconds, then run this EXACTLY AS WRITTEN. Nothing to fill in.
--
-- Five other jobs fire every minute and fail with 401 "Unauthorized" (EC-4).
-- They are excluded below by their body, so what remains is this trigger.
-- Reading them by accident is what produced a wrong conclusion earlier, which
-- is why this filters rather than taking the top N rows.

select id,
       status_code,
       timed_out,
       left(coalesce(error_msg, ''), 90) as error,
       left(coalesce(content, ''), 300)  as body
  from net._http_response
 where created > now() - interval '5 minutes'
   and coalesce(content, '') not like 'Unauthorized%'
 order by id desc
 limit 5;

-- If statement 2 returns NO rows, the trigger itself came back 401 and was
-- filtered out with the cron noise. Re-run it without the content filter to
-- see it — and that outcome means this trigger carries the same stale secret
-- the other five jobs do (EC-4), not that the endpoint is broken.

-- ── reading the result ────────────────────────────────────────────────────
--
-- 200, body {"ok":true,"fetched":96,"upserted":96,...,"withActual":0}
--   → working. Schedule it: economic-calendar-cron.sql, host as-is.
--     withActual:0 is expected with this provider (EC-1), not a fault.
--
-- 200, body with "ok":false and a 429 in errors
--   → the upstream feed rate-limited us. Nothing was written, the table is
--     unchanged, and the next run picks it up. Do not retry in a loop; that is
--     what earns the 429. This is a live possibility today — the limit was
--     tripped during the investigation, not by anything wrong here.
--
-- timed_out = true at 30 s
--   → a hang, not slowness; 30 s is far past a cold start. Two candidates,
--     distinguishable by economic-calendar-cron-probe.sql: if the published
--     host's ROOT also times out it is reachability and the job belongs on the
--     project--<uuid> alias; if root answers, the hang is inside the handler —
--     most likely syncEconomicCalendar's fetch having no timeout of its own
--     and stalling on a rate-limited connection. Fix that in ingest.server.ts.
--     Do not raise the cron timeout a third time.
--
-- Then confirm rows landed with economic-calendar-cron-verify.sql.

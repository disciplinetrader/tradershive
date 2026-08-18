-- EC-4 — measure the outage before fixing it.
--
-- Root cause (found 2026-08-18): all five scheduled jobs send
--   headers := '{"Content-Type":"application/json","apikey":"sb_publishable_..."}'
-- but `checkCronAuth` reads `x-cron-secret` (or Authorization: Bearer). The
-- publishable key is not the cron secret and is not in a header the guard
-- looks at, so every call has always been rejected with 401. Nothing has run.
--
-- Run these in order. Each is standalone; nothing to substitute.

-- ── 1 · Why nobody noticed ────────────────────────────────────────────────
-- pg_cron records whether the SQL STATEMENT succeeded. `net.http_post` only
-- queues a request, so it succeeds instantly regardless of what the server
-- later says. Expect "succeeded" on jobs that have never once worked. This is
-- the monitoring blind spot, and it is the answer to "how did this survive".

select j.jobname, d.status, count(*) as runs,
       min(d.start_time) as first_run, max(d.start_time) as last_run
  from cron.job_run_details d
  join cron.job j on j.jobid = d.jobid
 group by j.jobname, d.status
 order by j.jobname, d.status;

-- ── 2 · How long, from the HTTP side ──────────────────────────────────────
-- The earliest surviving 401 bounds the outage. pg_net trims this table, so
-- treat the answer as "at least this long", never as the start date.

select min(created) as earliest_response,
       max(created) as latest_response,
       count(*)                                        as total,
       count(*) filter (where status_code = 401)       as unauthorized,
       count(*) filter (where status_code = 200)       as ok,
       count(*) filter (where timed_out)               as timed_out
  from net._http_response;

-- ── 3 · Email backlog ─────────────────────────────────────────────────────
-- email-queue has never dispatched. Everything queued since is still pending,
-- and `processQueueBatch` selects oldest-first with NO staleness filter — so
-- the first successful run after the fix starts sending weeks-old mail at
-- 50/minute. Read this BEFORE fixing anything.

select status, count(*),
       min(scheduled_for) as oldest,
       max(scheduled_for) as newest
  from public.email_queue
 group by status
 order by count(*) desc;

-- ── 4 · Battles never settled ─────────────────────────────────────────────
-- battle-settlement has never authenticated, so nothing has finalised battles
-- past their end_at. These are user-visible: a competition that never ends.

select status, count(*),
       min(end_at) as oldest_end_at,
       count(*) filter (where end_at < now()) as past_end_at
  from public.battles
 group by status
 order by count(*) desc;

-- ── 5 · Market data that was never backfilled ─────────────────────────────
-- historical-sync uses the same guard. Whether it is scheduled at all, query 1
-- answers. Either way this is why only 2 of 33 registered symbols have candles
-- — which is the sole reason MSYM-1 (multi-symbol replay) is parked. If this
-- is the cause, MSYM-1 may be unblocked by fixing a header.

select s.symbol, s.market, count(c.ts) as bars,
       min(c.ts) as first_bar, max(c.ts) as last_bar
  from public.historical_symbols s
  left join public.historical_candles c on c.symbol = s.symbol
 where s.is_enabled
 group by s.symbol, s.market
 order by bars desc, s.symbol;

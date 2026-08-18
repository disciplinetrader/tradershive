-- EC-2 verification. Run after the first scheduled fire (05:17 UTC).
--
-- 1 · Did the job authenticate?
--     Expect 200. A 401 means the x-cron-secret value does not match
--     CRON_SECRET; a 503 means CRON_SECRET is unset on the server.

select id, status_code, error_msg, created
  from net._http_response
 order by created desc
 limit 5;

-- 2 · Did rows actually land?
--     A 200 with an empty table would mean the upstream feed failed inside an
--     otherwise successful request. Expect roughly 90-100 rows spanning the
--     current week.

select count(*) as events,
       min(event_time) as window_from,
       max(event_time) as window_to,
       count(*) filter (where actual is not null) as with_actual
  from public.economic_events;

-- with_actual is expected to be 0. This provider serves no `actual` field at
-- all (measured 0 of 96, including 30 already-released events). It is a canary
-- for a future provider, not a fault — see EC-1.

-- 3 · Is the job registered as intended?

select jobid, jobname, schedule, active
  from cron.job
 where jobname = 'economic-calendar-daily';

-- 4 · Attributing pre-existing rows in net._http_response
--
-- That table records only requests pg_net made FROM THE DATABASE. An external
-- curl against the endpoint never appears there. So any 401s already present
-- came from other scheduled jobs, not from testing.
--
-- The response table does not retain the request URL, so attribute by job run
-- instead. If battle-tick is failing here, that is EC-3 territory and a live
-- issue in its own right — not something this change caused.

select j.jobname,
       d.status,
       d.return_message,
       d.start_time
  from cron.job_run_details d
  join cron.job j on j.jobid = d.jobid
 order by d.start_time desc
 limit 20;

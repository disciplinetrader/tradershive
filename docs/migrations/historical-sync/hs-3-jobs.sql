select triggered_by,
       status,
       phase,
       count(*)              as runs,
       sum(candles_inserted) as bars,
       max(created_at)       as latest
  from public.historical_import_jobs
 where created_at > now() - interval '1 hour'
 group by 1, 2, 3
 order by latest desc;

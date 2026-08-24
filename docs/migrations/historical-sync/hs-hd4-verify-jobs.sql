select j.triggered_by,
       j.status,
       j.phase,
       count(*)                as runs,
       sum(j.candles_inserted) as bars,
       max(j.created_at)       as last_seen
  from public.historical_import_jobs j
 where j.created_at > now() - interval '24 hours'
 group by 1, 2, 3
 order by 1, 2;

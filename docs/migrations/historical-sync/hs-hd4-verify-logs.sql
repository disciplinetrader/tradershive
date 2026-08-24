select l.created_at,
       l.level,
       l.message,
       l.metadata,
       l.symbol,
       j.triggered_by
  from public.historical_sync_logs l
  left join public.historical_import_jobs j on j.id = l.job_id
 where l.created_at > now() - interval '2 hours'
 order by l.created_at desc
 limit 60;

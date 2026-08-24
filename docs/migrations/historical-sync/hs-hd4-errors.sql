select j.triggered_by,
       left(j.error_message, 160) as message_head,
       count(*)                   as runs,
       count(distinct j.symbol)   as symbols,
       min(j.created_at)          as first_seen,
       max(j.created_at)          as last_seen,
       max(j.error_message)       as full_example
  from public.historical_import_jobs j
 where j.status = 'failed'
   and j.triggered_by in ('cron', 'cron:backfill')
   and j.created_at > now() - interval '24 hours'
 group by j.triggered_by, left(j.error_message, 160)
 order by last_seen desc, runs desc;

select j.created_at,
       j.triggered_by,
       j.symbol,
       j.timeframe,
       j.phase,
       j.retry_count,
       j.candles_fetched,
       j.candles_inserted,
       j.duration_ms,
       substring(j.error_message from '\(HTTP (\d+)\)') as http_status,
       j.range_from,
       j.range_to,
       j.error_message
  from public.historical_import_jobs j
 where j.status = 'failed'
   and j.triggered_by in ('cron', 'cron:backfill')
   and j.created_at > now() - interval '24 hours'
 order by j.created_at desc
 limit 40;

select j.triggered_by,
       case
         when j.error_message is null                                      then 'no_message'
         when j.error_message like '%(HTTP 429)%'                          then 'quota_429'
         when j.error_message ilike '%rate limit exceeded%'                then 'quota_429'
         when j.error_message ilike '%run out of api credits%'             then 'quota_429'
         when j.error_message ilike '%not included in the current%plan%'   then 'plan_gated'
         when j.error_message ilike '%available starting with%'            then 'plan_gated'
         when j.error_message ilike '%symbol or figi parameter%'           then 'bad_ticker'
         when j.error_message ilike '%no data is available%'               then 'empty_window_missed'
         when j.error_message ilike '%no data%'                            then 'empty_window_variant'
         when j.error_message ilike '%not available on the specified%'     then 'empty_window_variant'
         when j.error_message ilike '%non-JSON response%'                  then 'non_json'
         when j.error_message like '%(HTTP 5%'                             then 'upstream_5xx'
         when j.error_message ilike '%upstream request failed%'            then 'upstream_other'
         when j.error_message like '%(HTTP 200)%'                          then 'body_error_http200'
         when j.error_message not like '[twelvedata]%'                     then 'not_provider'
         else 'unclassified'
       end                            as failure_class,
       count(*)                       as runs,
       count(distinct j.symbol)       as symbols,
       max(j.created_at)              as last_seen
  from public.historical_import_jobs j
 where j.status = 'failed'
   and j.triggered_by in ('cron', 'cron:backfill')
   and j.created_at > now() - interval '24 hours'
 group by 1, 2
 order by runs desc;

select j.created_at,
       j.triggered_by,
       j.symbol,
       j.range_from,
       j.range_to,
       substring(j.error_message from '\(HTTP (\d+)\)') as http_status,
       j.error_message
  from public.historical_import_jobs j
 where j.status = 'failed'
   and j.triggered_by in ('cron', 'cron:backfill')
   and j.created_at > now() - interval '24 hours'
   and (j.error_message ilike '%no data%'
     or j.error_message ilike '%specified dates%'
     or j.error_message ilike '%not available%')
 order by j.created_at desc
 limit 40;

select j.symbol,
       j.triggered_by,
       count(*)                                      as failed_runs,
       max(j.created_at)                             as last_failure,
       max(j.retry_count)                            as max_retries_used,
       (array_agg(j.error_message order by j.created_at desc))[1] as latest_error
  from public.historical_import_jobs j
 where j.status = 'failed'
   and j.triggered_by in ('cron', 'cron:backfill')
   and j.created_at > now() - interval '24 hours'
 group by j.symbol, j.triggered_by
 order by j.symbol, j.triggered_by;

select j.created_at,
       j.triggered_by,
       j.symbol,
       j.phase,
       j.retry_count,
       j.metadata
  from public.historical_import_jobs j
 where j.status = 'failed'
   and j.error_message is null
   and j.created_at > now() - interval '24 hours'
 order by j.created_at desc
 limit 20;

select j.status,
       j.triggered_by,
       j.symbol,
       j.candles_inserted,
       j.created_at,
       j.finished_at
  from public.historical_import_jobs j
 where j.status <> 'failed'
   and j.triggered_by in ('cron', 'cron:backfill')
 order by j.created_at desc
 limit 10;

select date_trunc('day', j.created_at) as day,
       j.triggered_by,
       j.status,
       count(*)                        as runs,
       sum(j.candles_inserted)         as bars
  from public.historical_import_jobs j
 where j.triggered_by in ('cron', 'cron:backfill')
   and j.created_at > now() - interval '7 days'
 group by 1, 2, 3
 order by day desc, runs desc;

select l.created_at,
       l.level,
       l.symbol,
       j.triggered_by,
       l.message,
       l.metadata
  from public.historical_sync_logs l
  left join public.historical_import_jobs j on j.id = l.job_id
 where l.level in ('error', 'warn')
   and l.created_at > now() - interval '24 hours'
 order by l.created_at desc
 limit 40;

select cron.schedule(
  'historical-sync-15min',
  '*/15 * * * *',
  format(
    $cmd$select net.http_post(url:='https://tradershive.lovable.app/api/public/hooks/historical-sync',headers:='{"Content-Type":"application/json","x-cron-secret":"%s"}'::jsonb,body:='{}'::jsonb,timeout_milliseconds:=60000);$cmd$,
    s.secret
  )
) as jobid
from (
  select substring(command from '"x-cron-secret"\s*:\s*"([^"]+)"') as secret
    from cron.job where jobname = 'economic-calendar-daily'
) s
where length(s.secret) = 64;

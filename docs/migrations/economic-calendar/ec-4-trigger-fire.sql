select net.http_post(
  url := 'https://tradershive.lovable.app/api/public/hooks/economic-calendar',
  headers := format('{"Content-Type":"application/json","x-cron-secret":"%s"}', s.secret)::jsonb,
  body := '{}'::jsonb,
  timeout_milliseconds := 30000
) as request_id
from (
  select substring(command from '"x-cron-secret"\s*:\s*"([^"]+)"') as secret
    from cron.job where jobname = 'economic-calendar-daily'
) s
where length(s.secret) = 64;

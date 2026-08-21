select jobname,
       schedule,
       active,
       substring(command from 'https://[^'']*') as url,
       substring(command from '"x-cron-secret"\s*:\s*"([^"]+)"')
         = substring((select command from cron.job where jobname = 'economic-calendar-daily')
                     from '"x-cron-secret"\s*:\s*"([^"]+)"') as secret_matches
  from cron.job
 order by jobname;

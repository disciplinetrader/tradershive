select (select count(*) from cron.job) as jobs_now,
       (select count(*) from cron.job where jobname = 'historical-sync-15min') as already_exists,
       length((select substring(command from '"x-cron-secret"\s*:\s*"([^"]+)"')
                 from cron.job where jobname = 'economic-calendar-daily')) as secret_len;

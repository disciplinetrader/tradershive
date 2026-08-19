select jobname, substring(command from 'x-cron-secret"\s*:\s*"([^"]+)') as stored_secret
from cron.job;

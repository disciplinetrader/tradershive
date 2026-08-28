-- Can a secret be extracted at all? Run this FIRST.
--
-- ec-4 guards the fire on `length(secret) = 64`. If no cron job matches, or the
-- secret is a different length, that guard makes the fire match zero rows and
-- report success having sent nothing — the same silent no-op that made
-- `historical-sync?symbol=` useless. This prints the length, never the secret.
select jobname,
       length(substring(command from '"x-cron-secret"\s*:\s*"([^"]+)"')) as secret_len
  from cron.job
 where command like '%x-cron-secret%'
 order by jobname;

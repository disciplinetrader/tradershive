-- Q-G2 — Do all HTTP jobs carry the SAME secret? (boolean only, no value)
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 31 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-G2  Do all HTTP jobs carry the SAME secret? (boolean only, no value)
SELECT j.jobname,
       md5(coalesce(substring(j.command from '"x-cron-secret"\s*:\s*"([^"]*)"'), ''))
         = (SELECT md5(coalesce(substring(k.command from '"x-cron-secret"\s*:\s*"([^"]*)"'), ''))
              FROM cron.job k
             WHERE k.command ~ '"x-cron-secret"'
             ORDER BY k.jobid LIMIT 1) AS same_secret_as_first_job
  FROM cron.job j
 WHERE j.command ~ '"x-cron-secret"'
 ORDER BY j.jobname;

-- Q-G3 — Statement-level run history per job (NB: "succeeded" ≠ HTTP success — BA-3)
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 32 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-G3  Statement-level run history per job (NB: "succeeded" ≠ HTTP success — BA-3)
SELECT j.jobname, d.status, count(*) AS runs,
       min(d.start_time) AS first_run, max(d.start_time) AS last_run
  FROM cron.job_run_details d
  JOIN cron.job j ON j.jobid = d.jobid
 WHERE d.start_time > now() - interval '7 days'
 GROUP BY j.jobname, d.status
 ORDER BY j.jobname, d.status;

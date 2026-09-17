-- Q-F1 — Any cron job that references championship functions or hooks
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 26 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-F1  Any cron job that references championship functions or hooks
SELECT jobid, jobname, schedule, active,
       (command ILIKE '%tick_championships%')   AS calls_tick_championships,
       (command ILIKE '%start_championship%')   AS calls_start_championship,
       (command ILIKE '%finalize_championship%') AS calls_finalize_championship,
       (command ILIKE '%championship%')          AS mentions_championship
  FROM cron.job
 ORDER BY jobname;

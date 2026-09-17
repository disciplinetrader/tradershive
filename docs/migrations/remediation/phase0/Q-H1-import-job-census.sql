-- Q-H1 — Job census by trigger source / status, last 7 days
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 35 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-H1  Job census by trigger source / status, last 7 days
SELECT triggered_by, status, phase, source_code, count(*) AS jobs,
       sum(candles_inserted) AS bars_inserted,
       max(created_at) AS latest
  FROM public.historical_import_jobs
 WHERE created_at > now() - interval '7 days'
 GROUP BY 1, 2, 3, 4
 ORDER BY latest DESC;

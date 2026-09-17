-- Q-H3 — Failure classes, last 7 days (message prefix only)
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 37 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-H3  Failure classes, last 7 days (message prefix only)
SELECT source_code, triggered_by, left(coalesce(error_message, '(null)'), 80) AS error_prefix,
       count(*) AS n, max(created_at) AS latest
  FROM public.historical_import_jobs
 WHERE status IN ('failed','error') AND created_at > now() - interval '7 days'
 GROUP BY 1, 2, 3
 ORDER BY n DESC
 LIMIT 50;

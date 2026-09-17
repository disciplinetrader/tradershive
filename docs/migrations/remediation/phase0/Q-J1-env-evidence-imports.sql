-- Q-J1 — Evidence of service-role + Twelve Data key: recent successful server-side imports
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 58 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-J1  Evidence of service-role + Twelve Data key: recent successful server-side imports
SELECT source_code, triggered_by,
       count(*) FILTER (WHERE status='success') AS success_24h,
       count(*) FILTER (WHERE status IN ('failed','error')) AS failed_24h,
       max(finished_at) FILTER (WHERE status='success') AS last_success
  FROM public.historical_import_jobs
 WHERE created_at > now() - interval '24 hours'
 GROUP BY 1, 2
 ORDER BY 1, 2;

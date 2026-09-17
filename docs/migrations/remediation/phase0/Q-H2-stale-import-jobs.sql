-- Q-H2 — Stale 'running' / 'queued' jobs (HD-6)
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 36 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-H2  Stale 'running' / 'queued' jobs (HD-6)
SELECT id, symbol, timeframe, source_code, triggered_by, status, phase, progress,
       created_at, started_at, updated_at,
       round(extract(epoch FROM (now() - coalesce(updated_at, started_at, created_at))) / 60) AS minutes_since_progress
  FROM public.historical_import_jobs
 WHERE status IN ('running','queued','pending','processing')
   AND coalesce(updated_at, started_at, created_at) < now() - interval '30 minutes'
 ORDER BY minutes_since_progress DESC
 LIMIT 200;

-- Q-J2 — Evidence of CRON_SECRET matching: side effects of each hook in the last 24h
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 59 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-J2  Evidence of CRON_SECRET matching: side effects of each hook in the last 24h
SELECT 'battles completed near end_at (cron-like)' AS signal,
       count(*) FILTER (WHERE status='completed' AND updated_at > now() - interval '24 hours') AS n
  FROM public.battles
UNION ALL
SELECT 'economic_events updated', count(*) FROM public.economic_events WHERE updated_at > now() - interval '24 hours'
UNION ALL
SELECT 'historical jobs triggered_by cron%', count(*) FROM public.historical_import_jobs
 WHERE triggered_by LIKE 'cron%' AND created_at > now() - interval '24 hours'
UNION ALL
SELECT 'email_queue status changed', count(*) FROM public.email_queue WHERE updated_at > now() - interval '24 hours';

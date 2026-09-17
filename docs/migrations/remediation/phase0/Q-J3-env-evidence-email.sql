-- Q-J3 — Evidence of email provider behaviour (noop marks 'sent' — O-1)
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 60 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-J3  Evidence of email provider behaviour (noop marks 'sent' — O-1)
SELECT status, count(*) AS n, max(sent_at) AS last_sent, max(updated_at) AS last_update,
       count(*) FILTER (WHERE status='processing' AND locked_at < now() - interval '30 minutes') AS stuck_processing
  FROM public.email_queue
 GROUP BY status
 ORDER BY n DESC;

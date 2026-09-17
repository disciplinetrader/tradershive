-- Q-E1 — Battle status census incl. overdue / stuck categories
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 20 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-E1  Battle status census incl. overdue / stuck categories
SELECT status,
       count(*) AS battles,
       count(*) FILTER (WHERE status = 'live' AND end_at < now() - interval '5 minutes') AS live_past_end_5m,
       count(*) FILTER (WHERE status IN ('open','filling','upcoming','ready')
                          AND start_at < now() - interval '1 hour')                     AS pre_live_start_passed_1h,
       min(end_at) FILTER (WHERE status = 'live') AS oldest_live_end_at,
       max(updated_at) AS last_update
  FROM public.battles
 GROUP BY status
 ORDER BY battles DESC;

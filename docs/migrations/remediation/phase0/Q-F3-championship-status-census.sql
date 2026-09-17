-- Q-F3 — Championship state census — overdue transitions are evidence of no scheduler
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 28 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-F3  Championship state census — overdue transitions are evidence of no scheduler
SELECT status, count(*) AS n,
       count(*) FILTER (WHERE status IN ('upcoming','registration') AND start_at < now()) AS should_have_started,
       count(*) FILTER (WHERE status = 'live' AND end_at < now())                                    AS should_have_finalized,
       min(start_at) AS earliest_start, max(end_at) AS latest_end, max(updated_at) AS last_update
  FROM public.championships
 GROUP BY status
 ORDER BY n DESC;

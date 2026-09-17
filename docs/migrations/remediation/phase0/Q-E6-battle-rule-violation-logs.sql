-- Q-E6 — Battle rule-violation log volume (shows whether the INSERT trigger is live and firing)
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 25 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-E6  Battle rule-violation log volume (shows whether the INSERT trigger is live and firing)
SELECT event_type, count(*) AS n, max(created_at) AS latest
  FROM public.battle_logs
 GROUP BY event_type
 ORDER BY n DESC;

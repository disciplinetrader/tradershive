-- Q-E2 — Stuck below min_participants (B-3): start passed, never reached min
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 21 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-E2  Stuck below min_participants (B-3): start passed, never reached min
SELECT b.status, count(*) AS stuck_battles,
       min(b.start_at) AS oldest_start, max(b.start_at) AS newest_start
  FROM public.battles b
  LEFT JOIN LATERAL (SELECT count(*) AS n FROM public.battle_participants p WHERE p.battle_id = b.id) pc ON true
 WHERE b.status IN ('open','filling','upcoming','ready')
   AND b.start_at < now()
   AND pc.n < coalesce(b.min_participants, 2)
 GROUP BY b.status;

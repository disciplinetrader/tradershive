-- Q-E4 — Early finalizations detail (B-2): completed before scheduled end, with winner=host
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 23 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-E4  Early finalizations detail (B-2): completed before scheduled end, with winner=host
SELECT b.id, b.name, b.end_at, b.updated_at AS completed_at, b.ranked,
       (b.winner_user_id = b.host_id) AS host_won,
       (SELECT count(*) FROM public.battle_participants p WHERE p.battle_id = b.id) AS participants
  FROM public.battles b
 WHERE b.status = 'completed' AND b.updated_at < b.end_at
 ORDER BY b.updated_at DESC
 LIMIT 200;

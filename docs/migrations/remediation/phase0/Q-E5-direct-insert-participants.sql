-- Q-E5 — Direct-insert participants (policy "bp insert self" path): participants of
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 24 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-E5  Direct-insert participants (policy "bp insert self" path): participants of
--       private / full / non-joinable battles, or joined after battle ended
SELECT b.id AS battle_id, b.visibility, b.status, b.max_participants,
       p.user_id, p.joined_at, b.start_at, b.end_at,
       (p.joined_at > b.end_at) AS joined_after_end,
       (SELECT count(*) FROM public.battle_participants x WHERE x.battle_id = b.id) AS participant_count
  FROM public.battle_participants p
  JOIN public.battles b ON b.id = p.battle_id
 WHERE p.joined_at > b.end_at
    OR (SELECT count(*) FROM public.battle_participants x WHERE x.battle_id = b.id) > coalesce(b.max_participants, 1000000)
 ORDER BY p.joined_at DESC
 LIMIT 200;

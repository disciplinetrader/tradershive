-- Q-I12 — Rewards recorded but never paid (B-4): battle_results xp vs xp ledger
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 56 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-I12  Rewards recorded but never paid (B-4): battle_results xp vs xp ledger
SELECT count(*) AS results_with_xp,
       count(*) FILTER (WHERE NOT EXISTS (
         SELECT 1 FROM public.xp_transactions x
          WHERE x.user_id = r.user_id AND x.source_id::text = r.battle_id::text)) AS no_matching_xp_ledger,
       sum(r.xp_awarded) AS xp_recorded, sum(r.coins_awarded) AS coins_recorded
  FROM public.battle_results r
 WHERE coalesce(r.xp_awarded,0) > 0;

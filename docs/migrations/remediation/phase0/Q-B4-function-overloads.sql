-- Q-B4 — Overload check — stale overloads survive CREATE OR REPLACE with a new signature
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 12 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-B4  Overload check — stale overloads survive CREATE OR REPLACE with a new signature
SELECT p.proname, count(*) AS overloads,
       string_agg(p.oid::regprocedure::text, ' ; ' ORDER BY p.oid) AS signatures
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('join_battle','finalize_battle','tick_battle','commit_settlement','_join_battle_as',
                     'register_for_championship','join_championship_live','recompute_battle_ranking')
 GROUP BY p.proname
 ORDER BY p.proname;

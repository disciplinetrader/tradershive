-- Q-F2 — Any OTHER database function that calls the lifecycle functions
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 27 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-F2  Any OTHER database function that calls the lifecycle functions
--       (e.g. a scheduled wrapper), excluding the functions themselves
SELECT p.oid::regprocedure AS caller,
       p.prosrc ILIKE '%tick_championships%'    AS calls_tick,
       p.prosrc ILIKE '%start_championship%'    AS calls_start,
       p.prosrc ILIKE '%finalize_championship%' AS calls_finalize
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname NOT IN ('tick_championships','start_championship','finalize_championship')
   AND (p.prosrc ILIKE '%tick_championships%' OR p.prosrc ILIKE '%start_championship%'
        OR p.prosrc ILIKE '%finalize_championship%');

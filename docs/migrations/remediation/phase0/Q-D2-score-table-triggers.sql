-- Q-D2 — All non-internal triggers on score-relevant tables, with definitions
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 17 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-D2  All non-internal triggers on score-relevant tables, with definitions
SELECT c.relname AS table_name, t.tgname,
       CASE t.tgenabled WHEN 'O' THEN 'enabled' WHEN 'D' THEN 'DISABLED'
                        WHEN 'R' THEN 'replica-only' WHEN 'A' THEN 'always' END AS state,
       pg_get_triggerdef(t.oid) AS definition,
       t.tgfoid::regprocedure AS function
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND NOT t.tgisinternal
   AND c.relname IN ('profiles','paper_trades','paper_accounts','prop_challenges','prop_challenge_days',
                     'battle_participants','battle_results','battle_rankings','championship_rankings',
                     'journal_entries','account_statistics')
 ORDER BY c.relname, t.tgname;

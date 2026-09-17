-- Q-A1 — RLS enabled / forced for the Phase 0 tables (+ score-adjacent tables)
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 3 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-A1  RLS enabled / forced for the Phase 0 tables (+ score-adjacent tables)
SELECT c.relname AS table_name,
       c.relrowsecurity      AS rls_enabled,
       c.relforcerowsecurity AS rls_forced,
       pg_get_userbyid(c.relowner) AS owner
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relkind = 'r'
   AND c.relname IN ('paper_trades','paper_accounts','account_statistics','position_history',
                     'prop_challenges','prop_challenge_days',
                     'battles','battle_participants','battle_results','battle_rankings','elo_history',
                     'championships','championship_participants','championship_rankings','championship_rewards',
                     'profiles','xp_transactions','coin_transactions',
                     'journal_entries','historical_candles','historical_import_jobs',
                     'provider_market_assignments','matchmaking_queue')
 ORDER BY c.relname;

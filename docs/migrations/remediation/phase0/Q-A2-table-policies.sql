-- Q-A2 — Every installed policy on those tables (full text)
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 4 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-A2  Every installed policy on those tables (full text)
SELECT tablename, policyname, permissive, roles, cmd,
       qual       AS using_expr,
       with_check AS with_check_expr
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('paper_trades','paper_accounts','account_statistics','position_history',
                     'prop_challenges','prop_challenge_days',
                     'battles','battle_participants','battle_results','battle_rankings','elo_history',
                     'championships','championship_participants','championship_rankings','championship_rewards',
                     'profiles','xp_transactions','coin_transactions',
                     'journal_entries','historical_candles','historical_import_jobs',
                     'provider_market_assignments','matchmaking_queue')
 ORDER BY tablename, cmd, policyname;

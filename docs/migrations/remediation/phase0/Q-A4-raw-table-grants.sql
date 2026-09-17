-- Q-A4 — Raw grants (who granted what, incl. PUBLIC) — distinguishes explicit grants
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 6 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-A4  Raw grants (who granted what, incl. PUBLIC) — distinguishes explicit grants
SELECT table_name, grantee, privilege_type, is_grantable
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND grantee IN ('PUBLIC','anon','authenticated')
   AND table_name IN ('paper_trades','paper_accounts','account_statistics','prop_challenges','prop_challenge_days',
                      'battle_participants','battle_results','battle_rankings','profiles','journal_entries',
                      'historical_candles','championship_rankings','elo_history','xp_transactions','coin_transactions')
 ORDER BY table_name, grantee, privilege_type;

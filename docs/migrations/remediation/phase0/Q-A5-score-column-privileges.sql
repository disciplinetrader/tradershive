-- Q-A5 — Column-level UPDATE/INSERT privilege on score-authoritative columns
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 7 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-A5  Column-level UPDATE/INSERT privilege on score-authoritative columns
--       for authenticated. TRUE here + a permissive UPDATE policy + no blocking
--       trigger (Q-D2) = the user can modify that column directly.
WITH cols(tbl, col) AS (VALUES
  ('paper_trades','pnl'),('paper_trades','pnl_pct'),('paper_trades','exit_price'),('paper_trades','entry_price'),
  ('paper_trades','status'),('paper_trades','closed_at'),('paper_trades','opened_at'),('paper_trades','created_at'),
  ('paper_trades','battle_id'),('paper_trades','championship_id'),('paper_trades','lot_size'),('paper_trades','rr_realized'),
  ('paper_accounts','balance'),('paper_accounts','equity'),('paper_accounts','starting_balance'),
  ('paper_accounts','negative_balance_protection'),('paper_accounts','battle_id'),('paper_accounts','championship_id'),
  ('account_statistics','net_pnl'),('account_statistics','total_trades'),('account_statistics','win_rate'),
  ('prop_challenges','status'),('prop_challenges','result'),('prop_challenges','current_equity'),
  ('prop_challenges','peak_equity'),('prop_challenges','lowest_equity'),('prop_challenges','trading_days_used'),
  ('prop_challenges','breach_reason'),('prop_challenges','completed_at'),('prop_challenges','paper_account_id'),
  ('prop_challenge_days','breached'),('prop_challenge_days','end_equity'),('prop_challenge_days','start_equity'),
  ('battle_participants','battle_id'),('battle_participants','paper_account_id'),('battle_participants','status'),
  ('battle_results','pnl'),('battle_results','final_rank'),('battle_results','xp_awarded'),
  ('battle_rankings','pnl'),('battle_rankings','score'),('battle_rankings','rank'),
  ('championship_rankings','pnl'),('championship_rankings','score'),('championship_rankings','rank'),
  ('profiles','elo'),('profiles','peak_elo'),('profiles','battle_wins'),('profiles','battles_played'),
  ('profiles','current_battle_streak'),('profiles','best_battle_streak'),('profiles','xp'),('profiles','coins'),
  ('profiles','level'),('profiles','league'),('profiles','rank'),('profiles','streak'),('profiles','is_premium'))
SELECT tbl, col,
       has_column_privilege('authenticated', format('public.%I', tbl), col, 'UPDATE') AS auth_update,
       has_column_privilege('authenticated', format('public.%I', tbl), col, 'INSERT') AS auth_insert,
       has_column_privilege('anon',          format('public.%I', tbl), col, 'UPDATE') AS anon_update
  FROM cols
 WHERE to_regclass(format('public.%I', tbl)) IS NOT NULL
 ORDER BY tbl, col;

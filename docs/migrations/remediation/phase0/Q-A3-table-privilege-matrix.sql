-- Q-A3 — Table-level privilege matrix for anon / authenticated / service_role
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 5 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-A3  Table-level privilege matrix for anon / authenticated / service_role
--       (has_table_privilege includes PUBLIC and role-membership inheritance)
WITH t(name) AS (VALUES ('paper_trades'),('paper_accounts'),('account_statistics'),('position_history'),
                        ('prop_challenges'),('prop_challenge_days'),
                        ('battles'),('battle_participants'),('battle_results'),('battle_rankings'),('elo_history'),
                        ('championships'),('championship_participants'),('championship_rankings'),('championship_rewards'),
                        ('profiles'),('xp_transactions'),('coin_transactions'),
                        ('journal_entries'),('historical_candles'),('historical_import_jobs'),
                        ('provider_market_assignments'),('matchmaking_queue')),
     r(role) AS (VALUES ('anon'),('authenticated'),('service_role'))
SELECT t.name AS table_name, r.role,
       has_table_privilege(r.role, format('public.%I', t.name), 'SELECT') AS sel,
       has_table_privilege(r.role, format('public.%I', t.name), 'INSERT') AS ins,
       has_table_privilege(r.role, format('public.%I', t.name), 'UPDATE') AS upd,
       has_table_privilege(r.role, format('public.%I', t.name), 'DELETE') AS del,
       has_table_privilege(r.role, format('public.%I', t.name), 'TRUNCATE') AS trunc
  FROM t CROSS JOIN r
 WHERE to_regclass(format('public.%I', t.name)) IS NOT NULL
 ORDER BY t.name, r.role;

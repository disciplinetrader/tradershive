-- =============================================================================
-- TradersHIVE remediation — Phase 0 read-only live verification package
-- Generated 2026-09-17 against repo commit 99644e0d (branch claude-tradershive-audit)
-- Companion report: _bmad-output/planning-artifacts/phase-0-live-verification.md
-- =============================================================================
--
-- READ-ONLY GUARANTEE
--   Every statement below is a single SELECT (optionally with WITH-CTEs).
--   No INSERT/UPDATE/DELETE/MERGE, no DDL, no GRANT/REVOKE, no SET, no
--   function that writes (no cron.schedule, no net.http_*, no RPC that
--   mutates). Catalog helpers used — has_*_privilege, pg_get_functiondef,
--   pg_get_triggerdef, aclexplode, md5 — are side-effect free.
--
--   Optional belt-and-braces: if your SQL client supports it, run the package
--   inside   START TRANSACTION READ ONLY;  …  ROLLBACK;
--   Any accidental write then fails with 25006. The Lovable SQL editor runs
--   statements individually, so that wrapper is not included as a statement.
--
-- HOW TO RUN (Lovable SQL editor — see docs/migrations/README.md)
--   * Paste ONE query at a time (the editor truncates long pastes and still
--     reports success). Each query is delimited by a  -- Q-xx  header.
--   * Nothing to substitute. No placeholders.
--   * Run as the editor's default (owner/postgres) role so catalogs are visible.
--   * Save each result (CSV or copy) as
--       docs/migrations/remediation/phase0-results/2026-MM-DD_Q-xx.csv
--     The report cites results by Q-id.
--
-- SECRETS
--   No query selects a secret value. cron commands are passed through a
--   redaction expression; secret presence is reported as a LENGTH or boolean.
--   Do NOT run docs/migrations/check-stored-secret.sql for this phase — it
--   prints the stored cron secret.
--
-- HEAVY QUERIES
--   Section I (suspicious data) scans paper_trades / position_history.
--   Q-I* are bounded with LIMIT 200 for row output; counts are unbounded.
--   Run them off-peak.
-- =============================================================================


-- #############################################################################
-- SECTION 0 — Session / environment context
-- #############################################################################

-- Q-00a  Server version, current role, database, time
SELECT version() AS pg_version,
       current_user AS run_as,
       current_database() AS db,
       now() AS captured_at;

-- Q-00b  Installed extensions relevant to this phase
SELECT extname, extversion
  FROM pg_extension
 WHERE extname IN ('pg_cron','pg_net','supabase_vault','pgsodium','pgcrypto','pg_graphql')
 ORDER BY extname;


-- #############################################################################
-- SECTION A — RLS state, policies, table and column privileges
-- #############################################################################

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

-- Q-A4  Raw grants (who granted what, incl. PUBLIC) — distinguishes explicit grants
SELECT table_name, grantee, privilege_type, is_grantable
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND grantee IN ('PUBLIC','anon','authenticated')
   AND table_name IN ('paper_trades','paper_accounts','account_statistics','prop_challenges','prop_challenge_days',
                      'battle_participants','battle_results','battle_rankings','profiles','journal_entries',
                      'historical_candles','championship_rankings','elo_history','xp_transactions','coin_transactions')
 ORDER BY table_name, grantee, privilege_type;

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

-- Q-A6  Derived: can authenticated directly write each table under RLS?
--       (a privilege AND at least one permissive policy for that command that
--        applies to authenticated or public)
WITH t(name) AS (VALUES ('paper_trades'),('paper_accounts'),('account_statistics'),('prop_challenges'),
                        ('prop_challenge_days'),('battle_participants'),('battle_results'),('battle_rankings'),
                        ('championship_rankings'),('profiles'),('journal_entries'),('historical_candles')),
     c(cmd) AS (VALUES ('INSERT'),('UPDATE'),('DELETE'),('SELECT'))
SELECT t.name AS table_name, c.cmd,
       has_table_privilege('authenticated', format('public.%I', t.name), c.cmd) AS has_priv,
       EXISTS (SELECT 1 FROM pg_policies p
                WHERE p.schemaname='public' AND p.tablename=t.name
                  AND p.permissive='PERMISSIVE'
                  AND p.cmd IN (c.cmd,'ALL')
                  AND (p.roles && ARRAY['authenticated','public']::name[])) AS has_policy,
       (SELECT string_agg(p.policyname || ' [' || p.cmd || '] USING(' || coalesce(p.qual,'-') ||
                          ') CHECK(' || coalesce(p.with_check,'-') || ')', ' | ')
          FROM pg_policies p
         WHERE p.schemaname='public' AND p.tablename=t.name
           AND p.cmd IN (c.cmd,'ALL')
           AND (p.roles && ARRAY['authenticated','public']::name[])) AS policies
  FROM t CROSS JOIN c
 WHERE to_regclass(format('public.%I', t.name)) IS NOT NULL
 ORDER BY t.name, c.cmd;


-- #############################################################################
-- SECTION B — Function EXECUTE privileges (PUBLIC / anon / authenticated / service_role)
-- #############################################################################

-- Q-B1  Target functions, every overload
--       public_explicit: PUBLIC holds EXECUTE (proacl NULL = default = PUBLIC has it)
SELECT p.oid::regprocedure AS signature,
       p.prosecdef AS security_definer,
       pg_get_userbyid(p.proowner) AS owner,
       p.proconfig AS config,               -- expect {search_path=public}
       (p.proacl IS NULL
        OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                    WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')) AS public_exec,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_exec,
       has_function_privilege('service_role',  p.oid, 'EXECUTE') AS service_role_exec,
       p.proacl::text AS raw_acl
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('commit_settlement','_join_battle_as','join_battle','join_battle_by_code',
                     'finalize_battle','tick_battle','tick_battles',
                     'start_championship','finalize_championship','tick_championships',
                     'emit_championship_activity','recompute_battle_ranking','recompute_championship_ranking',
                     'register_for_championship','join_championship_live','cancel_championship_registration',
                     'is_battle_host','is_battle_participant','emit_battle_event','recompute_battle_live_stats',
                     'calculate_elo_change','record_practice_activity','bump_ai_rate_limit')
 ORDER BY p.proname, signature;

-- Q-B2  Full map: EVERY public SECURITY DEFINER function callable by anon or authenticated
--       (answers S-4 / C-7 beyond the named list)
SELECT p.oid::regprocedure AS signature,
       (p.proacl IS NULL
        OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                    WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')) AS public_exec,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_exec,
       p.proconfig AS config,
       pg_get_userbyid(p.proowner) AS owner
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.prosecdef
   AND (has_function_privilege('anon', p.oid, 'EXECUTE')
        OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
 ORDER BY anon_exec DESC, signature;

-- Q-B3  Default privileges — root cause for newly created functions being exposed (C-7)
SELECT pg_get_userbyid(d.defaclrole) AS for_role,
       d.defaclnamespace::regnamespace AS in_schema,
       CASE d.defaclobjtype WHEN 'f' THEN 'functions' WHEN 'r' THEN 'tables'
                            WHEN 'S' THEN 'sequences' WHEN 'T' THEN 'types'
                            WHEN 'n' THEN 'schemas' ELSE d.defaclobjtype::text END AS object_type,
       d.defaclacl::text AS acl
  FROM pg_default_acl d
 ORDER BY for_role, in_schema, object_type;

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


-- #############################################################################
-- SECTION C — SECURITY DEFINER definitions vs repository
-- #############################################################################

-- Q-C1  Fingerprint comparison. repo_md5 = md5 of the function body from the
--       LATEST repo migration defining it, whitespace-collapsed and trimmed.
--       live_md5 uses the identical normalisation on prosrc.
--       match = true  -> live body equals repo body (modulo whitespace)
--       match = false -> DIFFERS: run Q-C2 for that function and diff by hand
--       live missing  -> function absent live (migration not applied)
WITH repo(sig, repo_md5, repo_file) AS (VALUES
  ('_join_battle_as(uuid,uuid)',                 'db7d7f95b4c0fa3f9146e65b7bdefb7d','20260905000001_ba1_matchmaking_fix.sql'),
  ('commit_settlement(uuid,uuid,numeric)',       '77d2b30c055367503aab0206ae2cd79a','20260903120000_commit_settlement.sql'),
  ('emit_championship_activity',                 '62ee45b5af7b7b5d6d4be9d8376dfaeb','20260718092213_0ff6e846-….sql'),
  ('enforce_battle_rules_on_trade()',            '88315c4e54b21e2fc0cc7e9164074934','20260808150000_battle_replay_trades.sql'),
  ('finalize_battle(uuid)',                      '04f6b9eedc7f76f4644b09e921e89bad','20260903120001_auth_guard_battle.sql'),
  ('finalize_championship(uuid)',                '905c887d70b87ce1bf2dd367fe967da0','20260718092213_0ff6e846-….sql'),
  ('has_permission(uuid,text)',                  '946dc8fe97bbf31e136e1a5a744332ab','20260717105748_1dd20085-….sql'),
  ('is_platform_admin(uuid)',                    '090a52c0a72324ffd81d30c97466b8a0','20260717105748_1dd20085-….sql'),
  ('join_battle(uuid)',                          'b2d0bab23a0d40e7aaadee97cc15c9d9','20260805094542_a841c48b-….sql'),
  ('join_battle(uuid,boolean)',                  'b9e0e869bd922ab18d59842949a7c312','20260905000001_ba1_matchmaking_fix.sql'),
  ('join_battle_by_code(text)',                  '18745d342fe89fd9780159d163b5672f','20260807102317_battle_arena_state_machine.sql'),
  ('join_championship_live(uuid)',               '061e179876c8a3ce9f02ab7224bd97a5','20260720064256_cb309e0c-….sql'),
  ('protect_profile_privileged_columns()',       'e3beb795e8eb559c413207610560a20f','20260727104342_d0d86be6-….sql'),
  ('recompute_battle_ranking(uuid,uuid)',        '524368524cb6204a2767663d5c72f9b1','20260805113333_ebab07fc-….sql'),
  ('recompute_championship_ranking(uuid,uuid)',  '309dd17bc8652a88164c9a8bc80885a4','20260718092213_0ff6e846-….sql'),
  ('register_for_championship(uuid)',            'c24082dd449cd9ed4fc3010ac5517551','20260718092213_0ff6e846-….sql'),
  ('set_trade_championship_id()',                '007336c963e0b97eb0a5a142a7c7211c','20260718092213_0ff6e846-….sql'),
  ('start_championship(uuid)',                   '122afded6f0d54aa8b1694d0209152f3','20260718092213_0ff6e846-….sql'),
  ('tick_battle(uuid)',                          '2234ab6e344d6cb49677d4b95bbb10fd','20260807102317_battle_arena_state_machine.sql'),
  ('tick_battles()',                             '43eabfc8826f815e030b35e63b663c50','20260905000001_ba1_matchmaking_fix.sql'),
  ('tick_championships()',                       '34fc0abffdd8a1944acde3232e5e9e4e','20260718092213_0ff6e846-….sql'),
  ('trg_recompute_battle_ranking()',             'f90d66410150bf88acd9849e1647dfdf','20260718081017_11f8d855-….sql'),
  ('trg_recompute_championship_ranking()',       '1ae6ac35795129ab3ed67e6f55fe94c3','20260718092213_0ff6e846-….sql')
),
live AS (
  SELECT p.proname || '(' || coalesce((SELECT string_agg(format_type(t, NULL), ',' ORDER BY ord)
                                         FROM unnest(p.proargtypes::oid[]) WITH ORDINALITY u(t, ord)), '') || ')' AS sig,
         p.proname,
         md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) AS live_md5,
         p.prosecdef, p.proconfig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
)
SELECT r.sig AS repo_signature, r.repo_file,
       l.sig AS live_signature,
       r.repo_md5, l.live_md5,
       CASE WHEN l.live_md5 IS NULL THEN 'LIVE MISSING'
            WHEN l.live_md5 = r.repo_md5 THEN 'MATCH'
            ELSE 'DIFFERS' END AS verdict,
       l.prosecdef AS live_security_definer,
       l.proconfig AS live_config
  FROM repo r
  LEFT JOIN live l
    ON l.sig = r.sig
    OR (r.sig = 'emit_championship_activity' AND l.proname = 'emit_championship_activity')
 ORDER BY verdict DESC, r.sig;

-- Q-C2  Full live definitions of the settlement / battle / championship / profile
--       functions (needed for rollback snapshots and for any DIFFERS verdict).
--       Output is large; export as file.
SELECT p.oid::regprocedure AS signature,
       pg_get_functiondef(p.oid) AS live_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('commit_settlement','_join_battle_as','join_battle','join_battle_by_code',
                     'finalize_battle','tick_battle','tick_battles',
                     'start_championship','finalize_championship','tick_championships',
                     'emit_championship_activity','recompute_battle_ranking','recompute_championship_ranking',
                     'protect_profile_privileged_columns','enforce_battle_rules_on_trade',
                     'set_trade_championship_id','set_trade_battle_id_from_account',
                     'trg_recompute_championship_ranking','trg_recompute_battle_ranking',
                     'register_for_championship','join_championship_live')
 ORDER BY p.proname, signature;

-- Q-C3  Static risk flags on live SECURITY DEFINER bodies (heuristic, read-only)
--       takes_user_param: has a uuid argument named like *user* / *account*
--       uses_auth_uid:    body references auth.uid()
--       null_uid_trust:   body treats auth.uid() IS NULL as a trusted path
--       no_search_path:   no search_path pinned in proconfig
SELECT p.oid::regprocedure AS signature,
       EXISTS (SELECT 1 FROM unnest(coalesce(p.proargnames, ARRAY[]::text[])) a
                WHERE a ILIKE '%user%' OR a ILIKE '%account%') AS takes_user_or_account_param,
       p.prosrc ILIKE '%auth.uid()%'                            AS uses_auth_uid,
       p.prosrc ~* 'auth\.uid\(\)\s+is\s+(not\s+)?null'         AS null_uid_branch,
       p.prosrc ILIKE '%request.jwt.claim.role%'                AS reads_legacy_role_guc,
       p.prosrc ILIKE '%request.jwt.claims%'                    AS reads_claims_guc,
       NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) c
                    WHERE c LIKE 'search_path=%')               AS no_search_path,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_exec
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.prosecdef
 ORDER BY (has_function_privilege('authenticated', p.oid, 'EXECUTE')
           AND EXISTS (SELECT 1 FROM unnest(coalesce(p.proargnames, ARRAY[]::text[])) a
                        WHERE a ILIKE '%user%' OR a ILIKE '%account%')) DESC,
          signature;


-- #############################################################################
-- SECTION D — Profile integrity (RLS + protection trigger)
-- #############################################################################

-- Q-D1  profiles policies (subset of Q-A2, repeated for a self-contained D result)
SELECT policyname, permissive, roles, cmd, qual AS using_expr, with_check AS with_check_expr
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'profiles'
 ORDER BY cmd, policyname;

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

-- Q-D3  Protection coverage: which competitive profile columns does the LIVE
--       protect trigger actually reset? (text search of the live body)
WITH cols(col) AS (VALUES ('elo'),('peak_elo'),('battle_wins'),('battles_played'),
                          ('current_battle_streak'),('best_battle_streak'),
                          ('xp'),('coins'),('level'),('league'),('rank'),('streak'),('is_premium')),
     fn AS (SELECT p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname='protect_profile_privileged_columns')
SELECT cols.col,
       has_column_privilege('authenticated','public.profiles', cols.col, 'UPDATE') AS auth_can_update_column,
       (SELECT fn.prosrc ~* ('NEW\.' || cols.col || '\s*:=\s*OLD\.' || cols.col) FROM fn) AS trigger_resets_column,
       (SELECT count(*) FROM fn) AS trigger_function_exists
  FROM cols
 ORDER BY trigger_resets_column NULLS FIRST, cols.col;

-- Q-D4  Evidence of trigger reverting server-side awards (S-6 / B-4):
--       latest ledger balance_after vs current profile value.
--       Many mismatches where profile == default (xp 0 / coins 0) => awards reverted.
WITH last_xp AS (
  SELECT DISTINCT ON (user_id) user_id, balance_after, created_at
    FROM public.xp_transactions ORDER BY user_id, created_at DESC),
last_coin AS (
  SELECT DISTINCT ON (user_id) user_id, balance_after, created_at
    FROM public.coin_transactions ORDER BY user_id, created_at DESC)
SELECT count(*)                                                      AS users_with_xp_ledger,
       count(*) FILTER (WHERE p.xp = lx.balance_after)               AS xp_matches_ledger,
       count(*) FILTER (WHERE p.xp IS DISTINCT FROM lx.balance_after) AS xp_mismatch,
       count(*) FILTER (WHERE coalesce(p.xp,0) = 0 AND lx.balance_after > 0) AS xp_zero_but_ledger_positive,
       (SELECT count(*) FROM last_coin lc JOIN public.profiles p2 ON p2.id = lc.user_id
         WHERE p2.coins IS DISTINCT FROM lc.balance_after)           AS coins_mismatch,
       (SELECT count(*) FROM last_coin)                              AS users_with_coin_ledger
  FROM last_xp lx
  JOIN public.profiles p ON p.id = lx.user_id;


-- #############################################################################
-- SECTION E — Battle integrity (read-only state inspection)
-- #############################################################################

-- Q-E1  Battle status census incl. overdue / stuck categories
SELECT status,
       count(*) AS battles,
       count(*) FILTER (WHERE status = 'live' AND end_at < now() - interval '5 minutes') AS live_past_end_5m,
       count(*) FILTER (WHERE status IN ('open','filling','upcoming','ready')
                          AND start_at < now() - interval '1 hour')                     AS pre_live_start_passed_1h,
       min(end_at) FILTER (WHERE status = 'live') AS oldest_live_end_at,
       max(updated_at) AS last_update
  FROM public.battles
 GROUP BY status
 ORDER BY battles DESC;

-- Q-E2  Stuck below min_participants (B-3): start passed, never reached min
SELECT b.status, count(*) AS stuck_battles,
       min(b.start_at) AS oldest_start, max(b.start_at) AS newest_start
  FROM public.battles b
  LEFT JOIN LATERAL (SELECT count(*) AS n FROM public.battle_participants p WHERE p.battle_id = b.id) pc ON true
 WHERE b.status IN ('open','filling','upcoming','ready')
   AND b.start_at < now()
   AND pc.n < coalesce(b.min_participants, 2)
 GROUP BY b.status;

-- Q-E3  Who finalized completed battles? Completion lag vs end_at is a proxy:
--       ~seconds after end_at from a viewer tick; ≤1–2 min from cron; hours = host/manual/backlog.
SELECT date_trunc('week', b.end_at) AS week,
       count(*) AS completed,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (b.updated_at - b.end_at))::float8) AS median_lag_s,
       max(extract(epoch FROM (b.updated_at - b.end_at))) AS max_lag_s,
       count(*) FILTER (WHERE b.updated_at < b.end_at) AS completed_before_end_at   -- early host finalize (B-2)
  FROM public.battles b
 WHERE b.status = 'completed'
 GROUP BY 1
 ORDER BY 1 DESC
 LIMIT 26;

-- Q-E4  Early finalizations detail (B-2): completed before scheduled end, with winner=host
SELECT b.id, b.name, b.end_at, b.updated_at AS completed_at, b.ranked,
       (b.winner_user_id = b.host_id) AS host_won,
       (SELECT count(*) FROM public.battle_participants p WHERE p.battle_id = b.id) AS participants
  FROM public.battles b
 WHERE b.status = 'completed' AND b.updated_at < b.end_at
 ORDER BY b.updated_at DESC
 LIMIT 200;

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

-- Q-E6  Battle rule-violation log volume (shows whether the INSERT trigger is live and firing)
SELECT event_type, count(*) AS n, max(created_at) AS latest
  FROM public.battle_logs
 GROUP BY event_type
 ORDER BY n DESC;


-- #############################################################################
-- SECTION F — Championship lifecycle
-- #############################################################################

-- Q-F1  Any cron job that references championship functions or hooks
SELECT jobid, jobname, schedule, active,
       (command ILIKE '%tick_championships%')   AS calls_tick_championships,
       (command ILIKE '%start_championship%')   AS calls_start_championship,
       (command ILIKE '%finalize_championship%') AS calls_finalize_championship,
       (command ILIKE '%championship%')          AS mentions_championship
  FROM cron.job
 ORDER BY jobname;

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

-- Q-F3  Championship state census — overdue transitions are evidence of no scheduler
SELECT status, count(*) AS n,
       count(*) FILTER (WHERE status IN ('upcoming','registration') AND start_at < now()) AS should_have_started,
       count(*) FILTER (WHERE status = 'live' AND end_at < now())                                    AS should_have_finalized,
       min(start_at) AS earliest_start, max(end_at) AS latest_end, max(updated_at) AS last_update
  FROM public.championships
 GROUP BY status
 ORDER BY n DESC;

-- Q-F4  Month coverage — auto-create of next month's championship happening?
SELECT season_year, season_month, count(*) AS championships, min(status::text) AS a_status, min(created_at) AS created
  FROM public.championships
 GROUP BY season_year, season_month
 ORDER BY season_year DESC NULLS LAST, season_month DESC NULLS LAST
 LIMIT 24;


-- #############################################################################
-- SECTION G — Cron inventory (secrets redacted)
-- #############################################################################

-- Q-G1  cron.job with redacted command, endpoint and secret presence (length only)
SELECT j.jobid, j.jobname, j.schedule, j.active, j.database, j.username,
       regexp_replace(substring(j.command from 'https?://[^''"\s]+'), '\?.*$', '')  AS endpoint_no_query,
       substring(j.command from '/api/public/hooks/([A-Za-z0-9_-]+)')              AS hook,
       (j.command ILIKE '%net.http_post%' OR j.command ILIKE '%net.http_get%')     AS is_http_job,
       length(substring(j.command from '"x-cron-secret"\s*:\s*"([^"]*)"'))        AS x_cron_secret_len,
       (substring(j.command from '"x-cron-secret"\s*:\s*"([^"]*)"') LIKE '<%')     AS secret_is_placeholder,
       (j.command ~* '"authorization"\s*:\s*"Bearer')                             AS has_bearer_header,
       (j.command ~* '"apikey"\s*:')                                              AS has_apikey_header,
       regexp_replace(
         regexp_replace(
           regexp_replace(
             regexp_replace(j.command,
               '("(x-cron-secret|apikey|authorization|x-api-key)"\s*:\s*")[^"]*"', '\1<redacted>"', 'gi'),
             '(Bearer\s+)[A-Za-z0-9._~+/=-]+', '\1<redacted>', 'gi'),
           '([?&](key|apikey|api_key|token|secret)=)[^&''"\s]+', '\1<redacted>', 'gi'),
         '[A-Za-z0-9_\-]{32,}', '<redacted-token>', 'g')                          AS command_redacted
  FROM cron.job j
 ORDER BY j.jobname;

-- Q-G2  Do all HTTP jobs carry the SAME secret? (boolean only, no value)
SELECT j.jobname,
       md5(coalesce(substring(j.command from '"x-cron-secret"\s*:\s*"([^"]*)"'), ''))
         = (SELECT md5(coalesce(substring(k.command from '"x-cron-secret"\s*:\s*"([^"]*)"'), ''))
              FROM cron.job k
             WHERE k.command ~ '"x-cron-secret"'
             ORDER BY k.jobid LIMIT 1) AS same_secret_as_first_job
  FROM cron.job j
 WHERE j.command ~ '"x-cron-secret"'
 ORDER BY j.jobname;

-- Q-G3  Statement-level run history per job (NB: "succeeded" ≠ HTTP success — BA-3)
SELECT j.jobname, d.status, count(*) AS runs,
       min(d.start_time) AS first_run, max(d.start_time) AS last_run
  FROM cron.job_run_details d
  JOIN cron.job j ON j.jobid = d.jobid
 WHERE d.start_time > now() - interval '7 days'
 GROUP BY j.jobname, d.status
 ORDER BY j.jobname, d.status;

-- Q-G4  HTTP outcomes actually returned to pg_net (retention is short; "at least")
SELECT date_trunc('hour', created) AS hour,
       status_code, timed_out, count(*) AS responses,
       left(max(error_msg), 120) AS sample_error
  FROM net._http_response
 WHERE created > now() - interval '48 hours'
 GROUP BY 1, 2, 3
 ORDER BY 1 DESC, responses DESC;

-- Q-G5  Vault secret NAMES only (no values). May be permission-denied — record that.
SELECT name, description, created_at, updated_at
  FROM vault.secrets
 ORDER BY name;


-- #############################################################################
-- SECTION H — Historical ingestion (no import is triggered)
-- #############################################################################

-- Q-H1  Job census by trigger source / status, last 7 days
SELECT triggered_by, status, phase, source_code, count(*) AS jobs,
       sum(candles_inserted) AS bars_inserted,
       max(created_at) AS latest
  FROM public.historical_import_jobs
 WHERE created_at > now() - interval '7 days'
 GROUP BY 1, 2, 3, 4
 ORDER BY latest DESC;

-- Q-H2  Stale 'running' / 'queued' jobs (HD-6)
SELECT id, symbol, timeframe, source_code, triggered_by, status, phase, progress,
       created_at, started_at, updated_at,
       round(extract(epoch FROM (now() - coalesce(updated_at, started_at, created_at))) / 60) AS minutes_since_progress
  FROM public.historical_import_jobs
 WHERE status IN ('running','queued','pending','processing')
   AND coalesce(updated_at, started_at, created_at) < now() - interval '30 minutes'
 ORDER BY minutes_since_progress DESC
 LIMIT 200;

-- Q-H3  Failure classes, last 7 days (message prefix only)
SELECT source_code, triggered_by, left(coalesce(error_message, '(null)'), 80) AS error_prefix,
       count(*) AS n, max(created_at) AS latest
  FROM public.historical_import_jobs
 WHERE status IN ('failed','error') AND created_at > now() - interval '7 days'
 GROUP BY 1, 2, 3
 ORDER BY n DESC
 LIMIT 50;

-- Q-H4  "Successful" jobs that fetched far fewer bars than the range implies (H-1 signal)
--       expected_min_bars assumes 1m ≈ 5/7 trading coverage; a ratio < 0.2 on multi-day
--       ranges suggests the page loop stopped early.
SELECT id, symbol, timeframe, source_code, triggered_by, range_from, range_to,
       candles_fetched,
       round(extract(epoch FROM (range_to - range_from)) / 86400.0, 2) AS range_days,
       CASE timeframe WHEN '1m' THEN extract(epoch FROM (range_to - range_from)) / 60 * 5.0 / 7
                      WHEN '5m' THEN extract(epoch FROM (range_to - range_from)) / 300 * 5.0 / 7
                      WHEN '15m' THEN extract(epoch FROM (range_to - range_from)) / 900 * 5.0 / 7
                      WHEN '1h' THEN extract(epoch FROM (range_to - range_from)) / 3600 * 5.0 / 7 END AS expected_min_bars
  FROM public.historical_import_jobs
 WHERE status = 'success' AND source_code = 'twelvedata'
   AND range_to - range_from > interval '4 days'
   AND created_at > now() - interval '30 days'
 ORDER BY created_at DESC
 LIMIT 200;

-- Q-H5  Provider market assignments (no credentials)
SELECT market_kind, primary_code, fallback_code, updated_at, updated_by
  FROM public.provider_market_assignments
 ORDER BY market_kind;

-- Q-H6  Symbol catalog health by provider
SELECT source_code, is_enabled, count(*) AS symbols,
       count(*) FILTER (WHERE latest_imported IS NULL) AS never_imported,
       min(latest_imported) AS stalest_front_edge, max(latest_imported) AS freshest_front_edge
  FROM public.historical_symbols
 GROUP BY 1, 2
 ORDER BY 1, 2;

-- Q-H7  Provider credential presence (names only — ciphertext NOT selected)
SELECT provider_code, field_key, (length(ciphertext) > 0) AS present, updated_at
  FROM public.provider_credentials
 ORDER BY provider_code, field_key;

-- Q-H8  Size of candle store (planner estimate — avoids a full count on the big table)
SELECT relname, n_live_tup AS est_rows, last_autoanalyze
  FROM pg_stat_user_tables
 WHERE schemaname = 'public' AND relname IN ('historical_candles','historical_import_jobs','historical_sync_logs');


-- #############################################################################
-- SECTION I — Suspicious / forged data detection (SELECT only, nothing repaired)
-- #############################################################################

-- Q-I1  Impossible P&L — sign contradicts price movement beyond costs, or closed
--       without exit price, or P&L on a zero price move.
SELECT count(*) FILTER (WHERE exit_price IS NULL)                                                   AS closed_no_exit_price,
       count(*) FILTER (WHERE direction='long'  AND exit_price > entry_price
                          AND pnl < -(coalesce(commission,0)+coalesce(swap,0)) - 0.01)             AS long_up_but_loss,
       count(*) FILTER (WHERE direction='long'  AND exit_price < entry_price AND pnl > 0.01)        AS long_down_but_profit,
       count(*) FILTER (WHERE direction='short' AND exit_price < entry_price
                          AND pnl < -(coalesce(commission,0)+coalesce(swap,0)) - 0.01)             AS short_down_but_loss,
       count(*) FILTER (WHERE direction='short' AND exit_price > entry_price AND pnl > 0.01)        AS short_up_but_profit,
       count(*) FILTER (WHERE exit_price = entry_price AND abs(pnl) > coalesce(commission,0)+coalesce(swap,0)+0.01) AS flat_move_nonzero_pnl,
       count(*) AS closed_trades_total
  FROM public.paper_trades
 WHERE status = 'closed' AND deleted_at IS NULL;

-- Q-I2  Impossible P&L — per-symbol outliers of implied value-per-price-unit-per-lot.
--       Robust to unknown contract specs: compares each trade to its symbol's median.
WITH k AS (
  SELECT id, user_id, account_id, symbol, battle_id, championship_id, pnl, entry_price, exit_price, lot_size, closed_at,
         abs(pnl) / NULLIF(abs(exit_price - entry_price) * lot_size, 0) AS k
    FROM public.paper_trades
   WHERE status='closed' AND deleted_at IS NULL AND exit_price IS NOT NULL
     AND lot_size > 0 AND exit_price <> entry_price),
med AS (SELECT symbol, percentile_cont(0.5) WITHIN GROUP (ORDER BY k::float8) AS k_med, count(*) AS n
          FROM k GROUP BY symbol)
SELECT k.id, k.user_id, k.account_id, k.symbol, k.battle_id, k.championship_id, k.pnl,
       round((k.k::float8 / NULLIF(m.k_med,0))::numeric, 2) AS ratio_to_symbol_median, m.n AS symbol_sample, k.closed_at
  FROM k JOIN med m USING (symbol)
 WHERE m.n >= 5 AND (k.k > 10 * m.k_med OR k.k < m.k_med / 10)
 ORDER BY (k.battle_id IS NOT NULL OR k.championship_id IS NOT NULL) DESC, abs(k.pnl) DESC
 LIMIT 200;

-- Q-I3  Closed trades with no server-side 'closed' event (possible direct PostgREST writes).
--       Excludes battle trades (replay battle writer inserts closed rows by design — BA-11).
SELECT (t.battle_id IS NOT NULL) AS is_battle, (t.championship_id IS NOT NULL) AS is_championship,
       count(*) AS closed_without_close_event,
       count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.position_history o
                                           WHERE o.trade_id = t.id AND o.event = 'opened')) AS also_no_open_event,
       sum(t.pnl) AS pnl_sum
  FROM public.paper_trades t
 WHERE t.status = 'closed' AND t.deleted_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.position_history h WHERE h.trade_id = t.id AND h.event = 'closed')
 GROUP BY 1, 2
 ORDER BY 1, 2;

-- Q-I4  Duplicate settlement — more than one 'closed' event per trade
SELECT h.trade_id, count(*) AS close_events,
       array_agg((h.payload->>'pnl') ORDER BY h.created_at) AS pnls,
       min(h.created_at) AS first_close, max(h.created_at) AS last_close
  FROM public.position_history h
 WHERE h.event = 'closed'
 GROUP BY h.trade_id
HAVING count(*) > 1
 ORDER BY close_events DESC, last_close DESC
 LIMIT 200;

-- Q-I5  Balance inconsistent with settlements (three-way invariant, BA-5 / BA-11)
--       expected = starting_balance + Σ closed pnl + Σ partial_close pnl
--       Non-zero drift can be legitimate only via NBP floor; large positive drift is suspicious.
WITH closed AS (
  SELECT account_id, sum(pnl) AS closed_pnl, count(*) AS n_closed,
         sum(pnl) FILTER (WHERE battle_id IS NOT NULL) AS battle_pnl
    FROM public.paper_trades WHERE status='closed' AND deleted_at IS NULL GROUP BY account_id),
partial AS (
  SELECT account_id, sum((payload->>'pnl')::numeric) AS partial_pnl
    FROM public.position_history WHERE event='partial_close' GROUP BY account_id)
SELECT a.id AS account_id, a.user_id, a.name, a.battle_id, a.championship_id,
       a.starting_balance, a.balance, c.closed_pnl, p.partial_pnl, c.battle_pnl,
       s.net_pnl AS stats_net_pnl, s.total_trades AS stats_trades, c.n_closed,
       round(a.balance - (a.starting_balance + coalesce(c.closed_pnl,0) + coalesce(p.partial_pnl,0)), 2) AS balance_drift,
       round(coalesce(s.net_pnl,0) - (a.balance - a.starting_balance), 2)                               AS stats_vs_balance_drift
  FROM public.paper_accounts a
  LEFT JOIN closed c ON c.account_id = a.id
  LEFT JOIN partial p ON p.account_id = a.id
  LEFT JOIN public.account_statistics s ON s.account_id = a.id
 WHERE a.deleted_at IS NULL
   AND (abs(a.balance - (a.starting_balance + coalesce(c.closed_pnl,0) + coalesce(p.partial_pnl,0))) > 1
        OR abs(coalesce(s.net_pnl,0) - (a.balance - a.starting_balance)) > 1)
 ORDER BY abs(a.balance - (a.starting_balance + coalesce(c.closed_pnl,0) + coalesce(p.partial_pnl,0))) DESC
 LIMIT 200;

-- Q-I5b  Summary counts for Q-I5 (unbounded)
WITH closed AS (
  SELECT account_id, sum(pnl) AS closed_pnl FROM public.paper_trades
   WHERE status='closed' AND deleted_at IS NULL GROUP BY account_id),
partial AS (
  SELECT account_id, sum((payload->>'pnl')::numeric) AS partial_pnl
    FROM public.position_history WHERE event='partial_close' GROUP BY account_id),
d AS (
  SELECT a.balance - (a.starting_balance + coalesce(c.closed_pnl,0) + coalesce(p.partial_pnl,0)) AS drift
    FROM public.paper_accounts a
    LEFT JOIN closed c ON c.account_id=a.id LEFT JOIN partial p ON p.account_id=a.id
   WHERE a.deleted_at IS NULL)
SELECT count(*) AS accounts,
       count(*) FILTER (WHERE abs(drift) <= 1)  AS consistent,
       count(*) FILTER (WHERE drift > 1)        AS balance_above_settlements,
       count(*) FILTER (WHERE drift < -1)       AS balance_below_settlements,
       round(max(drift),2) AS max_positive_drift, round(min(drift),2) AS max_negative_drift
  FROM d;

-- Q-I6  Trades modified after close (possible post-close pnl edits via UPDATE path)
SELECT (battle_id IS NOT NULL) AS is_battle, (championship_id IS NOT NULL) AS is_championship,
       count(*) AS closed_then_updated,
       count(*) FILTER (WHERE updated_at > closed_at + interval '1 day') AS updated_over_1d_after_close
  FROM public.paper_trades
 WHERE status='closed' AND closed_at IS NOT NULL AND updated_at > closed_at + interval '1 minute'
 GROUP BY 1, 2;

-- Q-I7  Battle/championship trades outside the event window or by non-participants
SELECT 'battle' AS kind, t.id AS trade_id, t.user_id, t.battle_id AS event_id, t.created_at, t.opened_at, t.closed_at, t.pnl,
       (t.created_at < b.start_at OR t.created_at > b.end_at) AS created_outside_window,
       NOT EXISTS (SELECT 1 FROM public.battle_participants p WHERE p.battle_id=t.battle_id AND p.user_id=t.user_id) AS not_participant
  FROM public.paper_trades t JOIN public.battles b ON b.id = t.battle_id
 WHERE t.status='closed'
   AND ((t.created_at < b.start_at OR t.created_at > b.end_at)
        OR NOT EXISTS (SELECT 1 FROM public.battle_participants p WHERE p.battle_id=t.battle_id AND p.user_id=t.user_id))
UNION ALL
SELECT 'championship', t.id, t.user_id, t.championship_id, t.created_at, t.opened_at, t.closed_at, t.pnl,
       (t.opened_at < c.start_at OR t.opened_at > c.end_at),
       NOT EXISTS (SELECT 1 FROM public.championship_participants p WHERE p.championship_id=t.championship_id AND p.user_id=t.user_id)
  FROM public.paper_trades t JOIN public.championships c ON c.id = t.championship_id
 WHERE t.status='closed'
   AND ((t.opened_at < c.start_at OR t.opened_at > c.end_at)
        OR NOT EXISTS (SELECT 1 FROM public.championship_participants p WHERE p.championship_id=t.championship_id AND p.user_id=t.user_id))
 ORDER BY 1, 6 DESC
 LIMIT 200;

-- Q-I8  Suspicious ELO / battle stats vs history
WITH last_elo AS (
  SELECT DISTINCT ON (user_id) user_id, elo_after FROM public.elo_history ORDER BY user_id, created_at DESC),
res AS (
  SELECT r.user_id,
         count(*) FILTER (WHERE b.ranked) AS ranked_results,
         count(*) FILTER (WHERE b.ranked AND r.final_rank = 1) AS ranked_wins
    FROM public.battle_results r JOIN public.battles b ON b.id = r.battle_id GROUP BY r.user_id)
SELECT p.id AS user_id, p.username, p.elo, p.peak_elo, le.elo_after AS last_history_elo,
       p.battles_played, res.ranked_results, p.battle_wins, res.ranked_wins,
       p.current_battle_streak, p.best_battle_streak,
       CASE WHEN le.user_id IS NULL AND coalesce(p.elo,1000) <> 1000 THEN 'elo_changed_without_history'
            WHEN le.user_id IS NOT NULL AND p.elo <> le.elo_after      THEN 'elo_differs_from_history'
            WHEN coalesce(p.battle_wins,0) > coalesce(res.ranked_wins,0) THEN 'wins_exceed_results'
            WHEN coalesce(p.battles_played,0) > coalesce(res.ranked_results,0) THEN 'played_exceeds_results'
            WHEN p.peak_elo < p.elo THEN 'peak_below_current'
            WHEN coalesce(p.best_battle_streak,0) > coalesce(res.ranked_wins,0) THEN 'streak_exceeds_wins'
       END AS anomaly
  FROM public.profiles p
  LEFT JOIN last_elo le ON le.user_id = p.id
  LEFT JOIN res ON res.user_id = p.id
 WHERE (le.user_id IS NULL AND coalesce(p.elo,1000) <> 1000)
    OR (le.user_id IS NOT NULL AND p.elo <> le.elo_after)
    OR coalesce(p.battle_wins,0) > coalesce(res.ranked_wins,0)
    OR coalesce(p.battles_played,0) > coalesce(res.ranked_results,0)
    OR p.peak_elo < p.elo
    OR coalesce(p.best_battle_streak,0) > coalesce(res.ranked_wins,0)
 ORDER BY p.elo DESC NULLS LAST
 LIMIT 200;

-- Q-I9  Prop challenges passed without a credible evaluation trail
SELECT c.id, c.user_id, c.name, c.status, c.result, c.account_size, c.starting_equity, c.current_equity,
       c.profit_target_pct, c.min_trading_days, c.trading_days_used, c.completed_at,
       a.starting_balance AS linked_starting_balance, a.balance AS linked_balance,
       (SELECT count(*) FROM public.prop_challenge_days d WHERE d.challenge_id = c.id) AS day_rows,
       (SELECT count(*) FROM public.prop_challenge_days d WHERE d.challenge_id = c.id AND d.trades_count > 0) AS trading_day_rows,
       (SELECT coalesce(sum(t.pnl),0) FROM public.paper_trades t
         WHERE t.account_id = c.paper_account_id AND t.status='closed'
           AND t.closed_at >= c.started_at) AS realized_since_start,
       concat_ws(', ',
         CASE WHEN (SELECT count(*) FROM public.prop_challenge_days d WHERE d.challenge_id=c.id)=0 THEN 'no_day_rows' END,
         CASE WHEN c.trading_days_used < c.min_trading_days THEN 'days_below_min' END,
         CASE WHEN a.starting_balance IS DISTINCT FROM c.account_size THEN 'linked_account_size_mismatch' END,
         CASE WHEN c.current_equity - c.starting_equity < c.starting_equity * c.profit_target_pct / 100 THEN 'equity_below_target' END,
         CASE WHEN (SELECT coalesce(sum(t.pnl),0) FROM public.paper_trades t
                     WHERE t.account_id=c.paper_account_id AND t.status='closed' AND t.closed_at >= c.started_at)
                   < c.starting_equity * c.profit_target_pct / 100 THEN 'realized_below_target' END,
         CASE WHEN c.completed_at IS NULL THEN 'no_completed_at' END,
         CASE WHEN c.completed_at < c.started_at + interval '1 day' THEN 'passed_within_1_day' END
       ) AS flags
  FROM public.prop_challenges c
  LEFT JOIN public.paper_accounts a ON a.id = c.paper_account_id
 WHERE c.status = 'passed' OR c.result = 'passed'
 ORDER BY c.completed_at DESC NULLS FIRST
 LIMIT 200;

-- Q-I9b  Prop status census (counts deleted-evidence cannot be recovered; this is the baseline)
SELECT status, result, count(*) AS n, max(updated_at) AS latest
  FROM public.prop_challenges
 GROUP BY 1, 2
 ORDER BY n DESC;

-- Q-I10  Battle results inconsistent with underlying trades
WITH tr AS (
  SELECT battle_id, user_id, sum(pnl) AS trade_pnl, count(*) AS trade_n
    FROM public.paper_trades
   WHERE battle_id IS NOT NULL AND status='closed'
   GROUP BY battle_id, user_id)
SELECT r.battle_id, r.user_id, r.final_rank, r.pnl AS result_pnl, tr.trade_pnl,
       r.trades_count AS result_trades, tr.trade_n,
       b.winner_user_id, b.ranked,
       CASE WHEN tr.user_id IS NULL AND coalesce(r.trades_count,0) > 0 THEN 'result_without_trades'
            WHEN abs(coalesce(r.pnl,0) - coalesce(tr.trade_pnl,0)) > 0.01 THEN 'pnl_mismatch'
            WHEN coalesce(r.trades_count,0) <> coalesce(tr.trade_n,0) THEN 'count_mismatch'
            WHEN r.final_rank = 1 AND b.winner_user_id IS DISTINCT FROM r.user_id THEN 'winner_mismatch'
            WHEN NOT EXISTS (SELECT 1 FROM public.battle_participants p
                              WHERE p.battle_id=r.battle_id AND p.user_id=r.user_id) THEN 'result_for_non_participant'
       END AS anomaly
  FROM public.battle_results r
  JOIN public.battles b ON b.id = r.battle_id
  LEFT JOIN tr ON tr.battle_id = r.battle_id AND tr.user_id = r.user_id
 WHERE (tr.user_id IS NULL AND coalesce(r.trades_count,0) > 0)
    OR abs(coalesce(r.pnl,0) - coalesce(tr.trade_pnl,0)) > 0.01
    OR coalesce(r.trades_count,0) <> coalesce(tr.trade_n,0)
    OR (r.final_rank = 1 AND b.winner_user_id IS DISTINCT FROM r.user_id)
    OR NOT EXISTS (SELECT 1 FROM public.battle_participants p WHERE p.battle_id=r.battle_id AND p.user_id=r.user_id)
 ORDER BY b.updated_at DESC
 LIMIT 200;

-- Q-I11  Championship rankings inconsistent with underlying trades
WITH tr AS (
  SELECT championship_id, user_id, sum(pnl) AS trade_pnl, count(*) AS trade_n
    FROM public.paper_trades
   WHERE championship_id IS NOT NULL AND status='closed'
   GROUP BY 1, 2)
SELECT k.championship_id, k.user_id, k.rank, k.pnl AS ranking_pnl, tr.trade_pnl, k.total_trades, tr.trade_n, k.updated_at
  FROM public.championship_rankings k
  LEFT JOIN tr ON tr.championship_id = k.championship_id AND tr.user_id = k.user_id
 WHERE abs(coalesce(k.pnl,0) - coalesce(tr.trade_pnl,0)) > 0.01
    OR coalesce(k.total_trades,0) <> coalesce(tr.trade_n,0)
 ORDER BY k.updated_at DESC
 LIMIT 200;

-- Q-I12  Rewards recorded but never paid (B-4): battle_results xp vs xp ledger
SELECT count(*) AS results_with_xp,
       count(*) FILTER (WHERE NOT EXISTS (
         SELECT 1 FROM public.xp_transactions x
          WHERE x.user_id = r.user_id AND x.source_id::text = r.battle_id::text)) AS no_matching_xp_ledger,
       sum(r.xp_awarded) AS xp_recorded, sum(r.coins_awarded) AS coins_recorded
  FROM public.battle_results r
 WHERE coalesce(r.xp_awarded,0) > 0;

-- Q-I13  Journal shares exposure size (S-2) — counts only, no content
SELECT count(*) FILTER (WHERE is_public AND share_token IS NOT NULL) AS listable_under_repo_policy,
       count(*) FILTER (WHERE is_public)                             AS is_public_rows,
       count(*) FILTER (WHERE share_token IS NOT NULL)               AS rows_with_token,
       count(DISTINCT user_id) FILTER (WHERE is_public AND share_token IS NOT NULL) AS distinct_owners
  FROM public.journal_entries;


-- #############################################################################
-- SECTION J — Environment presence (indirect evidence only; values never read)
-- #############################################################################
--  Application env vars live in the Lovable/Cloudflare runtime and are NOT
--  visible from the database. These queries give INDIRECT evidence only.

-- Q-J1  Evidence of service-role + Twelve Data key: recent successful server-side imports
SELECT source_code, triggered_by,
       count(*) FILTER (WHERE status='success') AS success_24h,
       count(*) FILTER (WHERE status IN ('failed','error')) AS failed_24h,
       max(finished_at) FILTER (WHERE status='success') AS last_success
  FROM public.historical_import_jobs
 WHERE created_at > now() - interval '24 hours'
 GROUP BY 1, 2
 ORDER BY 1, 2;

-- Q-J2  Evidence of CRON_SECRET matching: side effects of each hook in the last 24h
SELECT 'battles completed near end_at (cron-like)' AS signal,
       count(*) FILTER (WHERE status='completed' AND updated_at > now() - interval '24 hours') AS n
  FROM public.battles
UNION ALL
SELECT 'economic_events updated', count(*) FROM public.economic_events WHERE updated_at > now() - interval '24 hours'
UNION ALL
SELECT 'historical jobs triggered_by cron%', count(*) FROM public.historical_import_jobs
 WHERE triggered_by LIKE 'cron%' AND created_at > now() - interval '24 hours'
UNION ALL
SELECT 'email_queue status changed', count(*) FROM public.email_queue WHERE updated_at > now() - interval '24 hours';

-- Q-J3  Evidence of email provider behaviour (noop marks 'sent' — O-1)
SELECT status, count(*) AS n, max(sent_at) AS last_sent, max(updated_at) AS last_update,
       count(*) FILTER (WHERE status='processing' AND locked_at < now() - interval '30 minutes') AS stuck_processing
  FROM public.email_queue
 GROUP BY status
 ORDER BY n DESC;

-- Q-J4  Evidence of AI gateway use (LOVABLE_API_KEY path reached)
SELECT bucket, count(*) AS windows, sum(count) AS requests, max(updated_at) AS latest
  FROM public.ai_rate_limits
 WHERE updated_at > now() - interval '7 days'
 GROUP BY bucket
 ORDER BY latest DESC;

-- =============================================================================
-- END — 61 numbered queries (90 SELECT/WITH statements incl. sub-queries). No statement writes.
-- =============================================================================

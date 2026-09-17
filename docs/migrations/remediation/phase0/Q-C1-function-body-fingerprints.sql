-- Q-C1 — Fingerprint comparison. repo_md5 = md5 of the function body from the
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 13 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

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

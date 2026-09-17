-- Q-B1 — Target functions, every overload
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 9 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

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

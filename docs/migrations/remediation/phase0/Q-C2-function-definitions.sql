-- Q-C2 — Full live definitions of the settlement / battle / championship / profile
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 14 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

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

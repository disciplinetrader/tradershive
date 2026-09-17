-- =============================================================================
-- TradersHIVE remediation — Phase 1 CONTAINMENT (function EXECUTE privileges)
-- =============================================================================
--
--   STATUS: PREPARED — NOT EXECUTED. DO NOT RUN AGAINST PRODUCTION until
--           docs/migrations/remediation/phase1/REHEARSAL.md has passed and the
--           owner has approved the production window.
--
--   Evidence : docs/migrations/remediation/phase0-results/2026-09-17_Q-B1.csv,
--              2026-09-17_Q-B2.csv, 2026-09-17_Q-B3.csv, 2026-09-17_Q-C2.md
--   Report   : _bmad-output/planning-artifacts/phase-0-live-verification.md §3, §7, §11
--   Rollback : docs/migrations/remediation/phase1/rollback.sql  (R1a / R1b / R1c
--              mirror C1a / C1b / C1c exactly)
--
--   Run as   : postgres (the role Q-00a reported; it is the grantor of every
--              captured ACL entry, so revokes/grants match "…/postgres").
--
--   Scope    : EXECUTE privileges on 8 functions only. No function body, table,
--              policy, trigger, cron job, default privilege or data is changed.
--              Default privileges are a SEPARATE proposal:
--              default-privileges.proposed.sql
--
--   How to apply (Lovable SQL editor — one statement per run, see
--   docs/migrations/README.md):
--     C0            read-only capture  → save output as phase1-results/<date>_C0.csv
--     C1a           critical: commit_settlement, _join_battle_as     (atomic DO block)
--     C2 (verify)   read-only
--     C1b           app-used: tick_battle, join_battle, social_follow_counts (atomic DO block)
--     C2 (verify)   read-only
--     C1c           journal helpers, no app caller (atomic DO block)
--     C2 (verify)   read-only
--
--   Each C1 block first ASSERTS that the live ACL is still exactly what
--   Phase 0 captured. If anything has drifted, the block raises and changes
--   NOTHING — the rollback file would no longer be exact, so stop and
--   regenerate from a fresh capture.
--
--   Deliberately NOT changed (architecture fixes later, plan Phases 2/3):
--     bump_ai_rate_limit, tick_championships, start_championship,
--     finalize_championship, recompute_battle_live_stats,
--     community_recompute_trending  — no GRANT to authenticated.
--     record_practice_activity(uuid,text,jsonb) — has an app caller; identity
--     fix is Phase 3 (N-15), privileges untouched here.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- C0 — PRE-FLIGHT CAPTURE (read-only). Run first; save the output.
--      Expected (2026-09-17 capture):
--        commit_settlement, _join_battle_as, tick_battle, join_battle(uuid,boolean):
--          acl = {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--        social_follow_counts, journal_sync_tag_arrays_for, journal_entry_tags_sync_trg,
--        journal_tags_rename_sync_trg:
--          public/anon/authenticated/service_role EXECUTE = true (raw ACL not
--          captured in Phase 0 — this capture IS the rollback baseline for them)
-- -----------------------------------------------------------------------------
SELECT p.oid::regprocedure AS signature,
       p.proacl::text      AS acl,
       (p.proacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                                     WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')) AS public_exec,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_exec,
       has_function_privilege('service_role',  p.oid, 'EXECUTE') AS service_role_exec,
       pg_get_userbyid(p.proowner) AS owner,
       current_user AS run_as,
       now() AS captured_at
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.oid IN ('public.commit_settlement(uuid,uuid,numeric)'::regprocedure,
                 'public._join_battle_as(uuid,uuid)'::regprocedure,
                 'public.tick_battle(uuid)'::regprocedure,
                 'public.join_battle(uuid,boolean)'::regprocedure,
                 'public.social_follow_counts(uuid)'::regprocedure,
                 'public.journal_sync_tag_arrays_for(uuid)'::regprocedure,
                 'public.journal_entry_tags_sync_trg()'::regprocedure,
                 'public.journal_tags_rename_sync_trg()'::regprocedure)
 ORDER BY 1;


-- -----------------------------------------------------------------------------
-- C1a — CRITICAL: commit_settlement, _join_battle_as
--   Findings C-6, C-7. Zero application callers (source re-verified 2026-09-17).
--   _join_battle_as is still reached internally by join_battle() and
--   tick_battles(); both are SECURITY DEFINER owned by postgres, so the nested
--   call executes as postgres, which keeps its explicit EXECUTE.
--   Result: postgres + service_role only.
-- -----------------------------------------------------------------------------
DO $containment_c1a$
DECLARE
  expected CONSTANT text := '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}';
  f regprocedure;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'C1a: run as postgres (current_user=%)', current_user;
  END IF;

  FOREACH f IN ARRAY ARRAY['public.commit_settlement(uuid,uuid,numeric)'::regprocedure,
                           'public._join_battle_as(uuid,uuid)'::regprocedure] LOOP
    IF (SELECT array_agg(x ORDER BY x) FROM unnest((SELECT proacl FROM pg_proc WHERE oid = f)::text[]) x)
       IS DISTINCT FROM
       (SELECT array_agg(x ORDER BY x) FROM unnest(expected::text[]) x) THEN
      RAISE EXCEPTION 'C1a: ACL drift on % — live %, expected %. Nothing changed; recapture and regenerate rollback.',
        f, (SELECT proacl::text FROM pg_proc WHERE oid = f), expected;
    END IF;
  END LOOP;

  REVOKE EXECUTE ON FUNCTION public.commit_settlement(uuid, uuid, numeric) FROM PUBLIC, anon, authenticated;
  REVOKE EXECUTE ON FUNCTION public._join_battle_as(uuid, uuid)            FROM PUBLIC, anon, authenticated;

  -- Post-condition (same transaction): fail and roll back if not exactly met.
  FOREACH f IN ARRAY ARRAY['public.commit_settlement(uuid,uuid,numeric)'::regprocedure,
                           'public._join_battle_as(uuid,uuid)'::regprocedure] LOOP
    IF has_function_privilege('anon', f, 'EXECUTE')
       OR has_function_privilege('authenticated', f, 'EXECUTE')
       OR NOT has_function_privilege('service_role', f, 'EXECUTE')
       OR NOT has_function_privilege('postgres', f, 'EXECUTE') THEN   -- nested SECURITY DEFINER callers run as postgres
      RAISE EXCEPTION 'C1a: post-condition failed for %', f;
    END IF;
  END LOOP;
END
$containment_c1a$;


-- -----------------------------------------------------------------------------
-- C1b — APP-USED: tick_battle, join_battle, social_follow_counts
--   Remove PUBLIC + anon; KEEP authenticated (+ service_role, postgres).
--   Callers (all via requireSupabaseAuth user-scoped client):
--     tick_battle          src/lib/battle-arena.functions.ts:514 (tickBattle)
--     join_battle          src/lib/battle-arena.functions.ts:313, :329, :452;
--                          join_battle_by_code → join_battle (SECURITY DEFINER, runs as postgres);
--                          scripts/seed-replay-battle.ts:315 (user session)
--     social_follow_counts src/lib/social.functions.ts:242, :271;
--                          src/lib/community.functions.ts:563
--   Guard: authenticated must hold an EXPLICIT grant before PUBLIC is removed,
--   otherwise removing PUBLIC would silently remove authenticated access.
-- -----------------------------------------------------------------------------
DO $containment_c1b$
DECLARE
  expected CONSTANT text := '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}';
  f regprocedure;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'C1b: run as postgres (current_user=%)', current_user;
  END IF;

  -- tick_battle and join_battle: raw ACL captured in Phase 0 → exact match required.
  FOREACH f IN ARRAY ARRAY['public.tick_battle(uuid)'::regprocedure,
                           'public.join_battle(uuid,boolean)'::regprocedure] LOOP
    IF (SELECT array_agg(x ORDER BY x) FROM unnest((SELECT proacl FROM pg_proc WHERE oid = f)::text[]) x)
       IS DISTINCT FROM
       (SELECT array_agg(x ORDER BY x) FROM unnest(expected::text[]) x) THEN
      RAISE EXCEPTION 'C1b: ACL drift on % — live %, expected %. Nothing changed.',
        f, (SELECT proacl::text FROM pg_proc WHERE oid = f), expected;
    END IF;
  END LOOP;

  -- social_follow_counts: raw ACL NOT captured in Phase 0 (Q-B2 booleans only).
  -- Require the explicit entries that the revoke removes / the rollback re-adds,
  -- plus an explicit authenticated entry that must survive.
  f := 'public.social_follow_counts(uuid)'::regprocedure;
  IF NOT (SELECT proacl::text[] @> ARRAY['=X/postgres','anon=X/postgres','authenticated=X/postgres']
            FROM pg_proc WHERE oid = f) THEN
    RAISE EXCEPTION 'C1b: % ACL % lacks an expected explicit entry (PUBLIC/anon/authenticated). Nothing changed; recapture and regenerate rollback.',
      f, (SELECT proacl::text FROM pg_proc WHERE oid = f);
  END IF;

  REVOKE EXECUTE ON FUNCTION public.tick_battle(uuid)              FROM PUBLIC, anon;
  REVOKE EXECUTE ON FUNCTION public.join_battle(uuid, boolean)     FROM PUBLIC, anon;
  REVOKE EXECUTE ON FUNCTION public.social_follow_counts(uuid)     FROM PUBLIC, anon;

  FOREACH f IN ARRAY ARRAY['public.tick_battle(uuid)'::regprocedure,
                           'public.join_battle(uuid,boolean)'::regprocedure,
                           'public.social_follow_counts(uuid)'::regprocedure] LOOP
    IF has_function_privilege('anon', f, 'EXECUTE')
       OR NOT has_function_privilege('authenticated', f, 'EXECUTE')
       OR NOT has_function_privilege('service_role', f, 'EXECUTE') THEN
      RAISE EXCEPTION 'C1b: post-condition failed for %', f;
    END IF;
  END LOOP;
END
$containment_c1b$;


-- -----------------------------------------------------------------------------
-- C1c — JOURNAL HELPERS WITHOUT APPLICATION CALLERS
--   journal_sync_tag_arrays_for(uuid): no call site in src/, scripts/, e2e/.
--     Only callers are the two trigger functions below (SECURITY DEFINER,
--     owner postgres → nested call runs as postgres).
--   journal_entry_tags_sync_trg(), journal_tags_rename_sync_trg(): trigger
--     functions; PostgreSQL does not check the invoking role's EXECUTE when a
--     trigger fires (precedent: protect_profile_privileged_columns has no
--     anon/authenticated EXECUTE live and its trigger works — Q-B1/Q-C3/Q-D2).
--   Remove PUBLIC, anon, authenticated. Keep postgres + service_role.
--   Source of definitions: docs/migrations/tag-consolidation-chunks.sql chunks 8–9.
-- -----------------------------------------------------------------------------
DO $containment_c1c$
DECLARE
  f regprocedure;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'C1c: run as postgres (current_user=%)', current_user;
  END IF;

  -- Raw ACL NOT captured in Phase 0 (Q-B2 booleans only): require the explicit
  -- entries this block removes, so rollback.sql R1c restores them exactly.
  FOREACH f IN ARRAY ARRAY['public.journal_sync_tag_arrays_for(uuid)'::regprocedure,
                           'public.journal_entry_tags_sync_trg()'::regprocedure,
                           'public.journal_tags_rename_sync_trg()'::regprocedure] LOOP
    IF NOT (SELECT proacl::text[] @> ARRAY['=X/postgres','anon=X/postgres','authenticated=X/postgres']
              FROM pg_proc WHERE oid = f) THEN
      RAISE EXCEPTION 'C1c: % ACL % lacks an expected explicit entry. Nothing changed; recapture and regenerate rollback.',
        f, (SELECT proacl::text FROM pg_proc WHERE oid = f);
    END IF;
  END LOOP;

  REVOKE EXECUTE ON FUNCTION public.journal_sync_tag_arrays_for(uuid)  FROM PUBLIC, anon, authenticated;
  REVOKE EXECUTE ON FUNCTION public.journal_entry_tags_sync_trg()      FROM PUBLIC, anon, authenticated;
  REVOKE EXECUTE ON FUNCTION public.journal_tags_rename_sync_trg()     FROM PUBLIC, anon, authenticated;

  FOREACH f IN ARRAY ARRAY['public.journal_sync_tag_arrays_for(uuid)'::regprocedure,
                           'public.journal_entry_tags_sync_trg()'::regprocedure,
                           'public.journal_tags_rename_sync_trg()'::regprocedure] LOOP
    IF has_function_privilege('anon', f, 'EXECUTE')
       OR has_function_privilege('authenticated', f, 'EXECUTE')
       OR NOT has_function_privilege('postgres', f, 'EXECUTE') THEN   -- trigger functions call journal_sync_tag_arrays_for as postgres
      RAISE EXCEPTION 'C1c: post-condition failed for %', f;
    END IF;
  END LOOP;
END
$containment_c1c$;


-- -----------------------------------------------------------------------------
-- C2 — VERIFY (read-only). Run after each C1 block.
--   Expected after C1a+C1b+C1c:
--     signature                               public anon  auth  service
--     commit_settlement(uuid,uuid,numeric)    f      f     f     t
--     _join_battle_as(uuid,uuid)              f      f     f     t
--     tick_battle(uuid)                       f      f     t     t
--     join_battle(uuid,boolean)               f      f     t     t
--     social_follow_counts(uuid)              f      f     t     t
--     journal_sync_tag_arrays_for(uuid)       f      f     f     t
--     journal_entry_tags_sync_trg()           f      f     f     t
--     journal_tags_rename_sync_trg()          f      f     f     t
-- -----------------------------------------------------------------------------
SELECT p.oid::regprocedure AS signature,
       p.proacl::text      AS acl,
       (p.proacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                                     WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')) AS public_exec,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_exec,
       has_function_privilege('service_role',  p.oid, 'EXECUTE') AS service_role_exec
  FROM pg_proc p
 WHERE p.oid IN ('public.commit_settlement(uuid,uuid,numeric)'::regprocedure,
                 'public._join_battle_as(uuid,uuid)'::regprocedure,
                 'public.tick_battle(uuid)'::regprocedure,
                 'public.join_battle(uuid,boolean)'::regprocedure,
                 'public.social_follow_counts(uuid)'::regprocedure,
                 'public.journal_sync_tag_arrays_for(uuid)'::regprocedure,
                 'public.journal_entry_tags_sync_trg()'::regprocedure,
                 'public.journal_tags_rename_sync_trg()'::regprocedure)
 ORDER BY 1;

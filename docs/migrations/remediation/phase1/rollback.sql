-- =============================================================================
-- TradersHIVE remediation — Phase 1 ROLLBACK for containment.sql
-- =============================================================================
--
--   STATUS: PREPARED — NOT EXECUTED.
--
--   Restores the function EXECUTE privileges captured live on 2026-09-17
--   (docs/migrations/remediation/phase0-results/2026-09-17_Q-B1.csv, Q-B2.csv)
--   and re-asserted by containment.sql C0/C1 pre-checks immediately before
--   containment runs.
--
--   One-to-one mapping (every REVOKE in containment.sql has its GRANT here):
--
--     containment C1a  REVOKE … commit_settlement      FROM PUBLIC, anon, authenticated
--     rollback    R1a  GRANT  … commit_settlement      TO   PUBLIC, anon, authenticated
--     containment C1a  REVOKE … _join_battle_as        FROM PUBLIC, anon, authenticated
--     rollback    R1a  GRANT  … _join_battle_as        TO   PUBLIC, anon, authenticated
--     containment C1b  REVOKE … tick_battle            FROM PUBLIC, anon
--     rollback    R1b  GRANT  … tick_battle            TO   PUBLIC, anon
--     containment C1b  REVOKE … join_battle(uuid,bool) FROM PUBLIC, anon
--     rollback    R1b  GRANT  … join_battle(uuid,bool) TO   PUBLIC, anon
--     containment C1b  REVOKE … social_follow_counts   FROM PUBLIC, anon
--     rollback    R1b  GRANT  … social_follow_counts   TO   PUBLIC, anon
--     containment C1c  REVOKE … journal_sync_tag_arrays_for  FROM PUBLIC, anon, authenticated
--     rollback    R1c  GRANT  … journal_sync_tag_arrays_for  TO   PUBLIC, anon, authenticated
--     containment C1c  REVOKE … journal_entry_tags_sync_trg  FROM PUBLIC, anon, authenticated
--     rollback    R1c  GRANT  … journal_entry_tags_sync_trg  TO   PUBLIC, anon, authenticated
--     containment C1c  REVOKE … journal_tags_rename_sync_trg FROM PUBLIC, anon, authenticated
--     rollback    R1c  GRANT  … journal_tags_rename_sync_trg TO   PUBLIC, anon, authenticated
--
--   Run as postgres. Grantor then matches the captured entries ("…/postgres"):
--     GRANT … TO PUBLIC        → "=X/postgres"
--     GRANT … TO anon          → "anon=X/postgres"
--     GRANT … TO authenticated → "authenticated=X/postgres"
--   postgres=X/postgres and service_role=X/postgres are never revoked, so they
--   are not re-granted. PostgreSQL may list ACL entries in a different ORDER
--   after rollback; the verification compares the entry SET, which is what
--   determines access.
--
--   Roll back only the block(s) that were applied, newest first:
--     applied C1a+C1b+C1c → run R1c, R1b, R1a
--     applied C1a only    → run R1a
--   Each R1 block is idempotent (GRANT of an existing privilege is a no-op).
--   Then run R2 and compare with containment C0 output.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- R1c — restore journal helper EXECUTE
-- -----------------------------------------------------------------------------
DO $rollback_r1c$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'R1c: run as postgres (current_user=%)', current_user;
  END IF;

  GRANT EXECUTE ON FUNCTION public.journal_sync_tag_arrays_for(uuid)  TO PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.journal_entry_tags_sync_trg()      TO PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.journal_tags_rename_sync_trg()     TO PUBLIC, anon, authenticated;

  IF NOT (SELECT bool_and(proacl::text[] @> ARRAY['=X/postgres','anon=X/postgres','authenticated=X/postgres'])
            FROM pg_proc
           WHERE oid IN ('public.journal_sync_tag_arrays_for(uuid)'::regprocedure,
                         'public.journal_entry_tags_sync_trg()'::regprocedure,
                         'public.journal_tags_rename_sync_trg()'::regprocedure)) THEN
    RAISE EXCEPTION 'R1c: post-condition failed';
  END IF;
END
$rollback_r1c$;


-- -----------------------------------------------------------------------------
-- R1b — restore PUBLIC/anon on tick_battle, join_battle, social_follow_counts
-- -----------------------------------------------------------------------------
DO $rollback_r1b$
DECLARE
  expected CONSTANT text := '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}';
  f regprocedure;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'R1b: run as postgres (current_user=%)', current_user;
  END IF;

  GRANT EXECUTE ON FUNCTION public.tick_battle(uuid)           TO PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.join_battle(uuid, boolean)  TO PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.social_follow_counts(uuid)  TO PUBLIC, anon;

  -- tick_battle / join_battle: exact captured entry set.
  FOREACH f IN ARRAY ARRAY['public.tick_battle(uuid)'::regprocedure,
                           'public.join_battle(uuid,boolean)'::regprocedure] LOOP
    IF (SELECT array_agg(x ORDER BY x) FROM unnest((SELECT proacl FROM pg_proc WHERE oid = f)::text[]) x)
       IS DISTINCT FROM
       (SELECT array_agg(x ORDER BY x) FROM unnest(expected::text[]) x) THEN
      RAISE EXCEPTION 'R1b: % ACL % does not equal captured %', f,
        (SELECT proacl::text FROM pg_proc WHERE oid = f), expected;
    END IF;
  END LOOP;

  -- social_follow_counts: compare against containment C0 output by hand (R2).
  IF NOT (SELECT proacl::text[] @> ARRAY['=X/postgres','anon=X/postgres','authenticated=X/postgres']
            FROM pg_proc WHERE oid = 'public.social_follow_counts(uuid)'::regprocedure) THEN
    RAISE EXCEPTION 'R1b: social_follow_counts post-condition failed';
  END IF;
END
$rollback_r1b$;


-- -----------------------------------------------------------------------------
-- R1a — restore PUBLIC/anon/authenticated on commit_settlement, _join_battle_as
--   WARNING: this re-opens critical findings C-6 and C-7. Use only if C1a
--   caused a verified production regression.
-- -----------------------------------------------------------------------------
DO $rollback_r1a$
DECLARE
  expected CONSTANT text := '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}';
  f regprocedure;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'R1a: run as postgres (current_user=%)', current_user;
  END IF;

  GRANT EXECUTE ON FUNCTION public.commit_settlement(uuid, uuid, numeric) TO PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public._join_battle_as(uuid, uuid)            TO PUBLIC, anon, authenticated;

  FOREACH f IN ARRAY ARRAY['public.commit_settlement(uuid,uuid,numeric)'::regprocedure,
                           'public._join_battle_as(uuid,uuid)'::regprocedure] LOOP
    IF (SELECT array_agg(x ORDER BY x) FROM unnest((SELECT proacl FROM pg_proc WHERE oid = f)::text[]) x)
       IS DISTINCT FROM
       (SELECT array_agg(x ORDER BY x) FROM unnest(expected::text[]) x) THEN
      RAISE EXCEPTION 'R1a: % ACL % does not equal captured %', f,
        (SELECT proacl::text FROM pg_proc WHERE oid = f), expected;
    END IF;
  END LOOP;
END
$rollback_r1a$;


-- -----------------------------------------------------------------------------
-- R2 — VERIFY (read-only). Compare the sorted entry sets with containment C0
--      output saved before containment ran. Every row must show match = true.
-- -----------------------------------------------------------------------------
SELECT p.oid::regprocedure AS signature,
       p.proacl::text      AS acl_now,
       (SELECT array_agg(x ORDER BY x) FROM unnest(p.proacl::text[]) x) AS acl_entries_sorted,
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

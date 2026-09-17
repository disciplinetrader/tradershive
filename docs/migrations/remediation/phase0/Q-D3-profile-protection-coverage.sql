-- Q-D3 — Protection coverage: which competitive profile columns does the LIVE
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 18 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

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

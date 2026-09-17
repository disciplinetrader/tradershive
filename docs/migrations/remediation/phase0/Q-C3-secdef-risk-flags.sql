-- Q-C3 — Static risk flags on live SECURITY DEFINER bodies (heuristic, read-only)
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 15 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

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

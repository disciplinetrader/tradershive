-- Q-B2 — Full map: EVERY public SECURITY DEFINER function callable by anon or authenticated
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 10 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

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

-- =============================================================================
-- TradersHIVE remediation — PROPOSED default-privileges migration (Phase 1.3)
-- =============================================================================
--
--   STATUS: PROPOSAL — NOT EXECUTED, NOT APPROVED.
--   SEPARATE from containment.sql on purpose. Containment fixes 8 existing
--   functions; this file changes what EVERY FUTURE object gets. It alters how
--   new Lovable-generated migrations behave, so it must be rehearsed and
--   approved on its own (REHEARSAL.md §7).
--
--   Root cause (finding D-1 / N-5 / N-8), live 2026-09-17, Q-B3:
--     FOR ROLE postgres       IN SCHEMA public  functions  {postgres=X, anon=X, authenticated=X, service_role=X}
--     FOR ROLE postgres       IN SCHEMA public  tables     {postgres=arwdDxtm, anon=arwdDxtm, authenticated=arwdDxtm, service_role=arwdDxtm, sandbox_exec=ar}
--     FOR ROLE supabase_admin IN SCHEMA public  functions  {postgres=X, anon=X, authenticated=X, service_role=X}
--     FOR ROLE supabase_admin IN SCHEMA public  tables     {postgres=arwdDxtm, anon=arwdDxtm, authenticated=arwdDxtm, service_role=arwdDxtm}
--     + PostgreSQL's built-in default: EXECUTE on every new function to PUBLIC
--       (not stored in pg_default_acl until altered).
--
--   Privilege letters: a=INSERT r=SELECT w=UPDATE d=DELETE D=TRUNCATE
--                      x=REFERENCES t=TRIGGER m=MAINTAIN (PG17) X=EXECUTE
--
--   Rollback: default-privileges.rollback.sql (exact inverse, statement by statement).
--
--   ---------------------------------------------------------------------------
--   KNOWN CONSTRAINTS — resolve in rehearsal before any production use
--   ---------------------------------------------------------------------------
--   K1. "FOR ROLE supabase_admin" requires the executing role to be a member of
--       supabase_admin (or superuser). On Supabase/Lovable Cloud, postgres is
--       usually NOT. Expect 42501 for D2/D4/D6 when run as postgres. If so, those
--       statements need Lovable/Supabase support; D1/D3/D5 still apply to
--       objects created by postgres (which is how Lovable migrations and the SQL
--       editor create objects — every audited function is owned by postgres,
--       Q-B1).
--   K2. Removing PUBLIC EXECUTE from future functions can ONLY be done globally
--       (no IN SCHEMA): per-schema default ACLs can add privileges but cannot
--       remove the built-in PUBLIC grant. D3/D4 therefore affect functions
--       created by that role in EVERY schema, not just public.
--   K3. Behaviour change: after D1–D4, a new function is callable only by its
--       owner and service_role. Any future RPC the app calls as a signed-in user
--       needs an explicit GRANT EXECUTE … TO authenticated in its migration.
--       Record this rule in AGENTS.md / Lovable project knowledge BEFORE
--       applying, or new features will fail with 42501.
--   K4. Tables: only TRUNCATE, REFERENCES, TRIGGER, MAINTAIN are removed for
--       anon/authenticated. SELECT/INSERT/UPDATE/DELETE stay, because Lovable's
--       table-plus-RLS workflow depends on them and RLS remains the row gate.
--       Removing DML from anon for future tables is deliberately deferred
--       (Option B at the bottom, commented out).
--   K5. Existing objects are NOT affected. Existing tables still carry
--       anon/authenticated TRUNCATE/TRIGGER/REFERENCES (N-8); that needs its own
--       migration later.
--   K6. sandbox_exec (ar on tables in public/extensions/auth) is left untouched;
--       its owner/purpose is unknown (Phase 0 §10). Confirm with Lovable first.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- D0 — CAPTURE (read-only). Save output; it is the rollback baseline.
-- -----------------------------------------------------------------------------
SELECT pg_get_userbyid(d.defaclrole) AS for_role,
       CASE WHEN d.defaclnamespace = 0 THEN '(global)' ELSE d.defaclnamespace::regnamespace::text END AS in_schema,
       d.defaclobjtype AS objtype,
       d.defaclacl::text AS acl
  FROM pg_default_acl d
 WHERE pg_get_userbyid(d.defaclrole) IN ('postgres','supabase_admin')
 ORDER BY 1, 2, 3;


-- -----------------------------------------------------------------------------
-- FUNCTIONS
-- -----------------------------------------------------------------------------

-- D1 — postgres: future functions in public no longer granted to anon/authenticated
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;

-- D2 — supabase_admin: same (see K1)
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;

-- D3 — postgres: remove built-in PUBLIC EXECUTE on future functions (GLOBAL, see K2)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- D4 — supabase_admin: same (GLOBAL; see K1, K2 — also affects Supabase-managed
--      functions supabase_admin creates in other schemas; consider omitting)
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;


-- -----------------------------------------------------------------------------
-- TABLES (TRUNCATE / REFERENCES / TRIGGER / MAINTAIN only — see K4)
-- -----------------------------------------------------------------------------

-- D5 — postgres
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES FROM anon, authenticated;

-- D6 — supabase_admin (see K1)
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES FROM anon, authenticated;


-- -----------------------------------------------------------------------------
-- D7 — VERIFY (read-only). Expected after D1–D6 (if D2/D4/D6 permitted):
--   postgres       (global)  f  {postgres=X/postgres}                                    ← D3 creates this row
--   postgres       public    f  {postgres=X/postgres,service_role=X/postgres}
--   postgres       public    r  {postgres=arwdDxtm/postgres,anon=arwd/postgres,authenticated=arwd/postgres,service_role=arwdDxtm/postgres,sandbox_exec=ar/postgres}
--   supabase_admin (global)  f  {supabase_admin=X/supabase_admin}                        ← D4 creates this row
--   supabase_admin public    f  {postgres=X/supabase_admin,service_role=X/supabase_admin}
--   supabase_admin public    r  {postgres=arwdDxtm/supabase_admin,anon=arwd/supabase_admin,authenticated=arwd/supabase_admin,service_role=arwdDxtm/supabase_admin}
--   (sequence rows unchanged)
-- -----------------------------------------------------------------------------
SELECT pg_get_userbyid(d.defaclrole) AS for_role,
       CASE WHEN d.defaclnamespace = 0 THEN '(global)' ELSE d.defaclnamespace::regnamespace::text END AS in_schema,
       d.defaclobjtype AS objtype,
       d.defaclacl::text AS acl
  FROM pg_default_acl d
 WHERE pg_get_userbyid(d.defaclrole) IN ('postgres','supabase_admin')
 ORDER BY 1, 2, 3;


-- -----------------------------------------------------------------------------
-- OPTION B — DEFERRED, NOT PART OF THIS PROPOSAL. Stricter anon table defaults.
-- Requires every future table migration to GRANT anon explicitly where public
-- read is intended. Do not uncomment without a separate decision.
-- -----------------------------------------------------------------------------
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--   REVOKE INSERT, UPDATE, DELETE ON TABLES FROM anon;

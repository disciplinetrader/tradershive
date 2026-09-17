-- =============================================================================
-- TradersHIVE remediation — ROLLBACK for default-privileges.proposed.sql
-- =============================================================================
--   STATUS: PREPARED — NOT EXECUTED.
--   Exact inverse of D1–D6, restoring the 2026-09-17 capture
--   (phase0-results/2026-09-17_Q-B3.csv). Run only the statements whose
--   forward counterpart succeeded, in reverse order. Run as the same role
--   that ran the forward statements.
--
--   Forward → rollback
--     D6 REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES FROM anon, authenticated (supabase_admin, public)
--        → RB6 GRANT the same TO anon, authenticated
--     D5 same for postgres                     → RB5
--     D4 REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC (supabase_admin, global) → RB4 GRANT … TO PUBLIC
--     D3 same for postgres                     → RB3
--     D2 REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated (supabase_admin, public) → RB2 GRANT … TO anon, authenticated
--     D1 same for postgres                     → RB1
--
--   Note: GRANT … TO PUBLIC at global level returns the role to PostgreSQL's
--   built-in default, and PostgreSQL removes the now-redundant global
--   pg_default_acl row. Afterwards, D7 output must equal the D0 capture.
-- =============================================================================

-- RB6
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES TO anon, authenticated;

-- RB5
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES TO anon, authenticated;

-- RB4
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin
  GRANT EXECUTE ON FUNCTIONS TO PUBLIC;

-- RB3
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  GRANT EXECUTE ON FUNCTIONS TO PUBLIC;

-- RB2
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;

-- RB1
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;

-- RB7 — VERIFY (read-only): must equal default-privileges.proposed.sql D0 output.
SELECT pg_get_userbyid(d.defaclrole) AS for_role,
       CASE WHEN d.defaclnamespace = 0 THEN '(global)' ELSE d.defaclnamespace::regnamespace::text END AS in_schema,
       d.defaclobjtype AS objtype,
       d.defaclacl::text AS acl
  FROM pg_default_acl d
 WHERE pg_get_userbyid(d.defaclrole) IN ('postgres','supabase_admin')
 ORDER BY 1, 2, 3;

-- Q-B3 — Default privileges — root cause for newly created functions being exposed (C-7)
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 11 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-B3  Default privileges — root cause for newly created functions being exposed (C-7)
SELECT pg_get_userbyid(d.defaclrole) AS for_role,
       d.defaclnamespace::regnamespace AS in_schema,
       CASE d.defaclobjtype WHEN 'f' THEN 'functions' WHEN 'r' THEN 'tables'
                            WHEN 'S' THEN 'sequences' WHEN 'T' THEN 'types'
                            WHEN 'n' THEN 'schemas' ELSE d.defaclobjtype::text END AS object_type,
       d.defaclacl::text AS acl
  FROM pg_default_acl d
 ORDER BY for_role, in_schema, object_type;

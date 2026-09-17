-- Q-D1 — profiles policies (subset of Q-A2, repeated for a self-contained D result)
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 16 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-D1  profiles policies (subset of Q-A2, repeated for a self-contained D result)
SELECT policyname, permissive, roles, cmd, qual AS using_expr, with_check AS with_check_expr
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'profiles'
 ORDER BY cmd, policyname;

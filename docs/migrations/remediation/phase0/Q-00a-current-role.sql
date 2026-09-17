-- Q-00a — Server version, current role, database, time
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 1 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-00a  Server version, current role, database, time
SELECT version() AS pg_version,
       current_user AS run_as,
       current_database() AS db,
       now() AS captured_at;

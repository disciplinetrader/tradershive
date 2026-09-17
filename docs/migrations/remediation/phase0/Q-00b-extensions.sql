-- Q-00b — Installed extensions relevant to this phase
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 2 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-00b  Installed extensions relevant to this phase
SELECT extname, extversion
  FROM pg_extension
 WHERE extname IN ('pg_cron','pg_net','supabase_vault','pgsodium','pgcrypto','pg_graphql')
 ORDER BY extname;

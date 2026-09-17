-- Q-G5 — Vault secret NAMES only (no values). May be permission-denied — record that.
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 34 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-G5  Vault secret NAMES only (no values). May be permission-denied — record that.
SELECT name, description, created_at, updated_at
  FROM vault.secrets
 ORDER BY name;

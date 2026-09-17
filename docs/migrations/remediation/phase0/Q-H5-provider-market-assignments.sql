-- Q-H5 — Provider market assignments (no credentials)
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 39 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-H5  Provider market assignments (no credentials)
SELECT market_kind, primary_code, fallback_code, updated_at, updated_by
  FROM public.provider_market_assignments
 ORDER BY market_kind;

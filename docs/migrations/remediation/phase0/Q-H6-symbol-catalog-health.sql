-- Q-H6 — Symbol catalog health by provider
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 40 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-H6  Symbol catalog health by provider
SELECT source_code, is_enabled, count(*) AS symbols,
       count(*) FILTER (WHERE latest_imported IS NULL) AS never_imported,
       min(latest_imported) AS stalest_front_edge, max(latest_imported) AS freshest_front_edge
  FROM public.historical_symbols
 GROUP BY 1, 2
 ORDER BY 1, 2;

-- Q-F4 — Month coverage — auto-create of next month's championship happening?
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 29 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-F4  Month coverage — auto-create of next month's championship happening?
SELECT season_year, season_month, count(*) AS championships, min(status::text) AS a_status, min(created_at) AS created
  FROM public.championships
 GROUP BY season_year, season_month
 ORDER BY season_year DESC NULLS LAST, season_month DESC NULLS LAST
 LIMIT 24;

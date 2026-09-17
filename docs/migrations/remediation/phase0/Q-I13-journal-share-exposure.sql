-- Q-I13 — Journal shares exposure size (S-2) — counts only, no content
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 57 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-I13  Journal shares exposure size (S-2) — counts only, no content
SELECT count(*) FILTER (WHERE is_public AND share_token IS NOT NULL) AS listable_under_repo_policy,
       count(*) FILTER (WHERE is_public)                             AS is_public_rows,
       count(*) FILTER (WHERE share_token IS NOT NULL)               AS rows_with_token,
       count(DISTINCT user_id) FILTER (WHERE is_public AND share_token IS NOT NULL) AS distinct_owners
  FROM public.journal_entries;

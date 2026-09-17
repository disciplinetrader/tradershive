-- Q-I9b — Prop status census (counts deleted-evidence cannot be recovered; this is the baseline)
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 53 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-I9b  Prop status census (counts deleted-evidence cannot be recovered; this is the baseline)
SELECT status, result, count(*) AS n, max(updated_at) AS latest
  FROM public.prop_challenges
 GROUP BY 1, 2
 ORDER BY n DESC;

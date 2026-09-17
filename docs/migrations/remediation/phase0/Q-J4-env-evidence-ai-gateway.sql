-- Q-J4 — Evidence of AI gateway use (LOVABLE_API_KEY path reached)
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 61 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-J4  Evidence of AI gateway use (LOVABLE_API_KEY path reached)
SELECT bucket, count(*) AS windows, sum(count) AS requests, max(updated_at) AS latest
  FROM public.ai_rate_limits
 WHERE updated_at > now() - interval '7 days'
 GROUP BY bucket
 ORDER BY latest DESC;

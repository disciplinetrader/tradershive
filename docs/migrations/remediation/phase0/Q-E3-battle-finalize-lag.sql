-- Q-E3 — Who finalized completed battles? Completion lag vs end_at is a proxy:
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 22 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-E3  Who finalized completed battles? Completion lag vs end_at is a proxy:
--       ~seconds after end_at from a viewer tick; ≤1–2 min from cron; hours = host/manual/backlog.
SELECT date_trunc('week', b.end_at) AS week,
       count(*) AS completed,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (b.updated_at - b.end_at))::float8) AS median_lag_s,
       max(extract(epoch FROM (b.updated_at - b.end_at))) AS max_lag_s,
       count(*) FILTER (WHERE b.updated_at < b.end_at) AS completed_before_end_at   -- early host finalize (B-2)
  FROM public.battles b
 WHERE b.status = 'completed'
 GROUP BY 1
 ORDER BY 1 DESC
 LIMIT 26;

-- Q-I6 — Trades modified after close (possible post-close pnl edits via UPDATE path)
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 49 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-I6  Trades modified after close (possible post-close pnl edits via UPDATE path)
SELECT (battle_id IS NOT NULL) AS is_battle, (championship_id IS NOT NULL) AS is_championship,
       count(*) AS closed_then_updated,
       count(*) FILTER (WHERE updated_at > closed_at + interval '1 day') AS updated_over_1d_after_close
  FROM public.paper_trades
 WHERE status='closed' AND closed_at IS NOT NULL AND updated_at > closed_at + interval '1 minute'
 GROUP BY 1, 2;

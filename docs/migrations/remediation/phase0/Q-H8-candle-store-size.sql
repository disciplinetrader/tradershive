-- Q-H8 — Size of candle store (planner estimate — avoids a full count on the big table)
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 42 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-H8  Size of candle store (planner estimate — avoids a full count on the big table)
SELECT relname, n_live_tup AS est_rows, last_autoanalyze
  FROM pg_stat_user_tables
 WHERE schemaname = 'public' AND relname IN ('historical_candles','historical_import_jobs','historical_sync_logs');

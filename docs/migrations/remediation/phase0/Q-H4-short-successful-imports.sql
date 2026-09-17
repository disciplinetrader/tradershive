-- Q-H4 — "Successful" jobs that fetched far fewer bars than the range implies (H-1 signal)
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 38 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-H4  "Successful" jobs that fetched far fewer bars than the range implies (H-1 signal)
--       expected_min_bars assumes 1m ≈ 5/7 trading coverage; a ratio < 0.2 on multi-day
--       ranges suggests the page loop stopped early.
SELECT id, symbol, timeframe, source_code, triggered_by, range_from, range_to,
       candles_fetched,
       round(extract(epoch FROM (range_to - range_from)) / 86400.0, 2) AS range_days,
       CASE timeframe WHEN '1m' THEN extract(epoch FROM (range_to - range_from)) / 60 * 5.0 / 7
                      WHEN '5m' THEN extract(epoch FROM (range_to - range_from)) / 300 * 5.0 / 7
                      WHEN '15m' THEN extract(epoch FROM (range_to - range_from)) / 900 * 5.0 / 7
                      WHEN '1h' THEN extract(epoch FROM (range_to - range_from)) / 3600 * 5.0 / 7 END AS expected_min_bars
  FROM public.historical_import_jobs
 WHERE status = 'success' AND source_code = 'twelvedata'
   AND range_to - range_from > interval '4 days'
   AND created_at > now() - interval '30 days'
 ORDER BY created_at DESC
 LIMIT 200;

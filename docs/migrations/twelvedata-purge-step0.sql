-- MD-2 STEP 0 — measurement only, nothing is deleted.
-- Bare copy of step 0 from twelvedata-cache-purge.sql, comments stripped, so
-- each paste is short enough not to be truncated. Run 0a and 0b separately.

-- 0a
select date_trunc('hour', created_at) as import_batch,
       symbol,
       timeframe,
       count(*) as rows,
       min(ts) as first_bar,
       max(ts) as last_bar,
       count(*) filter (where extract(dow from ts) = 6) as saturday_bars
  from public.historical_candles
 where provider_code = 'twelvedata'
 group by 1, 2, 3
 order by import_batch;

-- 0b
select min(created_at) as first_written,
       max(created_at) as last_written,
       count(*) filter (where created_at >= timestamptz '2026-08-13 09:45:26+00') as written_after_fix_commit,
       count(*) as rows_total
  from public.historical_candles
 where provider_code = 'twelvedata';

-- STEP 2. Run AFTER the Bybit import, BEFORE deleting anything.
--
-- The delete in step 3 is irreversible against a provider we cannot re-reach,
-- so this is the gate. Two things must both be true.
--
-- (a) Bybit rows exist for every crypto symbol, at the timeframes that matter.
SELECT symbol, timeframe, provider_code, count(*) AS candles,
       min(ts)::date AS oldest, max(ts)::date AS newest
  FROM public.historical_candles
 WHERE symbol LIKE '%USDT'
 GROUP BY symbol, timeframe, provider_code
 ORDER BY symbol, timeframe, provider_code;

-- (b) Battle Arena's dependency is satisfied. `scripts/seed-replay-battle.ts`
--     reads BTC/USDT 5m over 2026-07-01..2026-07-31 (8,644 bars from Binance).
--     Bybit must cover that window at 5m BEFORE the Binance rows go, or the
--     battle seed breaks with no way to rebuild it.
SELECT provider_code,
       count(*) AS bars,
       min(ts) AS first_bar,
       max(ts) AS last_bar
  FROM public.historical_candles
 WHERE symbol = 'BTC/USDT'
   AND timeframe = '5m'
   AND ts >= '2026-07-01' AND ts < '2026-08-01'
 GROUP BY provider_code
 ORDER BY provider_code;

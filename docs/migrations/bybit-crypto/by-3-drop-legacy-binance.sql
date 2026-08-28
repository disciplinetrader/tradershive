-- STEP 3. Run ONLY after step 2 shows Bybit covering the 2026-07 window at 5m.
--
-- WHY THIS DELETE IS NECESSARY AND NOT OPTIONAL
--
-- `upsertCandles` conflicts on (symbol, timeframe, provider_code, ts), so
-- Binance and Bybit rows for the SAME bar coexist. `readStored`
-- (`historical/service.server.ts`) does NOT filter by `provider_code` — it
-- selects every row for symbol+timeframe in range. So the 8,644 Binance 5m
-- rows over 2026-07 would be returned ALONGSIDE Bybit's, and every bar in that
-- window arrives twice: `checkCoverage.actual` roughly doubles, and the
-- excursion path array doubles with it. That is MD-4's shape, created fresh.
--
-- Count first. Expect 8,644.
SELECT count(*) AS rows_to_delete
  FROM public.historical_candles
 WHERE provider_code = 'binance';

-- Then delete. Scoped to the provider, not the symbol: Binance wrote nothing
-- else, and anything it did write is equally unreachable to re-verify.
DELETE FROM public.historical_candles
 WHERE provider_code = 'binance';

-- Confirm no duplicate bars survive anywhere.
SELECT symbol, timeframe, ts, count(*) AS dupes
  FROM public.historical_candles
 WHERE symbol LIKE '%USDT'
 GROUP BY symbol, timeframe, ts
HAVING count(*) > 1
 LIMIT 20;

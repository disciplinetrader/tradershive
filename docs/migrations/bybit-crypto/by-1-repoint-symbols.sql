-- STEP 1 of the Bybit cutover. Run AFTER the code deploy, BEFORE any import.
--
-- Re-points the eight enrolled crypto symbols from Binance to Bybit.
--
-- `native_symbol` is deliberately NOT touched. Bybit lists all eight under
-- exactly the tickers already stored (BTCUSDT, ETHUSDT, ...), verified
-- 2026-08-28 against its 546 listed spot instruments. There is nothing to
-- migrate there.
--
-- Without this, imports still work — `resolveHistoricalProvider` overrides a
-- non-canonical stored code to the canonical one — but every job logs an
-- `overrode: true` warning, and the row keeps claiming a provider it does not
-- use. Do the update; do not lean on the override.
UPDATE public.historical_symbols
   SET source_code = 'bybit',
       updated_at  = now()
 WHERE market = 'crypto'
   AND source_code = 'binance';

-- Expect 8 rows. Verify:
SELECT symbol, source_code, native_symbol, is_enabled, latest_imported
  FROM public.historical_symbols
 WHERE market = 'crypto'
 ORDER BY symbol;

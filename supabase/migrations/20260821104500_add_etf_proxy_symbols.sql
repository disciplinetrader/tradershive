-- Add the four index ETF proxies to the historical catalog.
--
-- SPY / QQQ / DIA / IWM have been fully implemented on the TRADING side since
-- the 2026-08-14 entitlement decision — paper-trading specs
-- (`paper-trading/symbols.ts:67`), Twelve Data candles and Finnhub quotes
-- (`providers/twelvedata.ts:58`, `providers/finnhub.ts:45`), the battle-arena
-- indices category, the dashboard and the replay creator. `historical_symbols`
-- is the ONE catalog that never got them, so historical-sync has never
-- backfilled them and Replay Studio has no depth to roll a session on.
--
-- This closes that gap. It is not a new product decision: the decision was
-- that indices are traded as the ETFs THEMSELVES, named as the ETFs they are,
-- with no proxy arithmetic — and `SPX500` / `NAS100` / `US30` deliberately left
-- unclaimed so a real index feed can take those names later without renaming
-- anything. Those rows stay disabled (MD-7); these are separate instruments,
-- not aliases of them.
--
-- Verified against the live key 2026-08-21, each `type: ETF` on its own
-- exchange, each matching the trading catalog's refPrice within a few percent:
--
--   SPY  $762.64  (refPrice 777.88)   QQQ  $710.95  (refPrice 732.07)
--   DIA  $527.50  (refPrice 537.91)   IWM  $297.68  (refPrice 303.50)
--
-- So none of them repeats GER40's failure, where `DAX` answered 200 with a
-- $46.98 NASDAQ ETF standing in for a ~24,000pt index. Each points at the
-- instrument its name claims.
--
-- `native_symbol` equals `symbol` on purpose: nativeSymbolForProvider returns
-- the stored value when source_code matches the resolved provider, and the
-- Twelve Data ticker IS the engine symbol here. No mapping to drift.
--
-- market = 'indices' routes to twelvedata (routing.ts) and already carries the
-- 6.5/24 session fraction in coverage.ts, which is correct: these trade US
-- regular hours only, so a 2-day seed is ~780 bars rather than forex's 2,880.
--
-- Budget impact: none. The sync slice is 2 forward + 2 backward per run
-- regardless of catalog size, so this lengthens the rotation rather than
-- raising spend — still 4 credits/run, 384/day. Time to full 120-day depth
-- moves from ~5.6 days at 18 symbols to ~6.9 days at 22.
--
-- Priorities continue after the reserved index block (170-200) so those names
-- keep their slots. Idempotent on UNIQUE(source_code, symbol).

insert into public.historical_symbols
  (source_code, market, symbol, native_symbol, display_name, base_timeframe, is_enabled, priority)
values
  ('twelvedata','indices','SPY','SPY','S&P 500 ETF',      '1m', true, 210),
  ('twelvedata','indices','QQQ','QQQ','Nasdaq 100 ETF',   '1m', true, 220),
  ('twelvedata','indices','DIA','DIA','Dow 30 ETF',       '1m', true, 230),
  ('twelvedata','indices','IWM','IWM','Russell 2000 ETF', '1m', true, 240)
on conflict (source_code, symbol) do nothing;

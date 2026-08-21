-- MD-7 · disable catalog symbols this deployment's providers cannot serve.
--
-- Measured 2026-08-21 against the live Twelve Data key, every enabled symbol,
-- one request each at interval=1min. Not inferred from market class: XAU/USD
-- serves and XAG/USD is plan-gated, so "metals work" was already too broad.
--
-- Seven of 25 Twelve Data symbols cannot produce data, for THREE distinct
-- reasons that a 404 status alone does not distinguish:
--
--   plan-gated ...... WTI/USD, XAG/USD, SPX500(SPX)
--                     "available starting with the Grow or Venture plan"
--                     -> an account upgrade would fix these
--   invalid ticker .. BRENT/USD, NAS100(IXIC), US30(DJI)
--                     "symbol is missing or invalid"
--                     -> no plan fixes these; the ticker does not exist
--   WRONG INSTRUMENT  GER40(DAX)
--                     HTTP 200, type=ETF, exchange=NASDAQ, close $46.98
--                     -> a ~24,000pt German index in EUR resolving to a $47
--                        US-listed ETF. This one SUCCEEDS and stores garbage.
--
-- GER40 is why this is a migration rather than two exclusions. Disabling only
-- the symbols that error would have left GER40 to import 2,880 candles of the
-- wrong instrument under a phase='completed' job row.
--
-- Root cause is drift, not a new fault. Migration 20260731054056 wrote
-- native_symbol='SPX'/'IXIC'/'DJI'/'DAX' onto the index rows. The 2026-08-14
-- ETF-proxy decision removed those mappings from routing.ts, whose comment
-- says they are "intentionally left unmapped and unclaimed" -- but the code
-- change never reached the data, and nativeSymbolForProvider() returns the
-- STORED native_symbol whenever source_code matches the resolved provider
-- (routing.ts:127). The map deletion is bypassed entirely by the rows.
--
-- Idempotent: re-running changes nothing once applied.

update public.historical_symbols
   set is_enabled = false, updated_at = now()
 where symbol in ('WTI/USD','BRENT/USD','XAG/USD','SPX500','NAS100','US30','GER40')
   and is_enabled = true;

-- native_symbol is NOT NULL so it cannot be cleared. Repointing GER40 at its
-- canonical name means that if the row is ever re-enabled it 404s LOUDLY
-- rather than silently importing a $47 NASDAQ ETF as a German index.
update public.historical_symbols
   set native_symbol = 'GER40', updated_at = now()
 where symbol = 'GER40'
   and native_symbol = 'DAX';

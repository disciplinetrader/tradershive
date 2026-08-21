-- ═══════════════════════════════════════════════════════════════════════════
-- RESOLVED 2026-08-21 — DO NOT RUN STEP 2. THIS PURGE IS CANCELLED.
--
-- MD-2 is closed by measurement, not by argument. STEP 1's value comparison
-- was finally run against both stored batches, and both are CLEAN:
--
--   EUR/USD 15m, the exact 4,735-row batch written 2026-08-14 13:41 that this
--   file was written to delete:
--     2026-07-15 00:00Z  stored open 1.14241  = fresh 1.14241   clean
--     2026-07-15 10:00Z  stored open 1.14180  = fresh 1.14180   clean
--     2026-07-15 13:45Z  stored open 1.14270  = fresh 1.14270   clean
--
--   GBP/USD 15m, written 2026-08-20 10:21 by an admin import:
--     2026-08-14 14:30Z  stored open 1.35598  = fresh 1.35598   clean
--     2026-08-15 00:00Z  stored open 1.35293  = fresh 1.35293   clean
--     2026-08-15 00:30Z  stored open 1.35331  = fresh 1.35331   clean
--
-- A +10h shift would have put 1.34956 at 14:30 — 64 pips away, not a rounding
-- question. Two independently-written batches across two symbols are correct.
--
-- The "third writer" this file also worried about does not exist either. The
-- chart cache-through path has never written a single row (MD-8): its
-- `onConflict` named a constraint the table does not have, and the error was
-- never inspected. So `provider_code = 'twelvedata'` rows come from the
-- importer alone, and they are clean.
--
-- Running STEP 2 would delete correct forex data that costs credits to
-- replace, on a premise that has now been tested twice and failed twice --
-- first as the invalid Saturday-bar count (MD-5), now as a value comparison.
-- STEP 0 and STEP 1 are kept as the method that settled it. STEP 2 is struck.
-- ═══════════════════════════════════════════════════════════════════════════

-- MD-2 · purge the timezone-poisoned Twelve Data cache.
--
-- Recorded as outstanding in docs/known-issues.md since 2026-08-13 and never
-- applied. On 2026-08-20 it stopped being a stale warning: MSYM-1's
-- two-instrument observation was about to be built on EUR/USD, and all 4,735
-- of its 15m rows are provider_code='twelvedata'. The contamination is
-- reaching new work, which is why this now goes first.
--
-- ── What is wrong with the rows ───────────────────────────────────────────
--
-- Forex candles were stamped ~10 hours into the future: a vendor datetime
-- string was parsed as if it carried a zone it never promised. Fixed in
-- 08f52e13, "fix(market-data): forex candles were stamped ~10 hours into the
-- future", committed 2026-08-13 09:45:26 UTC, which pinned `timezone=UTC` on
-- every /time_series call. Binance rows are immune by construction — epoch
-- milliseconds cannot be misread as a local time — and must be KEPT.
--
-- ── Two things that make this different from the 2026-08-13 note ──────────
--
-- 1. The recorded remedy is unscoped: `delete ... where provider_code =
--    'twelvedata'`. That was safe when written. It is not obviously safe now,
--    because rows written AFTER the fix are correct, and deleting them costs a
--    refetch against the 8-credits/min budget that failed GBP/USD's import
--    twice on 2026-08-20 (MD-1). Over-deleting is no longer free.
--
-- 2. The recorded count was 36,267 twelvedata rows. EUR/USD now holds 4,735.
--    Those do not reconcile, and nobody knows why — a partial cleanup, other
--    symbols since removed, or a count taken against different state. STEP 0
--    answers it. Do not delete anything until it does.
--
-- NOT a `do` block. In this SQL editor a DO block runs, raises every NOTICE,
-- and discards its writes (EC-8). Plain statements only, run separately, each
-- verified from its returned rows.

-- ── STEP 0 · MEASURE. Nothing is deleted here. ────────────────────────────
-- `provider_code` alone is NOT a clean boundary, and this step is what makes
-- the scope precise instead of assumed. Twelve Data rows written AFTER the fix
-- deployed are correct, and deleting them costs credits we do not have.
--
-- 0a · Import BATCHES. Rows from one import share a narrow created_at window,
-- so a batch is the unit that is poisoned or clean — not an individual row.
-- `saturday_bars` is the evidence: forex closes Friday 22:00 UTC, so a batch
-- containing Saturday bars has been shifted. That is a property of the DATA,
-- not of a provider label or a guessed timestamp.

select date_trunc('hour', created_at) as import_batch,
       symbol,
       timeframe,
       count(*)                                                as rows,
       min(ts)                                                 as first_bar,
       max(ts)                                                 as last_bar,
       count(*) filter (where extract(dow from ts) = 6)        as saturday_bars
  from public.historical_candles
 where provider_code = 'twelvedata'
 group by 1, 2, 3
 order by import_batch;

-- READ IT LIKE THIS:
--   saturday_bars > 0   → that batch is definitively shifted. Delete it.
--   saturday_bars = 0   → NOT proof of cleanliness. A batch covering only
--                         Monday–Thursday cannot show Saturday bars whether it
--                         is shifted or not. Fall back to 0b.
--
-- 0b · The timestamp question, answered rather than guessed. The fix commit
-- 08f52e13 is 2026-08-13 09:45:26 UTC; the DEPLOY is later than that by an
-- unknown amount.

select min(created_at) as first_written,
       max(created_at) as last_written,
       count(*) filter (where created_at >= timestamptz '2026-08-13 09:45:26+00') as written_after_fix_commit,
       count(*)        as rows_total
  from public.historical_candles
 where provider_code = 'twelvedata';

-- If `written_after_fix_commit` is 0, then no twelvedata row can possibly be
-- correct, `provider_code` IS a clean boundary after all, and STEP 2 may drop
-- its date predicate entirely. This is the expected outcome and it makes the
-- whole scoping question moot — but it is now CHECKED rather than assumed.
--
-- If it is NOT 0, do not delete on a guessed boundary. Take the earliest
-- created_at of the first batch showing `saturday_bars = 0` AND written after
-- the fix, and use that as <BOUNDARY> in STEP 2. Rows at or after it are
-- correct and must be kept.

-- ── STEP 1 · CONFIRM the poisoning — REWRITTEN 2026-08-20 ─────────────────
--
-- THE ORIGINAL VERSION OF THIS STEP WAS WRONG. It counted Saturday bars and
-- called them proof of a ~10h shift, reasoning that forex closes Friday 22:00
-- UTC so legitimate data has none. The premise is false: **Twelve Data serves
-- continuous 24/7 forex.** Measured 2026-08-20 against the live API, same
-- params the pipeline sends — GBP/USD 15m, 2026-07-10 to 07-13, timezone=UTC
-- — returned 96 bars on Friday, 96 on SATURDAY, 96 on Sunday, with genuine
-- OHLC movement (1.33954-1.34039), not flat carries. See MD-5.
--
-- So Saturday bars prove nothing, EUR/USD's 672 of them prove nothing, and
-- whether its rows are shifted at all is OPEN again.
--
-- The valid discriminator is a VALUE comparison. Fetch a window fresh and ask
-- whether the stored bar at time T carries the OHLC that fresh data shows at
-- T, or the OHLC it shows at T-10h.
--
-- Reference values, fetched 2026-08-20 with timezone=UTC (EUR/USD 15m):
--
--   2026-07-15 00:00:00Z   open 1.14241  close 1.14270
--   2026-07-15 10:00:00Z   open 1.14180  close 1.14157
--   2026-07-15 13:45:00Z   open 1.14270  close 1.14341

select ts, open, high, low, close
  from public.historical_candles
 where symbol = 'EUR/USD' and timeframe = '15m'
   and ts in (timestamptz '2026-07-15 00:00:00+00',
              timestamptz '2026-07-15 10:00:00+00',
              timestamptz '2026-07-15 13:45:00+00')
 order by ts;

-- READ IT:
--   stored 00:00 open = 1.14241  → matches fresh 00:00. NOT shifted. The rows
--                                  are fine and STEP 2 MUST NOT RUN.
--   stored 10:00 open = 1.14241  → the 00:00 values sit at 10:00. Shifted by
--                                  exactly +10h. Proceed to STEP 2.
--   neither                      → a third state. Stop and report it; do not
--                                  delete on an unexplained result.

-- ── STEP 2 · DELETE, scoped ───────────────────────────────────────────────
-- IRREVERSIBLE. There is no undo and no backup of this table.
-- Safe in one specific sense only: historical_candles is a CACHE. Every
-- deleted window is refetchable on demand — at 8 credits/min, which is the
-- whole reason for scoping rather than truncating.
--
-- Binance rows are untouched by the predicate. Verify that in STEP 3 rather
-- than trusting it here.

-- Substitute <BOUNDARY> with the value STEP 0b produced. If
-- written_after_fix_commit was 0, use timestamptz '2026-08-14 00:00:00+00',
-- which is then provably equivalent to deleting every twelvedata row.

-- STRUCK 2026-08-21. Measured clean; deleting would destroy correct data.
-- Left in place, disabled, so the reasoning above stays attached to the
-- statement it cancels rather than becoming folklore.
--
-- delete from public.historical_candles
--  where provider_code = 'twelvedata'
--    and created_at < timestamptz '<BOUNDARY>';

-- ── STEP 3 · VERIFY, in a SEPARATE run after a reload ─────────────────────
-- A re-read inside the session that made the change sees its own uncommitted
-- work and reports success (EC-8). Reload first.

select provider_code,
       count(*) as rows_total,
       count(distinct symbol) as symbols,
       min(created_at) as first_written
  from public.historical_candles
 group by provider_code
 order by rows_total desc;

-- Expect: binance rows unchanged at 8,644 across 1 symbol, and twelvedata
-- either absent or holding only post-2026-08-14 rows. If binance moved, the
-- predicate did something it should not have and that is worth understanding
-- before anything else is imported.

-- ── AFTER: re-import, and NOT through historical-sync ─────────────────────
-- DO NOT use `historical-sync`. It selects every `is_enabled = true` symbol
-- and loops them serially in one request (`hooks/historical-sync.ts:55,67`)
-- with no delay between symbols and none between Twelve Data pages (EC-5).
-- Against 8 credits/min that is exactly what produced GBP/USD's two 429s on
-- 2026-08-20. Re-importing through it would reproduce the failure this purge
-- is cleaning up after.
--
-- USE THE ADMIN PAGE: `/admin/historical`, which calls `runHistoricalImport`
-- (`market-data/historical.functions.ts:282`) — ONE symbol per invocation, by
-- symbol id, with explicit `from`/`to` and timeframe, recorded as
-- `triggered_by: 'admin'`. No new code is needed; the paced path already
-- exists, it has simply never been the one used.
--
-- Pacing: run EUR/USD 15m first, confirm it landed, then GBP/USD 15m. Two
-- separate invocations minutes apart. The window (2026-06-26 → 08-14 at 15m)
-- is ~4,700 bars, inside Twelve Data's 5,000-row page, so each symbol is
-- roughly one request — trivially inside the budget when they are not fired
-- as part of a 33-symbol burst.
--
-- Verify each import by its `historical_import_jobs` row — status, phase,
-- candles_inserted, error_message — and not by the absence of a complaint.
-- That table is where GBP/USD's two 429s were found.

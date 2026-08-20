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

-- ── STEP 1 · CONFIRM the poisoning independently ──────────────────────────
-- Do not trust `created_at` alone to mean "wrong". Forex closes Friday 22:00
-- UTC and reopens Sunday 22:00 UTC, so legitimate 15m data has essentially NO
-- Saturday bars. A ~10h forward shift pushes Friday afternoon into Saturday
-- morning, which is directly visible:

select count(*) filter (where extract(dow from ts) = 6)                       as saturday_bars,
       count(*) filter (where extract(dow from ts) = 0 and ts::time < '22:00') as sunday_daytime_bars,
       count(*)                                                                as total
  from public.historical_candles
 where symbol = 'EUR/USD' and timeframe = '15m';

-- A meaningful saturday_bars count is the shift, observed rather than
-- inferred from a provider label. If it comes back ~0, STOP: the rows may be
-- fine and this delete would destroy good data to fix a problem that is not
-- there. Report it rather than proceeding.

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

delete from public.historical_candles
 where provider_code = 'twelvedata'
   and created_at < timestamptz '<BOUNDARY>';

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

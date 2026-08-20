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
-- Splits every twelvedata row into poisoned (written before the fix) and
-- clean (written after), per symbol. This is the query that decides the scope
-- of STEP 2 — read it before running anything else.

select symbol,
       timeframe,
       count(*)                                                                    as rows_total,
       count(*) filter (where created_at <  timestamptz '2026-08-14 00:00:00+00')  as poisoned,
       count(*) filter (where created_at >= timestamptz '2026-08-14 00:00:00+00')  as clean,
       min(ts)         as first_bar,
       max(ts)         as last_bar,
       min(created_at) as first_written,
       max(created_at) as last_written
  from public.historical_candles
 where provider_code = 'twelvedata'
 group by symbol, timeframe
 order by rows_total desc;

-- The boundary is 2026-08-14 00:00 UTC, not the commit's 08-13 09:45. A commit
-- is not a deploy, and rows written between the two are still poisoned. Erring
-- later deletes slightly more and cannot leave bad data behind.
--
-- If `clean` is 0 everywhere, the scoped and unscoped deletes are identical
-- and the scoping question is moot — use STEP 2 as written anyway, since it
-- stays correct if that changes.

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

delete from public.historical_candles
 where provider_code = 'twelvedata'
   and created_at < timestamptz '2026-08-14 00:00:00+00';

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
-- `historical-sync` loops all 33 enabled symbols serially in one request with
-- no delay between symbols and none between Twelve Data pages (EC-5). Against
-- 8 credits/min that is what produced GBP/USD's two 429s. Importing EUR/USD
-- and GBP/USD needs a single-symbol, throttle-aware path — the slice/pacing
-- work EC-5 already identifies as the prerequisite for scheduling it at all.
-- Purging without that path means the cache stays empty rather than refilling.

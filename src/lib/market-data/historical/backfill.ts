/**
 * HD-1 · backward-walking historical depth.
 *
 * `runIncrementalUpdate` only ever extends the FRONT edge: it reads
 * `max(ts)` from stored candles and asks for everything since. So a symbol
 * seeded with two days stays two days deep for ever, however many nights it
 * syncs. Replay Studio's value is the opposite — `pickSurpriseSession` rolls a
 * random day between `earliest_available` and `latest_imported`, so depth IS
 * the feature.
 *
 * This module owns the one decision that walk makes, repeatedly: given where
 * the stored data currently begins and ends, which slice do we ask for next,
 * and when do we stop asking. It is deliberately pure — no database, no
 * provider, no clock — because that decision is the whole correctness surface
 * and everything else is plumbing.
 *
 * ── Why the caller must pass `earliestTs`, not `earliest_available` ────────
 *
 * `historical_symbols.earliest_available` looks like the right cursor and is
 * not. Deriving from `min(ts)` in the data cannot go stale, and mirrors how
 * the forward walk already derives from `max(ts)` rather than
 * `latest_imported`. Any writer that adds candles without touching the column
 * — and the column is only ever written by `runImport` — desynchronises a
 * cursor-driven walk, which would then re-request a range it already holds,
 * spending credits from a budget with no room to waste them.
 *
 * CORRECTION 2026-08-21. This originally justified itself by saying the chart
 * cache-through moves the real back edge while the column stays put, so "a
 * trader opening an old chart" would desynchronise the cursor. That is false:
 * the chart path has never written a single row (MD-8 — its `onConflict`
 * named a constraint that does not exist, and the error was never inspected).
 * The decision is unchanged and still correct, because deriving from the data
 * is right regardless of who writes it. The reason given for it was wrong.
 *
 * ── The budget this is shaped around ───────────────────────────────────────
 *
 * Every symbol's base timeframe is 1m, so one step of 2 days is 2,880 bars —
 * one Twelve Data page, one credit. The forward step is likewise one credit.
 * Against 8 credits/min and 800/day, a run of 2 symbols forward + 2 backward
 * costs 4 credits, and at a 15-minute cadence that is 384/day with roughly 2x
 * headroom on both limits.
 *
 * The arithmetic that ruled out the obvious design: a nightly run at the
 * previous slice of 8 fired 8 credits near-instantly with no inter-symbol
 * delay — already exactly at the per-minute cap — and adding a backward phase
 * to it would have guaranteed a 429 on the first run. At a budget-safe nightly
 * slice the walk would have needed ~500 nights to reach target.
 */
import { HISTORICAL_TF_SECONDS, type HistoricalTimeframe } from "./types";

const DAY_MS = 86_400_000;

/**
 * How deep to go, in days. One full quarter: enough to contain at least one
 * month-end and one quarter-end, and enough regime variation to be worth
 * practising against. 120 days at 1m is ~172,800 bars per symbol.
 */
export const BACKFILL_TARGET_DAYS = 120;

/**
 * How far one run reaches back.
 *
 * Deliberately the same as `SEED_DAYS` in the forward walk. That equality is
 * the invariant: a backfill run is exactly the size of an ordinary
 * incremental one, so no path can quietly become the 43,200-bar first sync
 * that could never complete inside the platform's execution limit.
 *
 * A 3-day step would cost the identical single credit (4,320 bars still fits
 * one 5,000-bar page) and reach target ~40% sooner. Not taken: matching
 * SEED_DAYS everywhere is worth more than the days saved.
 */
export const BACKFILL_STEP_DAYS = 2;

/**
 * Consecutive empty steps before a symbol is called exhausted.
 *
 * One empty step is not evidence. A US-hours instrument returns nothing
 * whenever a 2-day window lands clear of a session — Saturday 13:29 to Monday
 * 13:29 contains no NYSE trading at all, and the market reopens one minute
 * later. Marking on the first empty step is what made every equity and ETF a
 * permanent casualty of an ordinary weekend.
 *
 * Four, because a closure is bounded and exhaustion is not. A normal weekend
 * costs at most two steps, a long holiday weekend three; a provider that has
 * genuinely run out returns empty for ever. So the cost of the guard is at
 * most four wasted credits, once, per symbol that truly ends — against
 * permanently losing depth on every US-hours symbol in the catalog.
 *
 * The calendar alternative was rejected deliberately. `tradableMs` in
 * `coverage.ts` cannot answer this: it models a weekday calendar, not
 * sessions, so it reports 13.48 tradable hours for that Saturday-to-Monday
 * window (219 expected 1m bars against a true zero) and reports zero for a
 * forex weekend that Twelve Data actually serves (MD-5). Getting it right by
 * calendar would need per-exchange session hours AND a holiday calendar.
 * Asking the provider needs neither.
 */
export const BACKFILL_EMPTY_LIMIT = 4;

export type BackwardSkip = "no-data" | "target-reached" | "exhausted";

export type BackwardWindow =
  | { skip: BackwardSkip }
  | { from: number; to: number };

export interface BackwardWindowArgs {
  /** Earliest stored bar, from `min(ts)` — NOT `earliest_available`. */
  earliestTs: number | null;
  /** Latest stored bar, from `max(ts)`. Depth is measured back from here. */
  latestTs: number | null;
  /** One bar, in ms, at the symbol's base timeframe. */
  stepMs: number;
  /**
   * `from` of the last attempted window, successful or not.
   *
   * Without it an empty step cannot advance: `earliestTs` derives from
   * `min(ts)` of stored candles, so a window that returns nothing leaves the
   * anchor unmoved and the next run computes the identical window, for ever.
   * Tracking what was ATTEMPTED rather than only what is HELD is what lets
   * the walk step over a closed market.
   */
  attemptedFrom?: number | null;
  targetDays?: number;
  stepDays?: number;
  /** Provider has already reported no more history behind `earliestTs`. */
  exhausted?: boolean;
}

/**
 * The next slice to request, or why not to request one.
 *
 * The three skip reasons are kept distinct because they mean different things
 * to a caller: `target-reached` is success and recurs every run afterwards,
 * `exhausted` is permanent and should be recorded so the range is never asked
 * for again, and `no-data` means the forward seed has not run yet and this
 * walk has no edge to start from.
 */
export function backwardWindow(args: BackwardWindowArgs): BackwardWindow {
  const {
    earliestTs, latestTs, stepMs, attemptedFrom = null,
    targetDays = BACKFILL_TARGET_DAYS,
    stepDays = BACKFILL_STEP_DAYS,
    exhausted = false,
  } = args;

  if (exhausted) return { skip: "exhausted" };
  if (earliestTs == null || latestTs == null) return { skip: "no-data" };

  // Depth is measured from the front edge, so a symbol whose forward walk keeps
  // advancing keeps needing backward steps to hold the same span. That is
  // intended: the target is a window, not a fixed date.
  const floor = latestTs - targetDays * DAY_MS;
  if (earliestTs <= floor) return { skip: "target-reached" };

  // Walk from the earlier of what we HOLD and what we last ASKED FOR. They are
  // the same value on every successful step — an import moves `min(ts)` to the
  // window it just filled — and they diverge only after an empty one, which is
  // exactly when the walk needs to keep moving anyway.
  //
  // `min` rather than `attemptedFrom` alone so a chart load that fills a range
  // below the cursor (now possible: MD-8) hands the walk back to the real data
  // edge instead of leaving it stranded above.
  const anchor = attemptedFrom == null ? earliestTs : Math.min(earliestTs, attemptedFrom);

  // One bar clear of what we hold, so nothing is re-fetched and no gap opens.
  const to = anchor - stepMs;
  // Clamped, so the last step lands exactly on the target rather than past it.
  const from = Math.max(to - stepDays * DAY_MS, floor);

  if (to - from < stepMs) return { skip: "target-reached" };
  return { from, to };
}

/** One bar in ms for a timeframe, for callers building `BackwardWindowArgs`. */
export function stepMsFor(tf: HistoricalTimeframe): number {
  return HISTORICAL_TF_SECONDS[tf] * 1000;
}

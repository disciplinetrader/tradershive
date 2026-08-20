/**
 * MSYM-1 · secondary-symbol panes — projection only.
 *
 * A replay session has exactly ONE authoritative symbol. Its dataset drives
 * the clock (`session/clock.ts`), and every fill decision in `evaluateTick`
 * is made against that symbol's price stream.
 *
 * ── Why secondary symbols cannot trade ─────────────────────────────────────
 *
 * `MarketTick` carries a price and a time and NO SYMBOL
 * (`chart/orders/engine.ts:39`), and `evaluateTick` walks the whole order list
 * deciding on price alone. The one line that looks symbol-aware —
 * `if (order.symbol && order.status === "pending")` — tests that the order HAS
 * a symbol, never that it matches the tick. So feeding a second instrument's
 * ticks to the engine would fill the first instrument's orders at prices that
 * instrument never traded at, silently and with no error.
 *
 * Making the engine symbol-aware is a change to the canonical execution path
 * shared with live paper trading, and it lands next to BA-9 and BA-10. Out of
 * scope here. Secondary panes therefore DISPLAY and never execute, which is
 * also why `observation_cursor` records the primary symbol's cursor only: a
 * trade happens against one instrument's price action, and a secondary
 * symbol's cursor at that instant is a coincidence, not context.
 *
 * ── The projection rule ────────────────────────────────────────────────────
 *
 * One rule, and it is the same guarantee multi-pane already makes for folds:
 * a secondary pane may show a bar only if the clock has reached its OPEN.
 * Nothing here fetches, interpolates, or aligns grids — two instruments print
 * on their own schedules and pretending otherwise would invent bars.
 */
import type { Candle } from "@/lib/market-data/types";

export interface SecondaryProjection {
  /**
   * Exclusive end index: how many leading bars the clock has reached.
   * Callers slice `candles.slice(0, visibleCount)`, memoised on this number —
   * it changes far less often than the clock ticks.
   */
  visibleCount: number;
  /** Open time of the newest visible bar, or null when none is visible yet. */
  atTime: number | null;
  /**
   * How far the secondary's newest visible bar sits behind the clock, in ms.
   * Null when nothing is visible. A large value is not an error: an
   * instrument that is not trading (weekend, different session hours) legally
   * has no recent bar, and showing its last real print is more honest than
   * inventing one.
   */
  lagMs: number | null;
}

const EMPTY: SecondaryProjection = { visibleCount: 0, atTime: null, lagMs: null };

/**
 * Project a secondary symbol's bars onto the primary clock.
 *
 * `primaryTimeMs` is the open time of the primary session's newest bar — the
 * forming one. A secondary bar opening at exactly that time IS included: its
 * open has happened, and excluding it would make the secondary permanently
 * one bar staler than the instrument it is being compared against.
 *
 * Binary search rather than a filter: this runs on every observation, and at
 * 100x a single frame yields a large batch of them.
 */
export function projectSecondary(
  candles: readonly Candle[],
  primaryTimeMs: number | null,
): SecondaryProjection {
  if (primaryTimeMs == null || !Number.isFinite(primaryTimeMs)) return EMPTY;
  if (candles.length === 0) return EMPTY;
  if (candles[0].time > primaryTimeMs) return EMPTY;

  // Rightmost index whose open time is <= primaryTimeMs.
  let lo = 0;
  let hi = candles.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (candles[mid].time <= primaryTimeMs) lo = mid;
    else hi = mid - 1;
  }

  const atTime = candles[lo].time;
  return { visibleCount: lo + 1, atTime, lagMs: primaryTimeMs - atTime };
}

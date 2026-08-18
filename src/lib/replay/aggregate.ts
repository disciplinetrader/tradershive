/**
 * Phase B · deterministic timeframe aggregation for replay.
 *
 * The session engine always advances on its dataset's base timeframe. Higher
 * display timeframes are folded from those same bars — never re-fetched — so
 * the chart can never show a bar the clock has not yet reached, and the
 * forming higher-timeframe bar updates in place exactly as it would live.
 */
import type { Candle } from "@/lib/market-data/types";
import { TIMEFRAME_SECONDS } from "@/lib/market-data/constants";
import type { Timeframe } from "@/lib/market-data/types";

/** Display timeframes offered in the studio, ascending. */
export const REPLAY_TIMEFRAMES: Timeframe[] = ["1m", "3m", "5m", "15m", "30m", "1H", "2H", "4H", "1D", "1W"];

/** Timeframes that can be folded from `base` (i.e. an exact multiple of it). */
export function aggregatableFrom(base: Timeframe): Timeframe[] {
  const b = TIMEFRAME_SECONDS[base];
  return REPLAY_TIMEFRAMES.filter((tf) => {
    const s = TIMEFRAME_SECONDS[tf];
    return s >= b && s % b === 0;
  });
}

/** Pane counts the studio grid offers. */
export const PANE_COUNTS = [1, 2, 4] as const;
export type PaneCount = (typeof PANE_COUNTS)[number];

/**
 * Opening timeframe for each pane of a multi-pane layout.
 *
 * The base timeframe always takes pane 1 — it is the tape the clock actually
 * advances on, and the one every fill is decided at. The rest climb the
 * available ladder, which is why this is derived from `aggregatableFrom`
 * rather than a fixed list: a 1H session cannot show a 15m pane, because those
 * bars were never loaded and folding cannot invent them.
 *
 * When the ladder runs out (a 1D session has only 1D and 1W above it) the last
 * available timeframe repeats. A pane must show something, and repeating the
 * highest is more honest than silently dropping to a fold we do not have.
 */
export function defaultPaneLadder(base: Timeframe, count: number): Timeframe[] {
  const options = aggregatableFrom(base);
  const ladder = options.length ? options : [base];
  return Array.from({ length: Math.max(1, count) }, (_, i) => ladder[Math.min(i, ladder.length - 1)]);
}

/**
 * Fold base-timeframe candles into `target`. Bucketing is by absolute epoch
 * time, so the same input always yields the same output — a hard requirement
 * for reproducible replays.
 */
export function aggregateCandles(candles: readonly Candle[], base: Timeframe, target: Timeframe): Candle[] {
  const baseS = TIMEFRAME_SECONDS[base];
  const targetS = TIMEFRAME_SECONDS[target];
  if (!candles.length || targetS <= baseS || targetS % baseS !== 0) return candles.slice();

  const stepMs = targetS * 1000;
  const out: Candle[] = [];
  for (const c of candles) {
    const bucket = Math.floor(c.time / stepMs) * stepMs;
    const last = out[out.length - 1];
    if (last && last.time === bucket) {
      last.high = Math.max(last.high, c.high);
      last.low = Math.min(last.low, c.low);
      last.close = c.close;
      last.volume = (last.volume ?? 0) + (c.volume ?? 0);
    } else {
      out.push({ time: bucket, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume ?? 0 });
    }
  }
  return out;
}

/**
 * Position Tool — Phase 6 trailing-stop engine.
 *
 * Pure decision layer, exactly like the execution engine: given a position,
 * a trailing configuration and a snapshot of market context, it returns the
 * stop price the position SHOULD have — or `null` when the stop must not
 * move. It never mutates anything; `service.ts` applies the result.
 *
 * Two invariants are enforced here and cannot be bypassed by any caller:
 *
 *   1. Monotonicity — the stop only ever moves in the trader's favour
 *      (up for a long, down for a short). A candidate that would loosen the
 *      stop is discarded, so a whipsaw can never widen risk.
 *   2. No self-trigger — a candidate on the wrong side of the market
 *      (at or beyond the current price) is discarded, so trailing can never
 *      manufacture an instant stop-out.
 */

import type { OrderDirection } from "./model";

export type TrailingMode =
  | "fixed"
  | "atr"
  | "ema"
  | "swing"
  | "prev_candle"
  | "highest_high"
  | "lowest_low";

export interface TrailingConfig {
  mode: TrailingMode;
  active: boolean;
  /** Absolute price distance — `fixed` mode. */
  distance?: number;
  /** ATR multiple — `atr` mode. Defaults to 1. */
  atrMultiple?: number;
  /** Lookback used by the caller to compute swing / extreme context. */
  period?: number;
  /** Extra buffer subtracted from the candidate, in price units. */
  offset?: number;
}

/**
 * Everything the calculators may read. The caller (chart layer) supplies
 * whichever fields it can compute from the loaded candles; a mode whose input
 * is missing simply does not move the stop.
 */
export interface TrailingContext {
  price: number;
  atr?: number | null;
  ema?: number | null;
  swingHigh?: number | null;
  swingLow?: number | null;
  prevHigh?: number | null;
  prevLow?: number | null;
  highestHigh?: number | null;
  lowestLow?: number | null;
}

export const TRAILING_LABEL: Record<TrailingMode, string> = {
  fixed: "Fixed distance",
  atr: "ATR",
  ema: "EMA",
  swing: "Swing high/low",
  prev_candle: "Previous candle",
  highest_high: "Highest high",
  lowest_low: "Lowest low",
};

function num(v: number | null | undefined): number | null {
  return Number.isFinite(v ?? NaN) ? (v as number) : null;
}

/**
 * Raw candidate for a mode, before the favourable-direction and
 * self-trigger guards are applied.
 */
export function trailingCandidate(
  direction: OrderDirection,
  cfg: TrailingConfig,
  ctx: TrailingContext,
): number | null {
  const long = direction === "buy";
  const price = num(ctx.price);
  if (price === null) return null;
  const offset = cfg.offset && cfg.offset > 0 ? cfg.offset : 0;

  const shift = (base: number, dist: number) => (long ? base - dist : base + dist);

  switch (cfg.mode) {
    case "fixed": {
      const d = num(cfg.distance);
      if (d === null || d <= 0) return null;
      return shift(price, d + offset);
    }
    case "atr": {
      const atr = num(ctx.atr);
      if (atr === null || atr <= 0) return null;
      const mult = cfg.atrMultiple && cfg.atrMultiple > 0 ? cfg.atrMultiple : 1;
      return shift(price, atr * mult + offset);
    }
    case "ema": {
      const ema = num(ctx.ema);
      if (ema === null) return null;
      return shift(ema, offset);
    }
    case "swing": {
      const base = long ? num(ctx.swingLow) : num(ctx.swingHigh);
      if (base === null) return null;
      return shift(base, offset);
    }
    case "prev_candle": {
      const base = long ? num(ctx.prevLow) : num(ctx.prevHigh);
      if (base === null) return null;
      return shift(base, offset);
    }
    case "highest_high": {
      // Long-side chandelier: trail below the running high.
      const base = num(ctx.highestHigh);
      const d = num(cfg.distance) ?? num(ctx.atr);
      if (base === null || d === null || d <= 0) return null;
      return base - d - offset;
    }
    case "lowest_low": {
      const base = num(ctx.lowestLow);
      const d = num(cfg.distance) ?? num(ctx.atr);
      if (base === null || d === null || d <= 0) return null;
      return base + d + offset;
    }
    default:
      return null;
  }
}

/**
 * The stop this position should have after applying `cfg` to `ctx`.
 * Returns `null` when the stop must stay where it is.
 */
export function nextTrailingStop(
  position: { direction: OrderDirection; stop: number },
  cfg: TrailingConfig | null | undefined,
  ctx: TrailingContext,
): number | null {
  if (!cfg || !cfg.active) return null;
  const candidate = trailingCandidate(position.direction, cfg, ctx);
  if (candidate === null || !Number.isFinite(candidate) || candidate <= 0) return null;
  return improvesStop(position.direction, position.stop, candidate, ctx.price) ? candidate : null;
}

/**
 * The monotonic guard, exposed for tests and for the manual drag path:
 * a stop may only move toward the market, and never through it.
 */
export function improvesStop(
  direction: OrderDirection,
  current: number,
  candidate: number,
  price?: number | null,
): boolean {
  if (!Number.isFinite(candidate)) return false;
  const long = direction === "buy";
  const tighter = long ? candidate > current : candidate < current;
  if (!tighter) return false;
  if (Number.isFinite(price ?? NaN)) {
    const p = price as number;
    // Never place the stop at or beyond the market — that is an instant exit.
    if (long ? candidate >= p : candidate <= p) return false;
  }
  return true;
}

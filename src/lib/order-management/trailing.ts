/**
 * Trailing stop engine.
 *
 * On every price tick call `computeTrailingStop()` for each open position
 * that has a trailing config. Returns the new stop-loss price (or null if
 * unchanged). Supports three methods: fixed distance, percentage, or ATR
 * multiple.
 */

import type { Side } from "@/lib/trading-engine";
import type { TrailingConfig } from "./types";

export type TrailingResult = {
  next: TrailingConfig;
  newStopLoss: number | null;
  activated: boolean;
  updated: boolean;
};

function distanceFor(method: TrailingConfig): number {
  if (method.method === "atr") return (method.atr ?? 0) * method.distance;
  if (method.method === "percent") return 0; // computed per-price
  return method.distance;
}

export function computeTrailingStop(
  config: TrailingConfig, side: Side, price: number,
): TrailingResult {
  const next: TrailingConfig = { ...config };
  const activationReached = next.activationPrice == null
    ? true
    : side === "long"
      ? price >= next.activationPrice
      : price <= next.activationPrice;

  let activated = false;
  if (!next.active && activationReached) {
    next.active = true;
    next.bestPrice = price;
    activated = true;
  }
  if (!next.active) return { next, newStopLoss: null, activated: false, updated: false };

  // Track the best price seen since activation.
  const prevBest = next.bestPrice ?? price;
  next.bestPrice = side === "long" ? Math.max(prevBest, price) : Math.min(prevBest, price);

  let dist = distanceFor(next);
  if (next.method === "percent") {
    dist = (next.bestPrice ?? price) * (next.distance / 100);
  }
  if (!(dist > 0)) return { next, newStopLoss: null, activated, updated: false };

  const stop = side === "long"
    ? (next.bestPrice ?? price) - dist
    : (next.bestPrice ?? price) + dist;

  return {
    next,
    newStopLoss: stop,
    activated,
    updated: activated || next.bestPrice !== prevBest,
  };
}

/** Compare with the current SL and decide whether to broadcast an update. */
export function shouldTightenStop(
  side: Side, currentStop: number | null, proposed: number,
): boolean {
  if (currentStop == null) return true;
  return side === "long" ? proposed > currentStop : proposed < currentStop;
}

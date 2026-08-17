/**
 * Canonical market observation pipeline (Phase 8 · infrastructure gap 2).
 *
 * Live trading and Replay must reach IDENTICAL decisions from identical
 * market information. Before this module, live drove the engine from
 * discrete quotes while Replay walked candles with its own ad-hoc logic —
 * two code paths, therefore two behaviours (most visibly for trailing
 * stops, which only live evaluated through the canonical engine).
 *
 * Everything now funnels through one function:
 *
 *     candle ──► observations (deterministic intrabar path)
 *                     │
 *                     ▼
 *     runObservation ─► runEngineTick   (entries, stop-loss, take-profit)
 *                     └─► runManagementTick (TP ladder → break-even → trail)
 *
 * Intrabar policy
 * ───────────────
 * A candle is four facts, not a path. We assume the CONSERVATIVE path — the
 * adverse extreme is visited first — so a bar that touched both a stop and a
 * target always resolves as the stop. The order is derived from the bar's
 * direction, never from the position, so the same bar produces the same
 * observation sequence for every account replaying it.
 *
 *   bullish bar (close ≥ open): open → low → high → close
 *   bearish bar (close <  open): open → high → low → close
 */

import type { PositionOrder } from "./model";
import type { MarketTick } from "./engine";
import { runEngineTick, runManagementTick, type OrderStores } from "./service";
import type { ExecutionCosts } from "./engine";
import type { TrailingContext } from "./trailing";

export type IntrabarPolicy = "conservative" | "ohlc";

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface MarketObservation extends MarketTick {
  /** Market context for the trailing engine (ATR, EMA, swings…). */
  context?: Omit<TrailingContext, "price">;
}

export interface ObservationOptions {
  /** Asset class recorded on resulting closed trades. */
  market?: string | null;
  /**
   * Simulated broker friction. Defaults to none, so the live chart and every
   * existing caller behave exactly as before — only a replay session that
   * recorded costs at creation pays them.
   */
  costs?: ExecutionCosts;
}

/**
 * Expand one candle into the ordered price observations the engine sees.
 * Duplicate consecutive prices are collapsed — a doji must not tick twice.
 */
export function observationsFromCandle(
  candle: Candle,
  opts: { policy?: IntrabarPolicy; context?: Omit<TrailingContext, "price"> } = {},
): MarketObservation[] {
  const policy = opts.policy ?? "conservative";
  const bullish = candle.close >= candle.open;
  const path =
    policy === "ohlc"
      ? [candle.open, candle.high, candle.low, candle.close]
      : bullish
        ? [candle.open, candle.low, candle.high, candle.close]
        : [candle.open, candle.high, candle.low, candle.close];

  const out: MarketObservation[] = [];
  for (const price of path) {
    if (!Number.isFinite(price) || price <= 0) continue;
    if (out.length && out[out.length - 1].price === price) continue;
    out.push({ price, time: candle.time, context: opts.context });
  }
  return out;
}

/**
 * THE canonical tick entry point. Both the live chart and Replay call this
 * and nothing else, so entries, exits, the TP ladder, automatic break-even
 * and trailing stops are evaluated in the same order, by the same code.
 */
export function runObservation(
  stores: OrderStores,
  observation: MarketObservation,
  opts: ObservationOptions = {},
): PositionOrder[] {
  const { price, time, context } = observation;
  if (!Number.isFinite(price) || price <= 0) return [];
  const touched = runEngineTick(stores, { price, time }, opts.costs);
  const managed = runManagementTick(stores, { price, time, context }, { market: opts.market });
  return [...touched, ...managed];
}

/** Walk a full candle through the pipeline using the intrabar policy. */
export function runCandle(
  stores: OrderStores,
  candle: Candle,
  opts: ObservationOptions & { policy?: IntrabarPolicy; context?: Omit<TrailingContext, "price"> } = {},
): PositionOrder[] {
  const touched: PositionOrder[] = [];
  for (const obs of observationsFromCandle(candle, { policy: opts.policy, context: opts.context })) {
    touched.push(...runObservation(stores, obs, opts));
  }
  return touched;
}

/** Walk a range of candles — replay fast-forward and backtesting. */
export function runCandles(
  stores: OrderStores,
  candles: Candle[],
  opts: ObservationOptions & { policy?: IntrabarPolicy } = {},
): PositionOrder[] {
  const touched: PositionOrder[] = [];
  let prev: Candle | null = null;
  for (const candle of candles) {
    touched.push(
      ...runCandle(stores, candle, {
        ...opts,
        context: prev ? { prevHigh: prev.high, prevLow: prev.low } : undefined,
      }),
    );
    prev = candle;
  }
  return touched;
}

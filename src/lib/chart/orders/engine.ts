/**
 * Position Tool — Phase 3 execution engine (paper simulation).
 *
 * Pure decision layer: given the canonical order list and one market tick,
 * it returns the set of state changes that tick implies. It performs no
 * mutation, no I/O and no persistence — `service.ts` applies the results
 * atomically. That split is what makes duplicate fills testable and the
 * engine safe to run from any number of subscribers.
 *
 * ── Fill model ──────────────────────────────────────────────────────────
 * The chart feed gives us discrete last-traded prices, not a full order
 * book, so the model is deliberately conservative and never optimistic:
 *
 *  · Market order      → fills immediately at the observed tick price.
 *  · Limit orders      → fill at the LIMIT PRICE, even when the tick gapped
 *                        beyond it. We do not model price improvement, so a
 *                        favourable gap yields no windfall.
 *  · Stop orders       → fill at the OBSERVED TICK PRICE, not the stop
 *                        price. A gap through the level therefore produces
 *                        real, negative slippage — the trader is charged
 *                        for the gap exactly as a live venue would.
 *  · Stop-loss exit    → the same rule: exit at the observed tick price
 *                        when it gapped past the stop (slippage against).
 *  · Take-profit exit  → exit at the TARGET price (no improvement).
 *
 * Trigger conditions (`>=` / `<=`, so touching the level counts):
 *   buy_limit  · market <= entry      sell_limit · market >= entry
 *   buy_stop   · market >= entry      sell_stop  · market <= entry
 *
 * ── Duplicate-fill safety ───────────────────────────────────────────────
 * The engine only ever considers orders whose status is exactly `pending`
 * (for fills) or `open` (for exits), and `lifecycle.transition()` rejects
 * any repeat. A tick replayed twice, two subscribers ticking concurrently,
 * or a re-render storm all converge on the same single fill.
 */

import type { ExecutionSource, CloseReason, OrderType, PositionOrder } from "./model";

export interface MarketTick {
  price: number;
  /** Epoch-ms of the tick; defaults to now at apply time. */
  time?: number;
}

export interface FillIntent {
  kind: "fill";
  orderId: string;
  fillPrice: number;
  /** Signed slippage against the trader (0 for limit fills). */
  slippage: number;
  executionSource: ExecutionSource;
}

export interface ExitIntent {
  kind: "exit";
  orderId: string;
  closePrice: number;
  reason: CloseReason;
  executionSource: ExecutionSource;
}

export type EngineIntent = FillIntent | ExitIntent;

/** Does this tick reach the order's entry level? */
export function triggersEntry(orderType: OrderType, entry: number, price: number): boolean {
  switch (orderType) {
    case "market": return true;
    case "buy_limit": return price <= entry;
    case "sell_limit": return price >= entry;
    case "buy_stop": return price >= entry;
    case "sell_stop": return price <= entry;
    default: return false;
  }
}

/** Apply the documented fill model to a triggered order. */
export function fillPriceFor(order: PositionOrder, price: number): { fillPrice: number; slippage: number } {
  const sign = order.direction === "buy" ? 1 : -1;
  if (order.orderType === "buy_limit" || order.orderType === "sell_limit") {
    // Limit: never better than the limit price.
    return { fillPrice: order.entry, slippage: 0 };
  }
  // Market and stop orders take the observed price, gap and all.
  const slippage = (price - order.entry) * sign;
  return { fillPrice: price, slippage: order.orderType === "market" ? 0 : slippage };
}

/** Has an open position's stop or target been reached by this tick? */
export function exitFor(order: PositionOrder, price: number): ExitIntent | null {
  const long = order.direction === "buy";
  const stopHit = long ? price <= order.stop : price >= order.stop;
  const targetHit = long ? price >= order.target : price <= order.target;

  // Stop takes priority: within a single discrete tick we cannot know the
  // path, so we assume the adverse level was touched first.
  if (stopHit) {
    return {
      kind: "exit",
      orderId: order.id,
      // Gap through the stop → the trader eats the gap.
      closePrice: long ? Math.min(price, order.stop) : Math.max(price, order.stop),
      reason: "stop_loss",
      executionSource: "stop_loss",
    };
  }
  if (targetHit) {
    return {
      kind: "exit",
      orderId: order.id,
      closePrice: order.target, // no price improvement
      reason: "take_profit",
      executionSource: "take_profit",
    };
  }
  return null;
}

/**
 * Evaluate one tick against the whole order list.
 * Returns intents in a deterministic order: fills first, then exits, so a
 * position opened by this tick is also eligible to be stopped by it only on
 * the NEXT tick (never opened and closed by the same price observation).
 */
export function evaluateTick(orders: readonly PositionOrder[], tick: MarketTick): EngineIntent[] {
  const price = tick.price;
  if (!Number.isFinite(price) || price <= 0) return [];

  const fills: EngineIntent[] = [];
  const exits: EngineIntent[] = [];

  for (const order of orders) {
    if (order.symbol && order.status === "pending") {
      if (!triggersEntry(order.orderType, order.entry, price)) continue;
      const { fillPrice, slippage } = fillPriceFor(order, price);
      fills.push({
        kind: "fill",
        orderId: order.id,
        fillPrice,
        slippage,
        executionSource: order.orderType === "market" ? "market" : "trigger",
      });
      continue;
    }
    if (order.status === "open") {
      const exit = exitFor(order, price);
      if (exit) exits.push(exit);
    }
  }

  return [...fills, ...exits];
}

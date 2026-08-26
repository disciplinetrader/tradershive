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
import { hasLevel } from "./model";

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

/**
 * Simulated broker friction, in price units.
 *
 * Snapshotted onto a replay session at creation rather than read from a
 * setting at runtime: a replay is reproducible by construction — the dataset
 * is checksummed for exactly that reason — and costs that live in
 * localStorage would mean two traders on the same session get different fills,
 * and the same trader resuming later gets different fills again.
 */
export interface ExecutionCosts {
  /** Full bid/ask spread. Half is applied either side of the observed price. */
  spread: number;
  /** Adverse slippage on market and stop fills. Never improves a fill. */
  slippage: number;
}

/** Frictionless execution — the default everywhere, so existing behaviour is unchanged. */
export const NO_COSTS: ExecutionCosts = { spread: 0, slippage: 0 };

function halfSpread(costs: ExecutionCosts): number {
  const s = Number(costs.spread);
  return Number.isFinite(s) && s > 0 ? s / 2 : 0;
}

function adverseSlippage(costs: ExecutionCosts): number {
  const s = Number(costs.slippage);
  return Number.isFinite(s) && s > 0 ? s : 0;
}

/**
 * The two sides of the observed price.
 *
 * Candle data gives one number per observation; a real book has two. Treating
 * that number as the mid and deriving bid/ask from it is the least-wrong
 * reading, and it is what makes the spread cost both halves of a round trip
 * rather than half of one.
 */
export function quoteAt(price: number, costs: ExecutionCosts = NO_COSTS) {
  const half = halfSpread(costs);
  return { bid: price - half, ask: price + half, mid: price };
}

/**
 * Does this tick reach the order's entry level?
 *
 * Compares the side the order would actually transact against: a buy fills on
 * the ask, a sell on the bid. Checking the mid instead would trigger orders at
 * prices that never existed — a buy limit filling while the ask is still above
 * it — which is a worse error than mispricing the fill, because it invents a
 * trade that could not have happened.
 */
export function triggersEntry(
  orderType: OrderType, entry: number, price: number, costs: ExecutionCosts = NO_COSTS,
): boolean {
  const { bid, ask } = quoteAt(price, costs);
  switch (orderType) {
    case "market": return true;
    case "buy_limit": return ask <= entry;
    case "sell_limit": return bid >= entry;
    case "buy_stop": return ask >= entry;
    case "sell_stop": return bid <= entry;
    default: return false;
  }
}

/** Apply the documented fill model to a triggered order. */
export function fillPriceFor(
  order: PositionOrder, price: number, costs: ExecutionCosts = NO_COSTS,
): { fillPrice: number; slippage: number } {
  const sign = order.direction === "buy" ? 1 : -1;
  if (order.orderType === "buy_limit" || order.orderType === "sell_limit") {
    // Limit: never better than the limit price, and never slipped — a limit
    // either transacts at its level or does not transact. The spread is
    // already paid in `triggersEntry`, which required the ask (or bid) to
    // reach the level rather than the mid.
    return { fillPrice: order.entry, slippage: 0 };
  }

  // Market and stop orders take the observed quote on their own side, gap and
  // all, then slip against the trader.
  const { bid, ask } = quoteAt(price, costs);
  const quote = order.direction === "buy" ? ask : bid;
  const slip = adverseSlippage(costs);
  const fillPrice = quote + slip * sign;

  // `slippage` on the intent is the distance from the order's own level, which
  // is what the blotter reports. For a market order that distance is not
  // slippage in the trader's sense, so it stays 0 as before.
  const distance = (fillPrice - order.entry) * sign;
  return { fillPrice, slippage: order.orderType === "market" ? 0 : distance };
}

/**
 * Has an open position's stop or target been reached by this tick?
 *
 * Measured against the side the position must transact on to CLOSE: a long
 * exits by selling, so its stop and target are judged on the bid; a short
 * exits by buying, so on the ask. This is why the spread is paid twice on a
 * round trip — once entering, once leaving — and charging it only on entry
 * would halve the modelled cost of every trade.
 */
export function exitFor(
  order: PositionOrder, price: number, costs: ExecutionCosts = NO_COSTS,
): ExitIntent | null {
  const long = order.direction === "buy";
  const { bid, ask } = quoteAt(price, costs);
  // The quote this position would get if it closed right now.
  const exitQuote = long ? bid : ask;

  // A LEVEL THAT DOES NOT EXIST CAN NEVER TRIGGER.
  //
  // A position is allowed to carry no stop, no target, or neither: that means
  // it has no protection or no objective, not that the level sits at zero.
  // Without these guards the comparisons below coerce the absent level and
  // fire on the first tick. Measured, with exitQuote = 63000:
  //
  //   long,  target = null -> exitQuote >= null -> TRUE, closePrice null -> 0
  //   short, stop   = null -> exitQuote >= null -> TRUE
  //
  // Neither throws. Both produce a plausible-looking exit stamped
  // "take_profit" / "stop_loss" that is written to the durable trade tape and
  // into analytics, where it is expensive to unpick — a booked-but-wrong
  // closure cannot be reopened at a later price without corrupting the journal
  // further. This is the reason optional levels could not simply be typed as
  // nullable and left to the existing comparisons.
  //
  // `Number.isFinite` rather than `!= null` on purpose: undefined and NaN are
  // the same statement as null here — there is no usable level — and NaN
  // comparisons are quietly false, which would look like "never triggers"
  // while actually meaning "silently unprotected".
  // Bound to locals so the narrowing survives into the bodies below. Stage 1
  // wrote these same two conditions against a non-nullable `number`, where
  // `Number.isFinite` guarded the VALUE but told the type system nothing;
  // `hasLevel` is a type predicate, so the compiler now enforces what that
  // guard always meant.
  const stop = hasLevel(order.stop) ? order.stop : null;
  const target = hasLevel(order.target) ? order.target : null;

  const stopHit = stop != null && (long ? exitQuote <= stop : exitQuote >= stop);
  const targetHit = target != null && (long ? exitQuote >= target : exitQuote <= target);

  // Stop takes priority: within a single discrete tick we cannot know the
  // path, so we assume the adverse level was touched first.
  if (stopHit) {
    return {
      kind: "exit",
      orderId: order.id,
      // Gap through the stop → the trader eats the gap, measured on the side
      // the position actually closes at.
      closePrice: long ? Math.min(exitQuote, stop) : Math.max(exitQuote, stop),
      reason: "stop_loss",
      executionSource: "stop_loss",
    };
  }
  if (targetHit) {
    return {
      kind: "exit",
      orderId: order.id,
      closePrice: target, // no price improvement
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
export function evaluateTick(
  orders: readonly PositionOrder[], tick: MarketTick, costs: ExecutionCosts = NO_COSTS,
): EngineIntent[] {
  const price = tick.price;
  if (!Number.isFinite(price) || price <= 0) return [];

  const fills: EngineIntent[] = [];
  const exits: EngineIntent[] = [];

  for (const order of orders) {
    if (order.symbol && order.status === "pending") {
      if (!triggersEntry(order.orderType, order.entry, price, costs)) continue;
      const { fillPrice, slippage } = fillPriceFor(order, price, costs);
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
      const exit = exitFor(order, price, costs);
      if (exit) exits.push(exit);
    }
  }

  return [...fills, ...exits];
}

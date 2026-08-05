/**
 * Position Tool — Phase 2 order model.
 *
 * Canonical, transport-agnostic representation of an order created from a
 * Position Tool drawing. Phase 2 is creation only: orders live locally
 * (Paper Trading objects) and are never sent to an execution API here.
 *
 * Geometry, anchoring, dragging and persistence of the drawing itself are
 * untouched — an order simply references the drawing that produced it.
 */

import type { Drawing } from "@/lib/chart/drawings/types";
import { positionMetrics } from "@/lib/chart/drawings/position";
import type { PositionExecution } from "./executions";
import type { TakeProfitLeg } from "./take-profit";
import type { TrailingConfig } from "./trailing";


export type OrderDirection = "buy" | "sell";

export type OrderType =
  | "market"
  | "buy_limit"
  | "sell_limit"
  | "buy_stop"
  | "sell_stop";

/**
 * Full Phase 3 lifecycle. Legal transitions live in `lifecycle.ts` — this
 * is only the vocabulary.
 *
 *   pending → filled → open → closed → archived
 *   pending → cancelled → archived
 */
export type OrderStatus =
  | "pending"
  | "filled"
  | "open"
  | "closed"
  | "cancelled"
  | "archived";

export const ORDER_SOURCE = "PositionTool" as const;

/** How a fill or exit was produced. Paper simulation only. */
export type ExecutionSource = "market" | "trigger" | "manual" | "stop_loss" | "take_profit";

/** Why an open position stopped being open. */
export type CloseReason = "manual" | "stop_loss" | "take_profit";

export interface PositionOrder {
  id: string;
  symbol: string;
  direction: OrderDirection;
  orderType: OrderType;
  entry: number;
  stop: number;
  target: number;
  /** Absolute price distance entry → stop. */
  risk: number;
  /** Absolute price distance entry → target. */
  reward: number;
  /** reward / risk. */
  rr: number;
  /** Estimated units; null until account sizing is connected. */
  size: number | null;
  status: OrderStatus;
  source: typeof ORDER_SOURCE;
  /** Drawing this order was created from — keeps the chart object editable. */
  drawingId: string;
  createdAt: number;
  updatedAt: number;
  cancelledAt?: number;

  // ── Execution (Phase 3) ────────────────────────────────────────────────
  /** Epoch-ms of the fill. Set exactly once, on pending → filled. */
  filledAt?: number;
  /** Price the position was actually opened at (may differ from `entry`). */
  fillPrice?: number;
  /** What produced the fill / exit. */
  executionSource?: ExecutionSource;
  /** Stable identity of the live position spawned by the fill. */
  positionId?: string;
  /** Slippage against the requested entry, signed against the trader. */
  slippage?: number;

  // ── Immutable execution snapshot (Phase 4) ─────────────────────────────
  // Captured once at fill time so a later stop drag or break-even move can
  // never re-base the risk the trade was originally sized against.
  /** Entry price requested before slippage. */
  requestedEntry?: number;
  /** Stop as it stood at fill time. */
  initialStop?: number;
  /** Target as it stood at fill time. */
  initialTarget?: number;


  // ── Advanced position management (Phase 6) ─────────────────────────────
  // A live position is one identity (`positionId`) with many executions.
  // `size` always mirrors the REMAINING quantity so every pre-existing
  // consumer (floating P/L, closed-trade builder) keeps working unchanged;
  // `originalQuantity` is the immutable basis for TP allocations and R.
  /** Units at the moment the position first opened, plus every scale-in. */
  originalQuantity?: number;
  /** Units still exposed to the market. Reaches 0 exactly once. */
  remainingQuantity?: number;
  /** Per-unit risk distance captured at open; the denominator for every R. */
  riskBasis?: number;
  /** Append-only execution tape. Ordered by `seq`. */
  executions?: PositionExecution[];
  /** TP ladder — allocations are percentages of `originalQuantity`. */
  takeProfits?: TakeProfitLeg[];
  /** Trailing-stop configuration; inert until `active`. */
  trailing?: TrailingConfig;
  /** Automatic break-even trigger, expressed in R. Fires at most once. */
  autoBreakEvenR?: number;
  /** Epoch-ms the stop was moved to break-even (manual or automatic). */
  breakEvenAt?: number;

  // ── Exit ───────────────────────────────────────────────────────────────
  closedAt?: number;
  closePrice?: number;
  closeReason?: CloseReason;
  /** Realised P/L in quote currency (× size when sizing is known). */
  realizedPnl?: number;
  /** Realised result expressed in R multiples. */
  realizedR?: number;
  archivedAt?: number;
}



export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  market: "Market",
  buy_limit: "Buy Limit",
  sell_limit: "Sell Limit",
  buy_stop: "Buy Stop",
  sell_stop: "Sell Stop",
};

/** Order types selectable for a given direction (manual override list). */
export function orderTypesFor(direction: OrderDirection): OrderType[] {
  return direction === "buy"
    ? ["market", "buy_limit", "buy_stop"]
    : ["market", "sell_limit", "sell_stop"];
}

export function directionOf(d: Drawing): OrderDirection {
  return d.kind === "short_position" ? "sell" : "buy";
}

/**
 * Infer the order type from entry vs. the live market price.
 *
 *   buy  · entry above market → Buy Stop     · entry below market → Buy Limit
 *   sell · entry below market → Sell Stop    · entry above market → Sell Limit
 *   entry at market (within one tick)        → Market
 */
export function inferOrderType(
  direction: OrderDirection,
  entry: number,
  marketPrice: number | null | undefined,
  tick = 0,
): OrderType {
  if (!Number.isFinite(entry) || !Number.isFinite(marketPrice ?? NaN)) return "market";
  const price = marketPrice as number;
  const epsilon = tick > 0 ? tick : Math.abs(price) * 1e-6;
  const delta = entry - price;
  if (Math.abs(delta) <= epsilon) return "market";
  if (direction === "buy") return delta > 0 ? "buy_stop" : "buy_limit";
  return delta < 0 ? "sell_stop" : "sell_limit";
}

export interface OrderDraft {
  symbol: string;
  direction: OrderDirection;
  orderType: OrderType;
  entry: number;
  stop: number;
  target: number;
  size: number | null;
  drawingId: string;
}

/** Build a draft from a completed Position Tool drawing. */
export function draftFromDrawing(
  d: Drawing,
  opts: { symbol: string; marketPrice?: number | null; tick?: number; riskBudget?: number },
): OrderDraft | null {
  const m = positionMetrics(d, { tick: opts.tick, riskBudget: opts.riskBudget });
  if (!m) return null;
  const direction = directionOf(d);
  return {
    symbol: opts.symbol,
    direction,
    orderType: inferOrderType(direction, m.entry, opts.marketPrice, opts.tick ?? 0),
    entry: m.entry,
    stop: m.stop,
    target: m.target,
    size: m.size,
    drawingId: d.id,
  };
}

export interface OrderValidation {
  ok: boolean;
  errors: string[];
}

/**
 * Validation rules — an invalid draft can never become a pending order.
 *
 *  · prices must be finite and positive
 *  · buy  → stop below entry, target above entry
 *  · sell → stop above entry, target below entry
 *  · risk must be non-zero (no zero-risk positions)
 *  · limit / stop order types must sit on the correct side of the market
 */
export function validateOrder(
  draft: OrderDraft,
  opts: { marketPrice?: number | null; tick?: number; maxRiskPct?: number } = {},
): OrderValidation {
  const errors: string[] = [];
  const { entry, stop, target, direction, orderType, size } = draft;

  if (![entry, stop, target].every((v) => Number.isFinite(v) && v > 0)) {
    return { ok: false, errors: ["Entry, stop and target must all be positive finite prices."] };
  }

  if (size != null && (!Number.isFinite(size) || size <= 0 || size > 1_000_000_000)) {
    errors.push("Lot size must be a finite number between 0 and 1,000,000,000.");
  }

  if (direction === "buy") {
    if (stop >= entry) errors.push("Buy order: stop loss must be below entry.");
    if (target <= entry) errors.push("Buy order: take profit must be above entry.");
  } else {
    if (stop <= entry) errors.push("Sell order: stop loss must be above entry.");
    if (target >= entry) errors.push("Sell order: take profit must be below entry.");
  }

  const risk = Math.abs(entry - stop);
  const reward = Math.abs(target - entry);

  if (!Number.isFinite(risk) || risk > 1_000_000_000_000) errors.push("Invalid risk value.");
  if (!Number.isFinite(reward) || reward > 1_000_000_000_000) {
    errors.push("Invalid reward value. Take profit might be too far or infinite.");
  }

  const tick = opts.tick && opts.tick > 0 ? opts.tick : 0;
  if (risk <= 0 || (tick > 0 && risk < tick)) {
    errors.push("Risk is zero — move the stop away from the entry price.");
  }
  if (reward <= 0) {
    errors.push("Reward is zero — move the target away from the entry price.");
  }


  const market = opts.marketPrice;
  if (orderType !== "market" && Number.isFinite(market ?? NaN)) {
    const price = market as number;
    const epsilon = tick > 0 ? tick : 0;
    const above = entry > price + epsilon;
    const below = entry < price - epsilon;
    if (orderType === "buy_limit" && !below) errors.push("Buy Limit requires an entry below the current price.");
    if (orderType === "buy_stop" && !above) errors.push("Buy Stop requires an entry above the current price.");
    if (orderType === "sell_limit" && !above) errors.push("Sell Limit requires an entry above the current price.");
    if (orderType === "sell_stop" && !below) errors.push("Sell Stop requires an entry below the current price.");
  }

  return { ok: errors.length === 0, errors };
}

export function newOrderId() {
  return `o_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/** Materialise a validated draft into a canonical pending order. */
export function createOrder(draft: OrderDraft, now = Date.now()): PositionOrder {
  const risk = Math.abs(draft.entry - draft.stop);
  const reward = Math.abs(draft.target - draft.entry);
  return {
    id: newOrderId(),
    symbol: draft.symbol,
    direction: draft.direction,
    orderType: draft.orderType,
    entry: draft.entry,
    stop: draft.stop,
    target: draft.target,
    risk,
    reward,
    rr: risk > 0 ? reward / risk : 0,
    size: draft.size,
    status: "pending",
    source: ORDER_SOURCE,
    drawingId: draft.drawingId,
    createdAt: now,
    updatedAt: now,
  };
}

/** Re-derive risk/reward after an edit (drag or numeric change). */
export function withLevels(
  order: PositionOrder,
  levels: { entry?: number; stop?: number; target?: number; orderType?: OrderType },
  now = Date.now(),
): PositionOrder {
  const entry = levels.entry ?? order.entry;
  const stop = levels.stop ?? order.stop;
  const target = levels.target ?? order.target;
  const risk = Math.abs(entry - stop);
  const reward = Math.abs(target - entry);
  return {
    ...order,
    entry,
    stop,
    target,
    orderType: levels.orderType ?? order.orderType,
    risk,
    reward,
    rr: risk > 0 ? reward / risk : 0,
    updatedAt: now,
  };
}

/** Distance from the current market price to the entry. */
export function entryDistance(order: Pick<PositionOrder, "entry">, marketPrice?: number | null) {
  if (!Number.isFinite(marketPrice ?? NaN)) return null;
  return order.entry - (marketPrice as number);
}

export function newPositionId() {
  return `p_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/**
 * Live metrics for an open position.
 *
 * `size` is optional throughout the app (account sizing lands in a later
 * phase), so P/L is reported per-unit when size is unknown — the R multiple
 * and percentage are size-independent and always meaningful.
 */
export interface LivePositionMetrics {
  /** Signed price move in the trader's favour. */
  move: number;
  /** Floating P/L in quote currency (× size when known, else per unit). */
  pnl: number;
  /** True when P/L is per-unit because position size is unknown. */
  perUnit: boolean;
  /** Floating result in R multiples. */
  r: number;
  /** Unrealised move as a percentage of the fill price. */
  pct: number;
  /** Absolute distance from market to the stop. */
  toStop: number;
  /** Absolute distance from market to the target. */
  toTarget: number;
  /** Fraction of the way from fill to target, clamped 0…1. */
  progress: number;
}

export function livePositionMetrics(
  order: PositionOrder,
  marketPrice: number | null | undefined,
): LivePositionMetrics | null {
  const fill = order.fillPrice ?? order.entry;
  if (!Number.isFinite(fill) || !Number.isFinite(marketPrice ?? NaN)) return null;
  const price = marketPrice as number;
  const sign = order.direction === "buy" ? 1 : -1;
  const move = (price - fill) * sign;
  const risk = Math.abs(fill - order.stop);
  const reward = Math.abs(order.target - fill);
  return {
    move,
    pnl: order.size && order.size > 0 ? move * order.size : move,
    perUnit: !(order.size && order.size > 0),
    r: risk > 0 ? move / risk : 0,
    pct: fill !== 0 ? (move / fill) * 100 : 0,
    toStop: Math.abs(price - order.stop),
    toTarget: Math.abs(order.target - price),
    progress: reward > 0 ? Math.min(1, Math.max(0, move / reward)) : 0,
  };
}

/** Realised result of a closed position. */
export function realizedResult(order: PositionOrder, closePrice: number) {
  const fill = order.fillPrice ?? order.entry;
  const sign = order.direction === "buy" ? 1 : -1;
  const move = (closePrice - fill) * sign;
  const risk = Math.abs(fill - order.stop);
  return {
    realizedPnl: order.size && order.size > 0 ? move * order.size : move,
    realizedR: risk > 0 ? move / risk : 0,
  };
}

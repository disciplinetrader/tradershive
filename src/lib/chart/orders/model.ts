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
  /**
   * Protective stop, or `null` when the position carries none.
   *
   * A market order may be opened with no stop and no target: that is a
   * position with no protection and no objective, NOT one whose levels sit at
   * zero. Every read must ask before using it — `Number.isFinite` rather than
   * `!= null`, because undefined and NaN say the same thing here and NaN
   * comparisons are quietly false, which reads as "never triggers" while
   * actually meaning "silently unprotected". See RS-4.
   */
  stop: number | null;
  /** Objective, or `null` when the position has none. Same rules as `stop`. */
  target: number | null;
  /** Absolute price distance entry → stop; `null` when there is no stop. */
  risk: number | null;
  /** Absolute price distance entry → target; `null` when there is no target. */
  reward: number | null;
  /** reward / risk; `null` unless BOTH levels exist. */
  rr: number | null;
  /**
   * Position size in **UNITS of the instrument**, not lots. Null until account
   * sizing is connected.
   *
   * ⚠ Callers must convert. `size` is consumed as a plain multiplier on price
   * movement (`pnl: move * order.size`, below), so it only yields money when it
   * holds units — while `validateOrder` still reports it as "Lot size", and the
   * Position Tool that feeds it thinks in lots. The two differ by
   * `contractSize`: 1 for crypto, **100,000 for every forex pair**.
   *
   * Passing lots here does not fail. It silently understates P&L by
   * `contractSize`, and it is invisible on crypto because contractSize is 1
   * there. It was measured at 100,000x on EUR/USD — an engine fill of $0.0218
   * against a true $2,178.20 — before `BattleChart` was corrected to multiply
   * on the way in. See BA-9 in docs/known-issues.md.
   *
   * The durable fix is to rename this field to `units` and make the conversion
   * explicit at every boundary. Until that happens, every new caller has to
   * remember, which is exactly why this comment is here.
   */
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
  initialStop?: number | null;
  /** Target as it stood at fill time. */
  initialTarget?: number | null;


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
  /** `null` when the position carried no stop — see `LivePositionMetrics.r`. */
  realizedR?: number | null;
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
  /** Protective stop, or `null` to open with none. See `PositionOrder.stop`. */
  stop: number | null;
  /** Objective, or `null` to open with none. See `PositionOrder.target`. */
  target: number | null;
  /**
   * UNITS, not lots — see the warning on `PositionOrder.size`. Multiply lots by
   * the symbol's `contractSize` before constructing a draft, or forex P&L comes
   * out 100,000x too small without erroring. BA-9.
   */
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

  const values = [entry, stop, target, size, opts.marketPrice, opts.maxRiskPct].filter(v => v !== undefined && v !== null);
  if (values.some(v => !Number.isFinite(v))) {
    return { ok: false, errors: ["Trading values must be finite numbers. Infinity and NaN are rejected."] };
  }

  if (!(entry > 0)) {
    return { ok: false, errors: ["Entry must be a positive price."] };
  }

  /**
   * Optional levels are a MARKET-ORDER privilege (RS-4).
   *
   * A market order fills instantly, so there is no pre-commit window in which
   * to position anything; it is opened and then protected, which is what the
   * real product does. A resting order is the opposite — it is composed before
   * it exists, so there is no reason to accept an incomplete one, and a pending
   * order with no stop would sit in the book for hours as an unprotected
   * position waiting to happen.
   *
   * ⚠ The limit/stop half of this is INFERRED, not confirmed. RS-4 flags it:
   * both FXReplay recordings showed only market Buy/Sell, so "resting orders
   * stay strict" is the conservative reading rather than an observed rule. If
   * evidence turns up either way, this is the single place that changes.
   */
  const levelsOptional = orderType === "market";

  if (!levelsOptional && !(hasLevel(stop) && hasLevel(target))) {
    return {
      ok: false,
      errors: ["A resting order needs both a stop and a target before it can be placed."],
    };
  }

  if ((hasLevel(stop) && !(stop > 0)) || (hasLevel(target) && !(target > 0))) {
    return { ok: false, errors: ["Stop and target must be positive prices when set."] };
  }

  // The message says "lot size" and the field holds UNITS. That mismatch is
  // half of BA-9 — it is what persuades a caller to pass lots. The wording is
  // left alone here because it is user-facing copy and the real repair is
  // renaming the field; do both together, not this one alone.
  if (size != null && (size <= 0 || size > 1_000_000_000)) {
    errors.push("Lot size must be between 0 and 1,000,000,000.");
  }

  // Each level is judged only if it exists. An absent one is not a level on the
  // wrong side of the entry — it is the absence of a constraint.
  if (direction === "buy") {
    if (hasLevel(stop) && stop >= entry) errors.push("Buy order: stop loss must be below entry.");
    if (hasLevel(target) && target <= entry) errors.push("Buy order: take profit must be above entry.");
  } else {
    if (hasLevel(stop) && stop <= entry) errors.push("Sell order: stop loss must be above entry.");
    if (hasLevel(target) && target >= entry) errors.push("Sell order: take profit must be below entry.");
  }

  const risk = levelDistance(entry, stop);
  const reward = levelDistance(entry, target);

  if (risk != null && risk > 1_000_000_000_000) errors.push("Invalid risk value (numeric overflow).");
  if (reward != null && reward > 1_000_000_000_000) errors.push("Invalid reward value (numeric overflow).");

  // A stop that EXISTS still may not sit on top of the entry: a zero-distance
  // stop is unsizeable (it divides into the risk budget) and is the reason the
  // "seed both levels at the entry price" shortcut was rejected — see RS-4.
  const tick = opts.tick && opts.tick > 0 ? opts.tick : 0;
  if (risk != null && (risk <= 0 || (tick > 0 && risk < tick))) {
    errors.push("Risk is zero or negative — move the stop away from the entry price.");
  }
  if (reward != null && reward <= 0) {
    errors.push("Reward is zero or negative — move the target away from the entry price.");
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

/* ══════════════════════════════════════════════════════════════════════
   Absent levels — the single place that decides what "no level" means
   ══════════════════════════════════════════════════════════════════════ */

/**
 * True when a level is really there.
 *
 * `Number.isFinite` rather than `!= null` on purpose, and this is the whole
 * reason the helper exists: `undefined` and `NaN` say exactly what `null` says
 * here — there is no usable level — and NaN comparisons are quietly false,
 * which reads as "never triggers" while actually meaning "silently
 * unprotected". Stage 1 and Stage A' both reached for `Number.isFinite`
 * independently; this is that decision, named once.
 */
export function hasLevel(v: number | null | undefined): v is number {
  return Number.isFinite(v as number);
}

/**
 * Absolute distance between a price and a level, or `null` when the level is
 * absent.
 *
 * THE subtraction. Three sites had each written `Math.abs(a - b)` against a
 * possibly-absent level before Stage A' (`riskBasisOf`, `openExecution`, the
 * closed-trade builder), and every one of them silently coerced: `fill - null`
 * is `fill - 0`, so an absent stop reported a risk distance equal to the ENTIRE
 * FILL PRICE — large, finite and completely fictional. Route every level
 * distance through here so there is no fourth.
 */
export function levelDistance(price: number, level: number | null | undefined): number | null {
  if (!hasLevel(price) || !hasLevel(level)) return null;
  return Math.abs(price - level);
}

/** Divide two possibly-absent distances into an R:R, or `null`. */
export function ratioOf(reward: number | null, risk: number | null): number | null {
  if (!hasLevel(reward) || !hasLevel(risk) || risk <= 0) return null;
  return reward / risk;
}

export function newOrderId() {
  return `o_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/** Materialise a validated draft into a canonical pending order. */
export function createOrder(draft: OrderDraft, now = Date.now()): PositionOrder {
  const risk = levelDistance(draft.entry, draft.stop);
  const reward = levelDistance(draft.entry, draft.target);
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
    rr: ratioOf(reward, risk),
    size: draft.size,
    status: "pending",
    source: ORDER_SOURCE,
    drawingId: draft.drawingId,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Re-derive risk/reward after an edit (drag or numeric change).
 *
 * `undefined` and `null` are DIFFERENT arguments here, and the difference is
 * load-bearing now that levels are optional: omitting a key leaves that level
 * alone, while passing `null` REMOVES it. Collapsing the two with `??` — which
 * is what this did while levels were mandatory — would make "clear the stop"
 * silently mean "keep the stop", so a trader who removed protection would still
 * be carrying it.
 */
export function withLevels(
  order: PositionOrder,
  levels: { entry?: number; stop?: number | null; target?: number | null; orderType?: OrderType },
  now = Date.now(),
): PositionOrder {
  const entry = levels.entry ?? order.entry;
  const stop = levels.stop === undefined ? order.stop : levels.stop;
  const target = levels.target === undefined ? order.target : levels.target;
  const risk = levelDistance(entry, stop);
  const reward = levelDistance(entry, target);
  return {
    ...order,
    entry,
    stop,
    target,
    orderType: levels.orderType ?? order.orderType,
    risk,
    reward,
    rr: ratioOf(reward, risk),
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
  /**
   * Floating result in R multiples, or `null` when there is no stop.
   *
   * `null` rather than 0: with no stop there is no risk to measure against, and
   * "0.00R" reads as a real flat result rather than as an absent measurement.
   * Displays show an em-dash. Same call Stage A' made for `riskBasisOf`.
   */
  r: number | null;
  /** Unrealised move as a percentage of the fill price. */
  pct: number;
  /** Absolute distance from market to the stop; `null` when there is no stop. */
  toStop: number | null;
  /** Absolute distance from market to the target; `null` when there is none. */
  toTarget: number | null;
  /** Fraction of the way from fill to target, or `null` with no target. */
  progress: number | null;
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
  const risk = levelDistance(fill, order.stop);
  const reward = levelDistance(fill, order.target);
  return {
    move,
    // `move * size` is money only when `size` is units. See PositionOrder.size.
    pnl: order.size && order.size > 0 ? move * order.size : move,
    perUnit: !(order.size && order.size > 0),
    // Signed: `move` keeps its direction, only the DIVISOR is optional.
    r: risk != null && risk > 0 ? move / risk : null,
    pct: fill !== 0 ? (move / fill) * 100 : 0,
    toStop: levelDistance(price, order.stop),
    toTarget: levelDistance(price, order.target),
    progress: reward != null && reward > 0 ? Math.min(1, Math.max(0, move / reward)) : null,
  };
}

/** Realised result of a closed position. */
export function realizedResult(order: PositionOrder, closePrice: number) {
  const fill = order.fillPrice ?? order.entry;
  const sign = order.direction === "buy" ? 1 : -1;
  const move = (closePrice - fill) * sign;
  const risk = levelDistance(fill, order.stop);
  return {
    realizedPnl: order.size && order.size > 0 ? move * order.size : move,
    // A trade closed with no stop has a real P/L and NO R. Reporting 0 would
    // put a fabricated flat result into the durable tape and into analytics.
    realizedR: risk != null && risk > 0 ? move / risk : null,
  };
}

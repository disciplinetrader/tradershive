/**
 * Position Tool — Phase 6 Position Manager.
 *
 * Domain boundary
 * ---------------
 *   Account → Risk Engine → Execution Engine → Position Manager → Journal
 *
 * The Position Manager owns everything that happens to a position BETWEEN
 * its first fill and its final flat: partial closes, scale-ins, scale-outs,
 * the take-profit ladder, break-even, trailing and the execution tape.
 *
 *  · It does NOT decide entry fills — that is the Execution Engine.
 *  · It does NOT size positions — that is the Risk Engine.
 *  · It does NOT write journals — the Journal reads execution history and
 *    never writes to it.
 *  · It never constructs a ClosedTrade; it only reports `flat: true`, and
 *    `service.ts` performs the single, idempotent closure.
 *
 * Every function here is PURE: it takes an order and returns the next order.
 * Nothing touches a store, localStorage, the network or the clock unless a
 * timestamp is passed in. That is what makes the twenty regression cases in
 * `__tests__/position-manager.test.ts` deterministic.
 *
 * Position identity
 * -----------------
 * `positionId` is written once, at fill, and is never rewritten by anything
 * in this module. A partial close, a scale-in and a trailing move all leave
 * it byte-identical — one position, many executions.
 */

import {
  aggregateExecutions, favourableMove, isFlat, newExecutionId, nextSeq,
  type ExecutionKind, type PositionExecution,
} from "./executions";
import { isLive } from "./lifecycle";
import type { CloseReason, OrderDirection, PositionOrder } from "./model";
import { allocatedPercent, legTriggered, type TakeProfitLeg } from "./take-profit";
import { improvesStop, nextTrailingStop, type TrailingContext } from "./trailing";

export type ManageResult =
  | { ok: true; order: PositionOrder; execution?: PositionExecution; flat: boolean }
  | { ok: false; error: string };

/** Units the position is accounted in. Unknown sizing collapses to 1 unit. */
export function effectiveQuantity(order: Pick<PositionOrder, "size">): number {
  return order.size && order.size > 0 ? order.size : 1;
}

/** True when sizing is unknown and every currency figure is per-unit. */
export function isPerUnit(order: Pick<PositionOrder, "originalQuantity" | "size">): boolean {
  return !(order.size && order.size > 0) && !(order.originalQuantity && order.originalQuantity > 0);
}

export function originalQuantityOf(order: PositionOrder): number {
  if (order.originalQuantity && order.originalQuantity > 0) return order.originalQuantity;
  return effectiveQuantity(order);
}

export function remainingQuantityOf(order: PositionOrder): number {
  if (Number.isFinite(order.remainingQuantity ?? NaN)) return order.remainingQuantity as number;
  return effectiveQuantity(order);
}

/**
 * Per-unit risk distance. Captured at open and never re-based: a stop drag,
 * a break-even move or a trailing step must not silently rewrite the R the
 * trade was measured against.
 */
export function riskBasisOf(order: PositionOrder): number {
  if (order.riskBasis && order.riskBasis > 0) return order.riskBasis;
  const fill = order.fillPrice ?? order.entry;
  return stopDistance(fill, order.initialStop ?? order.stop) ?? 0;
}

/**
 * Distance from a fill to a stop, or NULL when there is no usable stop.
 *
 * The one place this subtraction is allowed to happen. Written once and shared
 * because the same coercion had already been made three times independently:
 * `Math.abs(fill - stop)` with an absent stop does not throw and does not
 * produce NaN — `fill - null` is `fill - 0`, so the "risk distance" comes back
 * as the ENTIRE FILL PRICE. Measured: a stopless position at 63,000 reported a
 * risk basis of 63000, which is large, finite and completely fictional. Every
 * R-multiple derived from it is then a small, plausible-looking, wrong number.
 *
 * That is worse than a crash: it reaches the position label, the blotter and
 * the durable closed-trade record looking like a real measurement. Same family
 * as the `exitFor` bug that closed a targetless long at price 0.
 *
 * Callers decide what absent means for them — 0 where the existing convention
 * is already "0 means no basis", null where a display needs to say so.
 */
export function stopDistance(fill: number, stop: number | null | undefined): number | null {
  if (!Number.isFinite(fill) || !Number.isFinite(stop as number)) return null;
  return Math.abs(fill - (stop as number));
}

/** Total account-currency risk the position was originally sized against. */
export function initialRiskAmount(order: PositionOrder): number {
  return riskBasisOf(order) * originalQuantityOf(order);
}

function exec(
  order: PositionOrder,
  kind: ExecutionKind,
  fields: {
    quantity: number; price: number; realizedPnl?: number; realizedR?: number;
    remainingQuantity: number; time: number; note?: string;
  },
): PositionExecution {
  return {
    id: newExecutionId(),
    seq: nextSeq(order.executions ?? []),
    time: fields.time,
    kind,
    quantity: fields.quantity,
    price: fields.price,
    realizedPnl: fields.realizedPnl ?? 0,
    realizedR: fields.realizedR ?? 0,
    remainingQuantity: fields.remainingQuantity,
    note: fields.note,
  };
}

function withExecution(
  order: PositionOrder,
  execution: PositionExecution,
  patch: Partial<PositionOrder>,
  now: number,
): PositionOrder {
  const executions = [...(order.executions ?? []), execution];
  const agg = aggregateExecutions(executions);
  return {
    ...order,
    ...patch,
    executions,
    // `size` mirrors the remaining quantity so every pre-Phase-6 consumer
    // (floating P/L, chart badges) automatically reflects partial exits.
    size: order.size && order.size > 0 ? agg.remainingQuantity : order.size,
    remainingQuantity: agg.remainingQuantity,
    originalQuantity: agg.totalEntryQuantity,
    realizedPnl: agg.realizedPnl,
    realizedR: agg.realizedR,
    updatedAt: now,
  };
}

/**
 * Seed the tape at fill time. Called exactly once, by the Execution Engine's
 * fill path, and guarded so a replayed fill cannot append a second `open`.
 */
export function openExecution(order: PositionOrder, now = Date.now()): PositionOrder {
  if (order.executions?.some((e) => e.kind === "open")) return order;
  const qty = effectiveQuantity(order);
  const fill = order.fillPrice ?? order.entry;
  // Seeded ONCE at fill time and never re-derived, so a fictional basis here is
  // baked into the position for its whole life. `?? 0` lands on the existing
  // `basis > 0` guard below, which stores `undefined` rather than a fake number.
  const basis = stopDistance(fill, order.initialStop ?? order.stop) ?? 0;
  const e = exec(order, "open", { quantity: qty, price: fill, remainingQuantity: qty, time: now });
  return {
    ...order,
    executions: [e],
    originalQuantity: qty,
    remainingQuantity: qty,
    riskBasis: basis > 0 ? basis : undefined,
    realizedPnl: 0,
    realizedR: 0,
    updatedAt: now,
  };
}

/** Resolve a percent-or-quantity request against the remaining size. */
export function resolveQuantity(
  order: PositionOrder,
  req: { quantity?: number; percent?: number },
  basis: "remaining" | "original" = "remaining",
): number | null {
  const remaining = remainingQuantityOf(order);
  if (Number.isFinite(req.quantity ?? NaN)) {
    const q = req.quantity as number;
    return q > 0 ? Math.min(q, remaining) : null;
  }
  if (Number.isFinite(req.percent ?? NaN)) {
    const pct = req.percent as number;
    if (!(pct > 0)) return null;
    const base = basis === "original" ? originalQuantityOf(order) : remaining;
    return Math.min(remaining, (base * Math.min(pct, 100)) / 100);
  }
  return null;
}

export interface PartialCloseRequest {
  /** Explicit units, or… */
  quantity?: number;
  /** …a percentage. 25 / 50 / 75 / custom. */
  percent?: number;
  /** Percentages resolve against this basis. TP legs use `original`. */
  basis?: "remaining" | "original";
  price: number;
  kind?: Extract<ExecutionKind, "partial_close" | "scale_out" | "take_profit" | "stop_out" | "close">;
  note?: string;
  now?: number;
}

/**
 * Reduce an open position.
 *
 * Same position id. Same drawing. Same entry. Only the remaining quantity,
 * the realized totals and the tape change. When the request consumes the
 * last unit the result is flagged `flat` and the caller performs the single
 * closure — this module never closes anything itself, which is what makes a
 * duplicate ClosedTrade structurally impossible.
 */
export function partialClose(order: PositionOrder, req: PartialCloseRequest): ManageResult {
  if (!isLive(order.status)) return { ok: false, error: "Position is not open." };
  if (!Number.isFinite(req.price) || req.price <= 0) return { ok: false, error: "Invalid exit price." };

  const now = req.now ?? Date.now();
  const remaining = remainingQuantityOf(order);
  if (isFlat(remaining, originalQuantityOf(order))) {
    return { ok: false, error: "Position has no remaining quantity." };
  }

  const qty = resolveQuantity(order, req, req.basis ?? "remaining");
  if (qty === null || qty <= 0) return { ok: false, error: "Invalid close quantity." };

  const fill = order.fillPrice ?? order.entry;
  const move = favourableMove(order.direction, fill, req.price);
  const realizedPnl = move * qty;
  const riskAmount = initialRiskAmount(order);
  const realizedR = riskAmount > 0 ? realizedPnl / riskAmount : 0;

  const nextRemaining = Math.max(0, remaining - qty);
  const flat = isFlat(nextRemaining, originalQuantityOf(order));

  const e = exec(order, req.kind ?? (flat ? "close" : "partial_close"), {
    quantity: qty,
    price: req.price,
    realizedPnl,
    realizedR,
    remainingQuantity: flat ? 0 : nextRemaining,
    time: now,
    note: req.note,
  });

  return { ok: true, order: withExecution(order, e, {}, now), execution: e, flat };
}

export interface ScaleInRequest {
  quantity?: number;
  /** Percentage of the ORIGINAL quantity to add. */
  percent?: number;
  price: number;
  note?: string;
  now?: number;
}

/**
 * Add to an open position.
 *
 * The entry becomes the quantity-weighted average of every entry leg, and
 * risk / reward distances are re-derived against it. `riskBasis` — and
 * therefore the R denominator — is deliberately NOT re-based: R stays
 * measured against the risk the trade was originally sized with, so adding
 * size cannot flatter the R history of the legs already closed.
 */
export function scaleIn(order: PositionOrder, req: ScaleInRequest): ManageResult {
  if (!isLive(order.status)) return { ok: false, error: "Position is not open." };
  if (!Number.isFinite(req.price) || req.price <= 0) return { ok: false, error: "Invalid entry price." };

  const now = req.now ?? Date.now();
  const original = originalQuantityOf(order);
  const qty = Number.isFinite(req.quantity ?? NaN)
    ? (req.quantity as number)
    : Number.isFinite(req.percent ?? NaN)
      ? (original * (req.percent as number)) / 100
      : null;
  if (qty === null || !(qty > 0)) return { ok: false, error: "Invalid scale-in quantity." };

  const remaining = remainingQuantityOf(order);
  const e = exec(order, "scale_in", {
    quantity: qty,
    price: req.price,
    remainingQuantity: remaining + qty,
    time: now,
    note: req.note,
  });

  const agg = aggregateExecutions([...(order.executions ?? []), e]);
  const entry = agg.averageEntry;
  const risk = Math.abs(entry - order.stop);
  const reward = Math.abs(order.target - entry);

  return {
    ok: true,
    order: withExecution(order, e, {
      // Weighted average entry becomes the position's basis price.
      entry,
      fillPrice: entry,
      risk,
      reward,
      rr: risk > 0 ? reward / risk : 0,
      // Sizing is now known in units even if it was per-unit before.
      size: agg.remainingQuantity,
    }, now),
    execution: e,
    flat: false,
  };
}

/** Manual scale-out is a partial close that is explicitly not target-driven. */
export function scaleOut(order: PositionOrder, req: Omit<PartialCloseRequest, "kind">): ManageResult {
  return partialClose(order, { ...req, kind: "scale_out" });
}

/* ══════════════════════════════════════════════════════════════════════
   Break-even engine
   ══════════════════════════════════════════════════════════════════════ */

export interface BreakEvenResult {
  ok: boolean;
  order?: PositionOrder;
  error?: string;
}

/**
 * Move the stop to the entry (optionally plus a buffer).
 *
 * Idempotent by `breakEvenAt`: once break-even has been applied the engine
 * will not apply it again, which is the "never trigger twice" rule. A manual
 * call after a trailing stop has already moved past entry is rejected too —
 * that would LOOSEN the stop, and the stop never moves backwards.
 */
export function applyBreakEven(
  order: PositionOrder,
  opts: { price?: number | null; offset?: number; now?: number; auto?: boolean } = {},
): BreakEvenResult {
  if (!isLive(order.status)) return { ok: false, error: "Position is not open." };
  const now = opts.now ?? Date.now();
  const entry = order.fillPrice ?? order.entry;
  const offset = Number.isFinite(opts.offset ?? NaN) ? (opts.offset as number) : 0;
  const target = order.direction === "buy" ? entry + offset : entry - offset;

  if (order.stop === target) return { ok: false, error: "Stop is already at break-even." };
  if (!improvesStop(order.direction, order.stop, target, opts.price)) {
    return {
      ok: false,
      error: order.breakEvenAt
        ? "Stop is already at or beyond break-even."
        : "Move into profit before setting break-even.",
    };
  }

  const e = exec(order, "stop_move", {
    quantity: 0,
    price: target,
    remainingQuantity: remainingQuantityOf(order),
    time: now,
    note: opts.auto ? "Auto break-even" : "Break-even",
  });

  return {
    ok: true,
    order: withExecution(order, e, { stop: target, breakEvenAt: now }, now),
  };
}

/**
 * Automatic break-even: fires once, the first time floating R reaches the
 * configured trigger (+1R, +1.5R, +2R…). Returns `null` when nothing to do,
 * so the tick loop stays allocation-free in the common case.
 */
export function evaluateAutoBreakEven(
  order: PositionOrder,
  price: number,
  now = Date.now(),
): PositionOrder | null {
  const trigger = order.autoBreakEvenR;
  if (!trigger || trigger <= 0) return null;
  if (order.breakEvenAt) return null; // never twice
  if (!isLive(order.status)) return null;

  const m = advancedMetrics(order, price);
  if (!m || m.floatingR < trigger) return null;

  const res = applyBreakEven(order, { price, now, auto: true });
  return res.ok && res.order ? res.order : null;
}

/* ══════════════════════════════════════════════════════════════════════
   Trailing engine
   ══════════════════════════════════════════════════════════════════════ */

/**
 * Apply the trailing configuration for one market context. Returns `null`
 * when the stop must not move — the monotonic and self-trigger guards live
 * in `trailing.ts` and are the single source of that rule.
 */
export function applyTrailing(
  order: PositionOrder,
  ctx: TrailingContext,
  now = Date.now(),
): PositionOrder | null {
  if (!isLive(order.status)) return null;
  const stop = nextTrailingStop(order, order.trailing, ctx);
  if (stop === null) return null;

  const e = exec(order, "stop_move", {
    quantity: 0,
    price: stop,
    remainingQuantity: remainingQuantityOf(order),
    time: now,
    note: `Trail · ${order.trailing?.mode}`,
  });
  return withExecution(order, e, { stop }, now);
}

/** Record a manual protective-level drag on the tape. */
export function recordLevelMove(
  order: PositionOrder,
  levels: { stop?: number; target?: number },
  now = Date.now(),
): PositionOrder {
  let next = order;
  if (Number.isFinite(levels.stop ?? NaN) && levels.stop !== order.stop) {
    const e = exec(next, "stop_move", {
      quantity: 0, price: levels.stop as number,
      remainingQuantity: remainingQuantityOf(next), time: now, note: "Manual",
    });
    next = withExecution(next, e, { stop: levels.stop as number }, now);
  }
  if (Number.isFinite(levels.target ?? NaN) && levels.target !== order.target) {
    const e = exec(next, "target_move", {
      quantity: 0, price: levels.target as number,
      remainingQuantity: remainingQuantityOf(next), time: now, note: "Manual",
    });
    next = withExecution(next, e, { target: levels.target as number }, now);
  }
  return next;
}

/* ══════════════════════════════════════════════════════════════════════
   Take-profit ladder
   ══════════════════════════════════════════════════════════════════════ */

export interface LadderStep {
  order: PositionOrder;
  execution?: PositionExecution;
  leg: TakeProfitLeg;
  flat: boolean;
}

/**
 * Execute every TP leg this tick reaches, in ladder order, applying each
 * leg's post-fill action (break-even, activate trailing) as it fills.
 *
 * Allocation is measured against the ORIGINAL quantity, so TP1 25% + TP2 25%
 * + TP3 50% closes exactly the position and never over-sells. The final leg
 * takes whatever remains, which absorbs any rounding dust.
 */
export function evaluateTakeProfits(
  order: PositionOrder,
  price: number,
  now = Date.now(),
): { order: PositionOrder; steps: LadderStep[]; flat: boolean } {
  const legs = order.takeProfits ?? [];
  if (!legs.length || !isLive(order.status)) return { order, steps: [], flat: false };

  let current = order;
  const steps: LadderStep[] = [];
  let flat = false;

  for (const leg of [...legs].sort((a, b) => a.index - b.index)) {
    if (flat) break;
    const live = (current.takeProfits ?? []).find((l) => l.id === leg.id);
    if (!live || !legTriggered(current.direction, live, price)) continue;

    // Only the final leg of a ladder that allocates the WHOLE position may
    // sweep the remainder. A ladder that allocates less (25 + 25) leaves a
    // deliberate runner open — closing it here would silently flatten a
    // position the trader chose to keep.
    const noPendingLeft = (current.takeProfits ?? [])
      .filter((l) => l.status === "pending" && l.id !== live.id).length === 0;
    const fullyAllocated = allocatedPercent(current.takeProfits ?? []) >= 99.999;
    const isLast = noPendingLeft && fullyAllocated;

    const res = partialClose(current, {
      // The last leg of a full ladder closes the remainder — no dust left.
      percent: isLast ? 100 : live.percent,
      basis: isLast ? "remaining" : "original",

      price: live.price, // no price improvement
      kind: "take_profit",
      note: `TP${live.index} · ${live.percent}%`,
      now,
    });
    if (!res.ok) continue;

    let next: PositionOrder = {
      ...res.order,
      takeProfits: (res.order.takeProfits ?? []).map((l) =>
        l.id === live.id ? { ...l, status: "filled" as const, filledAt: now, filledPrice: live.price } : l,
      ),
    };

    if (!res.flat) {
      if (live.action === "break_even") {
        const be = applyBreakEven(next, { price, now, auto: true });
        if (be.ok && be.order) next = be.order;
      } else if (live.action === "trail" && next.trailing) {
        next = { ...next, trailing: { ...next.trailing, active: true }, updatedAt: now };
      }
    }

    steps.push({ order: next, execution: res.execution, leg: live, flat: res.flat });
    current = next;
    flat = res.flat;
  }

  return { order: current, steps, flat };
}

/* ══════════════════════════════════════════════════════════════════════
   Live metrics
   ══════════════════════════════════════════════════════════════════════ */

export interface AdvancedPositionMetrics {
  originalQuantity: number;
  remainingQuantity: number;
  closedPercent: number;
  averageEntry: number;
  averageExit: number | null;

  floatingPnl: number;
  floatingR: number;
  realizedPnl: number;
  realizedR: number;
  totalPnl: number;
  totalR: number;

  /** Currency still at risk if the stop is hit from here. */
  remainingRisk: number;
  /** Guaranteed currency result if the stop is hit from here (can be < 0). */
  lockedProfit: number;
  /** Reward-to-risk from the current market to stop / target. */
  currentRR: number;
  /** Notional exposure of the remaining size. */
  marginUsed: number;

  distanceToStop: number;
  distanceToTarget: number;
  perUnit: boolean;
}

/**
 * The full Phase 6 metric set, recomputed on every tick from canonical state.
 * Nothing here is persisted: metrics are always derived, never stored, which
 * is why they cannot drift from the tape.
 */
export function advancedMetrics(
  order: PositionOrder,
  marketPrice: number | null | undefined,
): AdvancedPositionMetrics | null {
  const fill = order.fillPrice ?? order.entry;
  if (!Number.isFinite(fill) || !Number.isFinite(marketPrice ?? NaN)) return null;
  const price = marketPrice as number;

  const agg = order.executions?.length ? aggregateExecutions(order.executions) : null;
  const original = originalQuantityOf(order);
  const remaining = remainingQuantityOf(order);
  const averageEntry = agg?.averageEntry || fill;
  const riskAmount = initialRiskAmount(order);

  const move = favourableMove(order.direction, averageEntry, price);
  const floatingPnl = move * remaining;
  const realizedPnl = agg?.realizedPnl ?? order.realizedPnl ?? 0;
  const realizedR = agg?.realizedR ?? order.realizedR ?? 0;

  // Currency the position would give back from here if the stop is hit.
  const stopMove = favourableMove(order.direction, averageEntry, order.stop);
  const atStop = stopMove * remaining;

  const toStop = Math.abs(price - order.stop);
  const toTarget = Math.abs(order.target - price);

  return {
    originalQuantity: original,
    remainingQuantity: remaining,
    closedPercent: original > 0 ? ((original - remaining) / original) * 100 : 0,
    averageEntry,
    averageExit: agg?.averageExit ?? null,

    floatingPnl,
    floatingR: riskAmount > 0 ? floatingPnl / riskAmount : 0,
    realizedPnl,
    realizedR,
    totalPnl: realizedPnl + floatingPnl,
    totalR: riskAmount > 0 ? realizedR + floatingPnl / riskAmount : realizedR,

    // Only adverse exposure counts as risk; a protective stop already in
    // profit has no remaining risk, it has locked profit.
    remainingRisk: Math.max(0, -(realizedPnl + atStop)),
    lockedProfit: realizedPnl + atStop,
    currentRR: toStop > 0 ? toTarget / toStop : 0,
    marginUsed: remaining * price,

    distanceToStop: toStop,
    distanceToTarget: toTarget,
    perUnit: isPerUnit(order),
  };
}

/**
 * Aggregate the tape into the numbers the ClosedTrade needs. Used only when
 * the position actually has execution history; single-shot Phase 3/4/5
 * positions keep their original construction path untouched.
 */
export function closureAggregate(order: PositionOrder): {
  quantity: number;
  averageEntry: number;
  averageExit: number;
  realizedPnl: number;
  realizedR: number;
  closeReason: CloseReason;
} | null {
  if (!order.executions?.length) return null;
  const agg = aggregateExecutions(order.executions);
  if (agg.averageExit === null || agg.totalExitQuantity <= 0) return null;
  const exits = order.executions.filter((e) => e.quantity > 0 && e.realizedPnl !== undefined);
  const last = [...exits].sort((a, b) => b.seq - a.seq)[0];
  const reason: CloseReason =
    last?.kind === "stop_out" ? "stop_loss" : last?.kind === "take_profit" ? "take_profit" : "manual";
  return {
    quantity: agg.totalEntryQuantity,
    averageEntry: agg.averageEntry,
    averageExit: agg.averageExit,
    realizedPnl: agg.realizedPnl,
    realizedR: agg.realizedR,
    closeReason: reason,
  };
}

export type { OrderDirection };

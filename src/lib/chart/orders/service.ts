/**
 * Position Tool — pending order service (Phase 2, final).
 *
 * The single atomic entry point for every pending-order mutation. The UI
 * (context menu, order badge menu, pending-orders panel, ticket dialog)
 * never touches the two stores directly, so the canonical order and its
 * linked drawing can never diverge.
 *
 * Invariants enforced here:
 *   · the canonical order is authoritative for trading status
 *   · the drawing is authoritative only for chart geometry
 *   · order ⇄ drawing are linked by `drawingId`, forever
 *   · an edit mutates the existing order in place (same id, same drawingId)
 *   · cancel is atomic and idempotent, and removes the order from the
 *     persisted list so hydration can never resurrect it
 */

import type { DrawingStore } from "@/lib/chart/drawings/store";
import type { PositionOrderStore } from "./store";
import type { ClosedTradeStore } from "./trade-store";
import { closedTradeStore } from "./trade-store";
import { buildClosedTrade, tradeResult, type ClosedTrade } from "./closed-trade";
import {
  ORDER_TYPE_LABELS, createOrder, newPositionId, realizedResult, validateOrder, withLevels,
  type CloseReason, type OrderDraft, type PositionOrder,
} from "./model";
import { isLive, transition } from "./lifecycle";
import { evaluateTick, type EngineIntent, type FillIntent, type MarketTick } from "./engine";

export interface OrderStores {
  drawings: DrawingStore;
  orders: PositionOrderStore;
  /** Optional in call sites that predate Phase 4; defaults to the singleton. */
  trades?: ClosedTradeStore;
}

function tradeStoreOf(stores: OrderStores): ClosedTradeStore {
  return stores.trades ?? closedTradeStore;
}

export interface OrderContext {
  marketPrice?: number | null;
  tick?: number;
  /** Asset class recorded on the closed trade, when the caller knows it. */
  market?: string | null;
}


export type PlaceResult =
  | { ok: true; order: PositionOrder; created: boolean }
  | { ok: false; errors: string[] };

/** Back-compat alias — every caller now gets lifecycle-aware badge text. */
export function badgeFor(order: PositionOrder): string {
  return badgeForState(order);
}

/**
 * Push the order's levels back onto its drawing so the chart geometry
 * matches the canonical order exactly. Times are preserved — only prices
 * move, so anchoring is untouched.
 */
function syncDrawingGeometry(stores: OrderStores, order: PositionOrder) {
  const d = stores.drawings.list().find((x) => x.id === order.drawingId);
  if (!d || d.points.length < 3) return false;
  const points = d.points.map((p) => ({ ...p }));
  points[0] = { ...points[0], price: order.entry };
  points[1] = { ...points[1], price: order.target };
  points[2] = { ...points[2], price: order.stop };
  stores.drawings.patch(order.drawingId, {
    points,
    orderId: order.id,
    orderBadge: badgeFor(order),
  });
  return true;
}

/**
 * Create a pending order, or edit the one already attached to the draft's
 * drawing. Editing preserves `id`, `createdAt` and `drawingId`; it never
 * creates a replacement order.
 */
export function placeOrEditOrder(
  stores: OrderStores,
  draft: OrderDraft,
  ctx: OrderContext = {},
): PlaceResult {
  const check = validateOrder(draft, ctx);
  if (!check.ok) return { ok: false, errors: check.errors };

  const existing = stores.orders.byDrawing(draft.drawingId);
  let order: PositionOrder;
  let created: boolean;

  if (existing) {
    order = withLevels(existing, {
      entry: draft.entry,
      stop: draft.stop,
      target: draft.target,
      orderType: draft.orderType,
    });
    order = { ...order, size: draft.size, symbol: draft.symbol, direction: draft.direction };
    stores.orders.replace(order);
    created = false;
  } else {
    order = createOrder(draft);
    stores.orders.add(order);
    created = true;
  }

  syncDrawingGeometry(stores, order);
  stores.drawings.commit();
  return { ok: true, order, created };
}

/**
 * Cancellation policy
 * -------------------
 * A cancelled pending order is **removed** from the canonical list (it is
 * first transitioned to `cancelled` so listeners observe the terminal
 * state, then dropped) and its drawing is **retired, not deleted**: the
 * geometry stays on the chart for reference but loses its order link and
 * badge, so it is no longer a tradable object.
 *
 * Idempotent: cancelling an unknown / already-cancelled id is a no-op that
 * returns `false` and touches nothing.
 */
export function cancelPendingOrder(stores: OrderStores, orderId: string): boolean {
  const order = stores.orders.byId(orderId);
  if (!order || order.status !== "pending") return false;

  stores.orders.cancel(orderId);
  stores.orders.remove(orderId);

  const d = stores.drawings.list().find((x) => x.id === order.drawingId);
  if (d) {
    stores.drawings.patch(order.drawingId, { orderId: undefined, orderBadge: undefined });
    stores.drawings.commit();
  }
  return true;
}

/** Cancel by drawing — used when the drawing itself is deleted. */
export function cancelOrderForDrawing(stores: OrderStores, drawingId: string): boolean {
  const order = stores.orders.byDrawing(drawingId);
  if (!order) return false;
  return cancelPendingOrder(stores, order.id);
}

/* ══════════════════════════════════════════════════════════════════════
   Phase 3 — execution & open-position lifecycle
   ══════════════════════════════════════════════════════════════════════

   Every state change below is atomic across BOTH stores: the canonical
   order advances through `lifecycle.transition()` and, in the same call,
   the linked drawing's badge (and geometry, when the fill price differs
   from the requested entry) is brought in line. There is no code path that
   updates one without the other.
*/

/** Badge text for any lifecycle state. Pending kept byte-identical to Phase 2. */
export function badgeForState(order: PositionOrder): string {
  const side = order.direction === "buy" ? "Long" : "Short";
  switch (order.status) {
    case "pending":
      return `${ORDER_TYPE_LABELS[order.orderType]} · Pending`;
    case "filled":
    case "open":
      return `${side} · Open`;
    case "closed":
      return `${side} · Closed`;
    case "archived":
      return `${side} · Archived`;
    default:
      return `${ORDER_TYPE_LABELS[order.orderType]} · ${order.status}`;
  }
}

/**
 * Execute a pending order.
 *
 * pending → filled → open in one atomic step. `filled` is written and
 * emitted so subscribers can observe it, then immediately advanced; the
 * order never rests in a half-executed state across a repaint.
 *
 * Duplicate-fill guard: the first transition returns `null` for anything
 * that is not exactly `pending`, so replayed ticks and concurrent callers
 * are silent no-ops.
 */
export function fillOrder(
  stores: OrderStores,
  intent: FillIntent,
  now = Date.now(),
): PositionOrder | null {
  const current = stores.orders.byId(intent.orderId);
  if (!current) return null;

  const filled = transition(current, "filled", {
    filledAt: now,
    fillPrice: intent.fillPrice,
    executionSource: intent.executionSource,
    slippage: intent.slippage,
    positionId: newPositionId(),
    // Phase 4 immutable snapshot — captured once, never rewritten. A later
    // stop drag or break-even move cannot re-base the original risk.
    requestedEntry: current.requestedEntry ?? current.entry,
    initialStop: current.initialStop ?? current.stop,
    initialTarget: current.initialTarget ?? current.target,
  }, now);
  if (!filled) return null; // already filled / cancelled — no duplicate
  stores.orders.replace(filled);

  const open = transition(filled, "open", {}, now);
  if (!open) return filled;
  // Risk/reward are re-derived against the ACTUAL fill, not the request.
  const settled = withLevels(open, { entry: intent.fillPrice }, now);
  stores.orders.replace(settled);

  syncDrawingGeometry(stores, settled);
  stores.drawings.commit();
  return settled;
}

/**
 * Write the canonical ClosedTrade for a closed order, and stamp the drawing
 * as a completed-trade visualization.
 *
 * Idempotency: keyed on `positionId` inside the store, so repeated ticks,
 * re-renders, refreshes and retries all resolve to the SAME record. Returns
 * the existing trade with `created: false` in that case.
 *
 * Missing execution facts are reported, never fabricated — an incomplete
 * order produces `{ ok: false, missing }` and no record is written.
 */
export function recordClosedTrade(
  stores: OrderStores,
  order: PositionOrder,
  opts: { market?: string | null } = {},
): { ok: true; trade: ClosedTrade; created: boolean } | { ok: false; missing: string[] } {
  const trades = tradeStoreOf(stores);

  if (order.positionId) {
    const existing = trades.byPosition(order.positionId);
    if (existing) {
      stampDrawing(stores, existing);
      return { ok: true, trade: existing, created: false };
    }
  }

  const built = buildClosedTrade(order, { market: opts.market ?? null });
  if (!built.ok) return built;

  const { trade, created } = trades.add(built.trade);
  stampDrawing(stores, trade);
  return { ok: true, trade, created };
}

/**
 * Retire the live position visualization and replace it with the completed
 * trade marker. Only canonical values (time + price) are stored, so the
 * markers stay anchored through zoom, pan, resize, refresh, fullscreen and
 * timeframe changes exactly like every other drawing anchor.
 */
function stampDrawing(stores: OrderStores, trade: ClosedTrade) {
  const d = stores.drawings.list().find((x) => x.id === trade.drawingId);
  if (!d) return;
  stores.drawings.patch(trade.drawingId, {
    orderBadge: undefined,
    closedTrade: {
      tradeId: trade.id,
      entryTime: trade.entryTime,
      entryPrice: trade.fillPrice,
      exitTime: trade.exitTime,
      exitPrice: trade.exitPrice,
      direction: trade.direction,
      netPnl: trade.netPnl,
      realizedR: trade.realizedR,
      closeReason: trade.closeReason,
      outcome: tradeResult(trade),
    },
  });
  stores.drawings.commit();
}

/**
 * Close an open position at `price`.
 * open → closed. The drawing is retired: it keeps its geometry for review
 * but loses its order link, so it is no longer a tradable object, and it is
 * re-stamped as a completed trade.
 *
 * A close request for an already-closed order does NOT create a second
 * trade — it resolves to the existing canonical record.
 */
export function closePosition(
  stores: OrderStores,
  orderId: string,
  opts: { price: number; reason?: CloseReason; market?: string | null },
  now = Date.now(),
): PositionOrder | null {
  const current = stores.orders.byId(orderId);
  if (!current || !Number.isFinite(opts.price)) return null;

  // Idempotent manual close: already closed → return the same order and make
  // sure its canonical trade exists, without touching execution facts.
  if (current.status === "closed" || current.status === "archived") {
    recordClosedTrade(stores, current, { market: opts.market });
    return current;
  }

  // A position sitting in the transient `filled` state is advanced first so
  // the close is always a legal open → closed edge.
  const live = current.status === "filled"
    ? (() => { const o = transition(current, "open", {}, now); if (o) stores.orders.replace(o); return o; })()
    : current;
  if (!live) return null;

  const { realizedPnl, realizedR } = realizedResult(live, opts.price);
  const closed = transition(live, "closed", {
    closedAt: now,
    closePrice: opts.price,
    closeReason: opts.reason ?? "manual",
    executionSource: opts.reason === "stop_loss" || opts.reason === "take_profit" ? opts.reason : "manual",
    realizedPnl,
    realizedR,
  }, now);
  if (!closed) return null;
  stores.orders.replace(closed);

  // Atomic with the close transition: the canonical trade is written in the
  // same call, so a completed position can never exist without its record.
  recordClosedTrade(stores, closed, { market: opts.market });
  return closed;
}

/**
 * One-time reconciliation for Phase 3 positions that closed before the
 * ClosedTrade record existed.
 *
 * Idempotent by construction — every write goes through `recordClosedTrade`,
 * which is keyed on `positionId`. Records missing required execution fields
 * are reported, never fabricated.
 */
export function reconcileClosedTrades(
  stores: OrderStores,
  opts: { market?: string | null } = {},
): { created: number; existing: number; skipped: { orderId: string; missing: string[] }[] } {
  const out = { created: 0, existing: 0, skipped: [] as { orderId: string; missing: string[] }[] };
  for (const order of stores.orders.list()) {
    if (order.status !== "closed" && order.status !== "archived") continue;
    const res = recordClosedTrade(stores, order, opts);
    if (!res.ok) out.skipped.push({ orderId: order.id, missing: res.missing });
    else if (res.created) out.created += 1;
    else out.existing += 1;
  }
  return out;
}


/** Apply one engine intent. Returns the resulting order, or null on no-op. */
export function applyIntent(
  stores: OrderStores,
  intent: EngineIntent,
  now = Date.now(),
): PositionOrder | null {
  return intent.kind === "fill"
    ? fillOrder(stores, intent, now)
    : closePosition(stores, intent.orderId, { price: intent.closePrice, reason: intent.reason }, now);
}

/**
 * Run one market tick through the engine and apply every resulting change.
 * Safe to call on every quote update and from multiple subscribers.
 */
export function runEngineTick(stores: OrderStores, tick: MarketTick): PositionOrder[] {
  const intents = evaluateTick(stores.orders.list(), tick);
  if (!intents.length) return [];
  const applied: PositionOrder[] = [];
  for (const intent of intents) {
    const res = applyIntent(stores, intent, tick.time ?? Date.now());
    if (res) applied.push(res);
  }
  return applied;
}

/**
 * Modify a live position's protective levels (drag stop / drag target, or
 * the break-even button). The entry of an open position is immutable — it
 * is a historical fact — so any attempt to move it is ignored and the
 * drawing is snapped back to the fill price.
 */
export function updatePositionLevels(
  stores: OrderStores,
  orderId: string,
  levels: { stop?: number; target?: number },
  now = Date.now(),
): PositionOrder | null {
  const order = stores.orders.byId(orderId);
  if (!order || !isLive(order.status)) return null;

  const stop = Number.isFinite(levels.stop ?? NaN) ? (levels.stop as number) : order.stop;
  const target = Number.isFinite(levels.target ?? NaN) ? (levels.target as number) : order.target;
  if (stop === order.stop && target === order.target) return order;

  const next = withLevels(order, { stop, target, entry: order.fillPrice ?? order.entry }, now);
  stores.orders.replace(next);
  syncDrawingGeometry(stores, next);
  stores.drawings.commit();
  return next;
}

/**
 * Break-even: move the stop to the fill price. Rejected when price has not
 * yet moved in the trader's favour, because that would place the stop on
 * the wrong side of the market and trigger an instant exit.
 */
export function moveStopToBreakEven(
  stores: OrderStores,
  orderId: string,
  marketPrice?: number | null,
  now = Date.now(),
): { ok: true; order: PositionOrder } | { ok: false; error: string } {
  const order = stores.orders.byId(orderId);
  if (!order || !isLive(order.status)) return { ok: false, error: "Position is not open." };

  const fill = order.fillPrice ?? order.entry;
  if (order.stop === fill) return { ok: false, error: "Stop is already at break-even." };

  if (Number.isFinite(marketPrice ?? NaN)) {
    const price = marketPrice as number;
    const inProfit = order.direction === "buy" ? price > fill : price < fill;
    if (!inProfit) {
      return { ok: false, error: "Move into profit before setting break-even." };
    }
  }

  const next = updatePositionLevels(stores, orderId, { stop: fill }, now);
  return next ? { ok: true, order: next } : { ok: false, error: "Could not move the stop." };
}

/**
 * Archive a closed (or cancelled) order — removes it from the working set
 * while keeping the transition legal and observable.
 */
export function archiveOrder(stores: OrderStores, orderId: string, now = Date.now()): boolean {
  const order = stores.orders.byId(orderId);
  if (!order) return false;
  const archived = transition(order, "archived", { archivedAt: now }, now);
  if (!archived) return false;
  stores.orders.replace(archived);
  stores.orders.remove(orderId);
  const d = stores.drawings.list().find((x) => x.id === archived.drawingId);
  if (d) {
    stores.drawings.patch(archived.drawingId, { orderId: undefined, orderBadge: undefined });
    stores.drawings.commit();
  }
  return true;
}

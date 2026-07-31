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
import {
  ORDER_TYPE_LABELS, createOrder, validateOrder, withLevels,
  type OrderDraft, type PositionOrder,
} from "./model";

export interface OrderStores {
  drawings: DrawingStore;
  orders: PositionOrderStore;
}

export interface OrderContext {
  marketPrice?: number | null;
  tick?: number;
}

export type PlaceResult =
  | { ok: true; order: PositionOrder; created: boolean }
  | { ok: false; errors: string[] };

export function badgeFor(order: PositionOrder): string {
  return `${ORDER_TYPE_LABELS[order.orderType]} · ${order.status === "pending" ? "Pending" : order.status}`;
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

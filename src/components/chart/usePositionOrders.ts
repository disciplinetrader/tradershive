/**
 * Position Tool → pending order controller (Phase 2).
 *
 * Bridges the drawing layer and the order store:
 *   · a completed Position Tool opens a confirmation draft
 *   · Confirm creates a canonical pending order and badges the drawing
 *   · the drawing stays fully editable — dragging a level re-derives the
 *     order's entry / stop / target, so the two can never diverge
 *   · deleting the drawing cancels its pending order (no orphans)
 *
 * Nothing here executes an order; orders are local Paper Trading objects.
 */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { DrawingStore } from "@/lib/chart/drawings/store";
import type { Drawing } from "@/lib/chart/drawings/types";
import { isPositionKind } from "@/lib/chart/drawings/types";
import { tickFromPrecision } from "@/lib/chart/drawings/types";
import { positionOrderStore } from "@/lib/chart/orders/store";
import { trace } from "@/lib/chart/orders/debug";
import {
  ORDER_TYPE_LABELS, createOrder, draftFromDrawing, inferOrderType, validateOrder, withLevels,
  type OrderDraft, type OrderType, type PositionOrder,
} from "@/lib/chart/orders/model";

interface Options {
  store: DrawingStore;
  symbol: string;
  marketPrice?: number | null;
  pricePrecision?: number;
  riskBudget?: number;
}

function badgeFor(order: PositionOrder) {
  return `${ORDER_TYPE_LABELS[order.orderType]} · ${order.status === "pending" ? "Pending" : order.status}`;
}

export function usePositionOrders({
  store, symbol, marketPrice, pricePrecision = 4, riskBudget,
}: Options) {
  const tick = tickFromPrecision(pricePrecision);

  const orders = useSyncExternalStore(
    (cb) => positionOrderStore.subscribe(cb),
    () => positionOrderStore.list(),
    () => positionOrderStore.list(),
  );

  const drawings = useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.list(),
    () => store.list(),
  );

  const [draft, setDraft] = useState<OrderDraft | null>(null);

  // Orders are scoped per symbol, exactly like drawings. `setScope` hydrates
  // the new scope itself and refuses to flush an un-hydrated (empty) list, so
  // a single effect covers both first mount and later symbol changes.
  useEffect(() => { positionOrderStore.setScope(symbol); }, [symbol]);


  /** Open the confirmation panel for a freshly drawn position. */
  const openDraft = useCallback((d: Drawing) => {
    if (!isPositionKind(d.kind)) return;
    const next = draftFromDrawing(d, { symbol, marketPrice, tick, riskBudget });
    if (next) setDraft(next);
  }, [symbol, marketPrice, tick, riskBudget]);

  /** Reopen the ticket for an existing drawing (place or edit its order). */
  const openDraftForId = useCallback((id: string) => {
    const d = store.list().find((x) => x.id === id);
    if (!d) return;
    const next = draftFromDrawing(d, { symbol, marketPrice, tick, riskBudget });
    if (!next) return;
    const existing = positionOrderStore.byDrawing(id);
    setDraft(existing ? { ...next, orderType: existing.orderType } : next);
  }, [store, symbol, marketPrice, tick, riskBudget]);

  const closeDraft = useCallback(() => setDraft(null), []);

  const inferredType: OrderType | null = useMemo(
    () => (draft ? inferOrderType(draft.direction, draft.entry, marketPrice, tick) : null),
    [draft, marketPrice, tick],
  );

  /** Confirm — create the pending order and badge its drawing. */
  const confirmDraft = useCallback((d: OrderDraft): PositionOrder | null => {
    const check = validateOrder(d, { marketPrice, tick });
    if (!check.ok) return null;
    const order = createOrder(d);
    positionOrderStore.add(order);
    const target = store.list().find((x) => x.id === d.drawingId);
    if (target) {
      store.patch(d.drawingId, { orderId: order.id, orderBadge: badgeFor(order) });
      store.commit();
    }
    setDraft(null);
    return order;
  }, [store, marketPrice, tick]);

  /** Cancel a pending order; the drawing stays on the chart, un-badged. */
  const cancelOrder = useCallback((orderId: string) => {
    const order = positionOrderStore.byId(orderId);
    positionOrderStore.cancel(orderId);
    positionOrderStore.remove(orderId);
    if (order) {
      const target = store.list().find((x) => x.id === order.drawingId);
      if (target) {
        store.patch(order.drawingId, { orderId: undefined, orderBadge: undefined });
        store.commit();
      }
    }
  }, [store]);

  /** Manual order-type change on a pending order. */
  const setOrderType = useCallback((orderId: string, orderType: OrderType) => {
    const order = positionOrderStore.byId(orderId);
    if (!order) return;
    const next = withLevels(order, { orderType });
    positionOrderStore.replace(next);
    store.patch(order.drawingId, { orderBadge: badgeFor(next) });
    store.commit();
  }, [store]);

  // Keep pending orders in lockstep with their drawing after edits/drags,
  // and drop orders whose drawing was deleted.
  useEffect(() => {
    // Explicit gate: both stores must be hydrated for the *same* scope before
    // reconciliation may delete anything. Hydration is never inferred from
    // list length — an empty list is a valid hydrated state.
    const ready =
      store.hydration() === "hydrated" &&
      positionOrderStore.hydration() === "hydrated" &&
      store.scopeValue() === symbol &&
      positionOrderStore.scopeValue() === symbol;
    if (!ready) {
      trace({
        op: "reconcile:gated", source: "usePositionOrders", scope: symbol,
        reason: `drawings=${store.hydration()}/${store.scopeValue()} orders=${positionOrderStore.hydration()}/${positionOrderStore.scopeValue()}`,
      });
      return;
    }
    // Read the live store, never the React snapshot: on reload the snapshot
    // captured before hydration is an empty list, and reconciling against it
    // would delete every persisted order. `drawings` stays in the dep list
    // purely as the change trigger.
    const live = store.list();
    const ids = new Set(live.map((d) => d.id));
    positionOrderStore.reconcile(ids, "usePositionOrders");

    for (const order of positionOrderStore.pending()) {
      const d = live.find((x) => x.id === order.drawingId);
      if (!d || d.points.length < 3) continue;
      const entry = d.points[0].price;
      const target = d.points[1].price;
      const stop = d.points[2].price;
      if (entry === order.entry && target === order.target && stop === order.stop) continue;
      positionOrderStore.replace(withLevels(order, { entry, stop, target }));
    }
  }, [drawings, store, symbol]);


  const pending = useMemo(() => orders.filter((o) => o.status === "pending"), [orders]);

  return {
    draft, inferredType, openDraft, openDraftForId, closeDraft, confirmDraft,
    cancelOrder, setOrderType, pendingOrders: pending, tick,
  };
}

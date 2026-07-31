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
  draftFromDrawing, inferOrderType, withLevels,
  type OrderDraft, type OrderType, type PositionOrder,
} from "@/lib/chart/orders/model";
import { badgeFor, cancelPendingOrder, placeOrEditOrder } from "@/lib/chart/orders/service";

interface Options {
  store: DrawingStore;
  symbol: string;
  marketPrice?: number | null;
  pricePrecision?: number;
  riskBudget?: number;
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
  const [draftMode, setDraftMode] = useState<"create" | "edit">("create");

  // Orders are scoped per symbol, exactly like drawings. `setScope` hydrates
  // the new scope itself and refuses to flush an un-hydrated (empty) list, so
  // a single effect covers both first mount and later symbol changes.
  useEffect(() => { positionOrderStore.setScope(symbol); }, [symbol]);


  /** Open the confirmation panel for a freshly drawn position. */
  const openDraft = useCallback((d: Drawing) => {
    if (!isPositionKind(d.kind)) return;
    const next = draftFromDrawing(d, { symbol, marketPrice, tick, riskBudget });
    if (next) { setDraftMode("create"); setDraft(next); }
  }, [symbol, marketPrice, tick, riskBudget]);

  /** Reopen the ticket for an existing drawing (place or edit its order). */
  const openDraftForId = useCallback((id: string) => {
    const d = store.list().find((x) => x.id === id);
    if (!d) return;
    const next = draftFromDrawing(d, { symbol, marketPrice, tick, riskBudget });
    if (!next) return;
    const existing = positionOrderStore.byDrawing(id);
    setDraftMode(existing ? "edit" : "create");
    setDraft(existing
      ? { ...next, orderType: existing.orderType, entry: existing.entry, stop: existing.stop, target: existing.target }
      : next);
  }, [store, symbol, marketPrice, tick, riskBudget]);

  const closeDraft = useCallback(() => setDraft(null), []);

  const inferredType: OrderType | null = useMemo(
    () => (draft ? inferOrderType(draft.direction, draft.entry, marketPrice, tick) : null),
    [draft, marketPrice, tick],
  );

  /** Confirm — create the pending order, or update it in place when editing. */
  const confirmDraft = useCallback((d: OrderDraft): PositionOrder | null => {
    const res = placeOrEditOrder({ drawings: store, orders: positionOrderStore }, d, { marketPrice, tick });
    if (!res.ok) return null;
    setDraft(null);
    return res.order;
  }, [store, marketPrice, tick]);

  /**
   * Cancel a pending order. Atomic: the canonical order is retired and the
   * drawing is un-badged in one service call, so the two cannot diverge.
   */
  const cancelOrder = useCallback((orderId: string) => {
    return cancelPendingOrder({ drawings: store, orders: positionOrderStore }, orderId);
  }, [store]);

  /** Open the edit ticket straight from an order id (no right-click needed). */
  const editOrder = useCallback((orderId: string) => {
    const order = positionOrderStore.byId(orderId);
    if (!order) return;
    openDraftForId(order.drawingId);
  }, [openDraftForId]);

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
    trace({ op: "reconcile:run", source: "usePositionOrders", scope: symbol, prev: drawings.length, next: live.length, reason: "live vs snapshot" });
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
    draft, draftMode, inferredType, openDraft, openDraftForId, closeDraft, confirmDraft,
    cancelOrder, editOrder, setOrderType, pendingOrders: pending, tick,
  };
}

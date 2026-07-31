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

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { DrawingStore } from "@/lib/chart/drawings/store";
import type { Drawing } from "@/lib/chart/drawings/types";
import { isPositionKind } from "@/lib/chart/drawings/types";
import { tickFromPrecision } from "@/lib/chart/drawings/types";
import { positionOrderStore } from "@/lib/chart/orders/store";
import { closedTradeStore } from "@/lib/chart/orders/trade-store";
import { supabaseTradeRemote } from "@/lib/chart/orders/trade-sync";

import { matchesFilter, type ClosedTrade, type TradeFilter } from "@/lib/chart/orders/closed-trade";
import { addTradeToJournal } from "@/lib/chart/orders/journal-link";
import { trace } from "@/lib/chart/orders/debug";
import { isLive } from "@/lib/chart/orders/lifecycle";
import {
  draftFromDrawing, inferOrderType, withLevels,
  type OrderDraft, type OrderType, type PositionOrder,
} from "@/lib/chart/orders/model";
import {
  archiveOrder, badgeFor, cancelPendingOrder, closePosition, moveStopToBreakEven,
  placeOrEditOrder, reconcileClosedTrades, runEngineTick, updatePositionLevels,
} from "@/lib/chart/orders/service";

interface Options {
  store: DrawingStore;
  symbol: string;
  marketPrice?: number | null;
  pricePrecision?: number;
  riskBudget?: number;
  /** Asset class recorded on closed trades, when the caller knows it. */
  market?: string | null;
  /** Fired once, when a pending order becomes a live position. */
  onFill?: (order: PositionOrder) => void;
  /** Fired once, when a live position closes (manual, stop or target). */
  onClose?: (order: PositionOrder) => void;
}

export function usePositionOrders({
  store, symbol, marketPrice, pricePrecision = 4, riskBudget, market, onFill, onClose,
}: Options) {
  const tick = tickFromPrecision(pricePrecision);
  const stores = useMemo(
    () => ({ drawings: store, orders: positionOrderStore, trades: closedTradeStore }),
    [store],
  );


  const orders = useSyncExternalStore(
    (cb) => positionOrderStore.subscribe(cb),
    () => positionOrderStore.list(),
    () => positionOrderStore.list(),
  );

  const trades = useSyncExternalStore(
    (cb) => closedTradeStore.subscribe(cb),
    () => closedTradeStore.list(),
    () => closedTradeStore.list(),
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
  // Closed trades additionally mirror into the backend so the tape survives a
  // cleared cache or a new device (browser-only; RLS scopes rows to the user).
  useEffect(() => {
    positionOrderStore.setScope(symbol);
    closedTradeStore.attachRemote(supabaseTradeRemote);
    closedTradeStore.setScope(symbol);
  }, [symbol]);


  // One-time reconciliation per scope: Phase 3 positions that closed before
  // the canonical trade record existed get exactly one record each. Keyed on
  // `positionId` inside the store, so re-running is a no-op.
  const reconciled = useRef<string | null>(null);
  useEffect(() => {
    if (reconciled.current === symbol) return;
    if (positionOrderStore.hydration() !== "hydrated") return;
    if (closedTradeStore.hydration() !== "hydrated") return;
    if (positionOrderStore.scopeValue() !== symbol) return;
    reconciled.current = symbol;
    const res = reconcileClosedTrades(stores, { market });
    if (res.created || res.skipped.length) {
      trace({
        op: "trades:reconcile", source: "usePositionOrders", scope: symbol,
        next: res.created,
        reason: `existing=${res.existing} skipped=${res.skipped.length}`,
      });
    }
  }, [symbol, stores, market, orders]);



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

    // Live positions: dragging the Stop or Target handle modifies the
    // position. The Entry handle is inert once filled — the fill price is a
    // historical fact — so the drawing is snapped back to it.
    for (const order of positionOrderStore.positions()) {
      const d = live.find((x) => x.id === order.drawingId);
      if (!d || d.points.length < 3) continue;
      const target = d.points[1].price;
      const stop = d.points[2].price;
      const fill = order.fillPrice ?? order.entry;
      const drifted = d.points[0].price !== fill;
      if (stop === order.stop && target === order.target && !drifted) continue;
      updatePositionLevels(stores, order.id, { stop, target });
    }
  }, [drawings, store, symbol, stores]);

  // ── Execution engine ───────────────────────────────────────────────────
  // One tick per market-price change. The engine itself is pure and the
  // service transitions are guarded by the state machine, so re-renders,
  // repeated identical prices and concurrent mounts cannot double-fill.
  const lastTick = useRef<number | null>(null);
  useEffect(() => {
    if (!Number.isFinite(marketPrice ?? NaN)) return;
    const price = marketPrice as number;
    if (price <= 0) return;
    if (positionOrderStore.hydration() !== "hydrated") return;
    if (positionOrderStore.scopeValue() !== symbol) return;
    if (lastTick.current === price) return;
    lastTick.current = price;

    const applied = runEngineTick(stores, { price });
    for (const o of applied) {
      if (o.status === "open") onFill?.(o);
      else if (o.status === "closed") onClose?.(o);
    }
  }, [marketPrice, symbol, stores, onFill, onClose]);

  /** Market-exit an open position at the current price. */
  const closeAtMarket = useCallback((orderId: string) => {
    if (!Number.isFinite(marketPrice ?? NaN)) return null;
    return closePosition(stores, orderId, { price: marketPrice as number, reason: "manual", market });
  }, [stores, marketPrice, market]);

  /** Move the stop to the fill price. */
  const breakEven = useCallback((orderId: string) => {
    return moveStopToBreakEven(stores, orderId, marketPrice);
  }, [stores, marketPrice]);

  /** Remove a closed position from the working set. */
  const archive = useCallback((orderId: string) => archiveOrder(stores, orderId), [stores]);

  // ── Closed trades (Phase 4) ────────────────────────────────────────────
  const [tradeFilter, setTradeFilter] = useState<TradeFilter>("all");

  const closedTrades = useMemo(
    () => [...trades].sort((a, b) => b.closedAt - a.closedAt),
    [trades],
  );

  const visibleTrades = useMemo(
    () => closedTrades.filter((t) => matchesFilter(t, tradeFilter)),
    [closedTrades, tradeFilter],
  );

  /**
   * Archiving keeps the record — it only leaves the default view. Journal
   * links and analytics inputs are retained.
   */
  const archiveTrade = useCallback(
    (tradeId: string, archived = true) => closedTradeStore.setArchived(tradeId, archived),
    [],
  );

  /** Idempotent: a repeated call resolves to the existing journal entry. */
  const addToJournal = useCallback(
    (tradeId: string, userId: string) => addTradeToJournal(closedTradeStore, tradeId, userId),
    [],
  );

  const pending = useMemo(() => orders.filter((o) => o.status === "pending"), [orders]);
  const openPositions = useMemo(() => orders.filter((o) => isLive(o.status)), [orders]);
  const closedPositions = useMemo(() => orders.filter((o) => o.status === "closed"), [orders]);

  return {
    draft, draftMode, inferredType, openDraft, openDraftForId, closeDraft, confirmDraft,
    cancelOrder, editOrder, setOrderType, pendingOrders: pending, tick,
    openPositions, closedPositions, closeAtMarket, breakEven, archive,
    closedTrades: closedTrades as ClosedTrade[], visibleTrades, tradeFilter, setTradeFilter,
    archiveTrade, addToJournal,
  };
}


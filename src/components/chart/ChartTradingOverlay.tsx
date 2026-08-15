import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ChartAdapter, ExternalMarker } from "@/lib/chart/adapter";
import { usePaper } from "@/components/paper-trading/context";
import { findSymbol } from "@/lib/paper-trading/symbols";
import { fmtPrice } from "@/lib/trading/plan-math";
import { validateStops, pnl as computePnl } from "@/lib/paper-trading/calculations";
import { chartPersist } from "@/lib/chart-trading/persist";
import { computeChartMetrics } from "@/lib/chart-trading/math";
import type { ChartDraft, ChartLine, DraftOrderType } from "@/lib/chart-trading/types";
import { RiskRewardBox } from "./RiskRewardBox";
import { DraftOrderPopover } from "./DraftOrderPopover";
import { PositionRibbon } from "./PositionRibbon";
import { PendingOrderRibbon } from "./PendingOrderRibbon";
import { ChartAccountChip } from "./ChartAccountChip";
import { cn } from "@/lib/utils";

interface Props {
  adapter: ChartAdapter | null;
  symbol: string;
  /** Re-projection tick — pass anything that changes when geometry shifts. */
  tick?: number | string;
  /** Latest close price from the chart (for live P/L + market orders). */
  livePrice: number | null;
}

type OpenTrade = {
  id: string; account_id: string; symbol: string; direction: "long" | "short";
  entry_price: number; stop_loss: number | null; take_profit: number | null;
  lot_size: number; status: "open" | "closed" | "cancelled";
};

type PendingRow = {
  id: string; account_id: string; symbol: string; direction: "long" | "short";
  order_type: "limit" | "stop" | "stop_limit";
  trigger_price: number; limit_price: number | null;
  stop_loss: number | null; take_profit: number | null;
  lot_size: number; status: "pending" | "filled" | "cancelled" | "expired";
};

type ClosedRow = {
  id: string; direction: "long" | "short";
  entry_price: number; exit_price: number | null;
  opened_at: string; closed_at: string | null;
};

const COLORS = {
  entry: "#3b82f6",
  sl: "#ef4444",
  tp: "#22c55e",
  trailing: "#a855f7",
  pending: "#eab308",
  draft: "#0ea5e9",
};

/**
 * The chart trading command center.
 *
 * Renders every trade artifact on top of the chart:
 *  - open positions with SL/TP + action ribbon
 *  - pending orders with drag + cancel
 *  - a draft order being placed from the chart (Alt-click)
 *  - closed-trade entry/exit markers via adapter.setExternalMarkers
 *
 * Writes only through `chartPersist` (paper-trading server fns) so the
 * Trading Engine, Analytics, Journal and Stats pipelines all stay
 * consistent. Never touches Yahoo Finance or the Trading Workspace layout.
 */
export function ChartTradingOverlay({ adapter, symbol, tick, livePrice }: Props) {
  const { account, accountId } = usePaper();
  const qc = useQueryClient();
  const [showAll, setShowAll] = useState(false);
  const [, force] = useReducer((n: number) => n + 1, 0);
  const hostRef = useRef<HTMLDivElement | null>(null);

  const [positions, setPositions] = useState<OpenTrade[]>([]);
  const [orders, setOrders] = useState<PendingRow[]>([]);
  const [closed, setClosed] = useState<ClosedRow[]>([]);

  // Draft order UX ----------------------------------------------------------
  const [draft, setDraft] = useState<ChartDraft | null>(null);
  const [draftPopover, setDraftPopover] = useState<{ x: number; y: number; price: number } | null>(null);

  // Drag state --------------------------------------------------------------
  const dragRef = useRef<{ id: string; price: number } | null>(null);
  const [dragging, setDragging] = useState<{ id: string; price: number } | null>(null);

  const openTradeFn = useServerFn(chartPersist.openTrade);
  const modifyTradeFn = useServerFn(chartPersist.modifyTrade);
  const closeTradeFn = useServerFn(chartPersist.closeTrade);
  const placeOrderFn = useServerFn(chartPersist.placeOrder);
  const cancelOrderFn = useServerFn(chartPersist.cancelOrder);
  const modifyOrderFn = useServerFn(chartPersist.modifyOrder);
  const partialCloseFn = useServerFn(chartPersist.partialCloseTrade);
  const breakEvenFn = useServerFn(chartPersist.moveToBreakEven);

  const sym = useMemo(() => findSymbol(symbol), [symbol]);

  // ---- Data load + realtime -----------------------------------------------
  const reload = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setPositions([]); setOrders([]); setClosed([]); return; }
    let posQ = supabase.from("paper_trades")
      .select("id,account_id,symbol,direction,entry_price,stop_loss,take_profit,lot_size,status")
      .eq("user_id", u.user.id).eq("symbol", symbol).eq("status", "open").is("deleted_at", null);
    let ordQ = supabase.from("paper_orders")
      .select("id,account_id,symbol,direction,order_type,trigger_price,limit_price,stop_loss,take_profit,lot_size,status")
      .eq("user_id", u.user.id).eq("symbol", symbol).eq("status", "pending");
    let clsQ = supabase.from("paper_trades")
      .select("id,direction,entry_price,exit_price,opened_at,closed_at")
      .eq("user_id", u.user.id).eq("symbol", symbol).eq("status", "closed")
      .is("deleted_at", null).order("closed_at", { ascending: false }).limit(50);
    if (!showAll && accountId) {
      posQ = posQ.eq("account_id", accountId);
      ordQ = ordQ.eq("account_id", accountId);
      clsQ = clsQ.eq("account_id", accountId);
    }
    const [pos, ord, cls] = await Promise.all([posQ, ordQ, clsQ]);
    setPositions((pos.data as OpenTrade[] | null) ?? []);
    setOrders((ord.data as PendingRow[] | null) ?? []);
    setClosed((cls.data as ClosedRow[] | null) ?? []);
  }, [symbol, accountId, showAll]);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    const ch = supabase.channel(`chart-overlay:${symbol}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "paper_trades", filter: `symbol=eq.${symbol}` }, () => void reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "paper_orders", filter: `symbol=eq.${symbol}` }, () => void reload())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [symbol, reload]);

  // ---- External markers for closed trades ---------------------------------
  useEffect(() => {
    if (!adapter) return;
    const markers: ExternalMarker[] = [];
    for (const t of closed) {
      const open = new Date(t.opened_at).getTime();
      const close = t.closed_at ? new Date(t.closed_at).getTime() : null;
      markers.push({
        timeMs: open,
        position: t.direction === "long" ? "belowBar" : "aboveBar",
        shape: t.direction === "long" ? "arrowUp" : "arrowDown",
        color: t.direction === "long" ? COLORS.tp : COLORS.sl,
        text: `IN ${fmtPrice(sym ?? symbol, Number(t.entry_price))}`,
      });
      if (close && t.exit_price != null) {
        markers.push({
          timeMs: close,
          position: t.direction === "long" ? "aboveBar" : "belowBar",
          shape: t.direction === "long" ? "arrowDown" : "arrowUp",
          color: "#94a3b8",
          text: `OUT ${fmtPrice(sym ?? symbol, Number(t.exit_price))}`,
        });
      }
    }
    adapter.setExternalMarkers(markers);
  }, [adapter, closed]);

  // ---- Reproject on resize / tick -----------------------------------------
  useEffect(() => {
    if (!hostRef.current) return;
    const ro = new ResizeObserver(() => force());
    ro.observe(hostRef.current);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { force(); }, [tick, positions, orders, dragging]);

  // ---- Build lines from state --------------------------------------------
  const lines = useMemo<ChartLine[]>(() => {
    const out: ChartLine[] = [];
    for (const t of positions) {
      out.push({ id: `t-${t.id}-entry`, kind: "position-entry", price: Number(t.entry_price), label: `${t.direction.toUpperCase()} ${t.lot_size}`, color: t.direction === "long" ? COLORS.tp : COLORS.sl, editable: false });
      if (t.stop_loss != null) out.push({ id: `t-${t.id}-sl`, kind: "position-sl", price: Number(t.stop_loss), label: "SL", color: COLORS.sl, editable: true });
      if (t.take_profit != null) out.push({ id: `t-${t.id}-tp`, kind: "position-tp", price: Number(t.take_profit), label: "TP", color: COLORS.tp, editable: true });
    }
    for (const o of orders) {
      out.push({ id: `o-${o.id}-trigger`, kind: "pending-trigger", price: Number(o.trigger_price), label: `${o.direction.toUpperCase()} ${o.order_type}`, color: COLORS.pending, editable: true, dashed: true });
      if (o.limit_price != null) out.push({ id: `o-${o.id}-limit`, kind: "pending-limit", price: Number(o.limit_price), label: "LIMIT", color: COLORS.pending, editable: true, dashed: true });
      if (o.stop_loss != null) out.push({ id: `o-${o.id}-sl`, kind: "pending-sl", price: Number(o.stop_loss), label: "SL", color: COLORS.sl, editable: true, dashed: true });
      if (o.take_profit != null) out.push({ id: `o-${o.id}-tp`, kind: "pending-tp", price: Number(o.take_profit), label: "TP", color: COLORS.tp, editable: true, dashed: true });
    }
    if (draft) {
      out.push({ id: "d-entry", kind: "draft-entry", price: draft.entry, label: `DRAFT ${draft.side.toUpperCase()}`, color: COLORS.draft, editable: true, dashed: true });
      if (draft.sl != null) out.push({ id: "d-sl", kind: "draft-sl", price: draft.sl, label: "SL", color: COLORS.sl, editable: true, dashed: true });
      if (draft.tp != null) out.push({ id: "d-tp", kind: "draft-tp", price: draft.tp, label: "TP", color: COLORS.tp, editable: true, dashed: true });
    }
    // Apply live drag override so lines follow the pointer smoothly.
    if (dragging) return out.map((l) => (l.id === dragging.id ? { ...l, price: dragging.price } : l));
    return out;
  }, [positions, orders, draft, dragging]);

  // ---- Drag lifecycle -----------------------------------------------------
  const startDrag = useCallback((id: string, currentPrice: number) => {
    dragRef.current = { id, price: currentPrice };
    setDragging({ id, price: currentPrice });

    function move(e: PointerEvent) {
      if (!dragRef.current || !adapter || !hostRef.current) return;
      const rect = hostRef.current.getBoundingClientRect();
      const price = adapter.yToPrice(e.clientY - rect.top);
      if (price == null || !Number.isFinite(price)) return;
      dragRef.current.price = price;
      setDragging({ id: dragRef.current.id, price });
    }
    async function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const state = dragRef.current;
      dragRef.current = null;
      setDragging(null);
      if (!state) return;
      await commitDrag(state.id, state.price);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter]);

  const commitDrag = useCallback(async (id: string, price: number) => {
    // Draft lines — local state only.
    if (id.startsWith("d-")) {
      setDraft((d) => {
        if (!d) return d;
        if (id === "d-entry") return { ...d, entry: price };
        if (id === "d-sl") return { ...d, sl: price };
        if (id === "d-tp") return { ...d, tp: price };
        return d;
      });
      return;
    }
    // Positions.
    if (id.startsWith("t-")) {
      const [, tid, kind] = id.split(/-(.+)-(entry|sl|tp)$/);
      const trade = positions.find((p) => p.id === tid);
      if (!trade || kind === "entry") return;
      // Validate side-aware stop/tp direction.
      const sl = kind === "sl" ? price : trade.stop_loss;
      const tp = kind === "tp" ? price : trade.take_profit;
      const err = validateStops(trade.direction, Number(trade.entry_price), sl, tp);
      if (err) { toast.error(err); void reload(); return; }
      try {
        await modifyTradeFn({ data: { id: tid, ...(kind === "sl" ? { stop_loss: price } : { take_profit: price }) } });
        toast.success(`${kind.toUpperCase()} moved to ${fmtPrice(sym ?? symbol, price)}`);
        qc.invalidateQueries({ queryKey: ["paper"] });
      } catch (e: any) {
        toast.error(e?.message ?? "Update failed");
        void reload();
      }
      return;
    }
    // Pending orders.
    if (id.startsWith("o-")) {
      const [, oid, kind] = id.split(/-(.+)-(trigger|limit|sl|tp)$/);
      const ord = orders.find((o) => o.id === oid);
      if (!ord) return;
      const patch =
        kind === "trigger" ? { trigger_price: price } :
        kind === "limit" ? { limit_price: price } :
        kind === "sl" ? { stop_loss: price } :
        { take_profit: price };
      try {
        await modifyOrderFn({ data: { id: oid, ...patch } });
        toast.success(`${kind.toUpperCase()} moved to ${fmtPrice(sym ?? symbol, price)}`);
      } catch (e: any) {
        toast.error(e?.message ?? "Order update failed");
        void reload();
      }
    }
  }, [positions, orders, modifyTradeFn, modifyOrderFn, reload, qc]);

  // ---- Chart click → draft popover ---------------------------------------
  const onHostPointerDown = useCallback((e: React.PointerEvent) => {
    // Only respond to Alt-click (or right-click) on empty chart area so
    // ordinary panning / drawing still works.
    if (!(e.altKey || e.button === 2) || !adapter || !hostRef.current) return;
    const rect = hostRef.current.getBoundingClientRect();
    const price = adapter.yToPrice(e.clientY - rect.top);
    if (price == null) return;
    setDraftPopover({ x: e.clientX - rect.left, y: e.clientY - rect.top, price });
  }, [adapter]);

  const dismissPopover = useCallback(() => setDraftPopover(null), []);

  const startDraft = useCallback((orderType: DraftOrderType, lot: number, entry: number) => {
    const side: "long" | "short" = orderType.startsWith("buy") ? "long" : "short";
    const isMarket = orderType.endsWith("market");
    const px = isMarket && livePrice ? livePrice : entry;
    // Seed SL/TP at 1R = 20 pips (symbol-appropriate) with 2R target.
    const pipDist = 20 * (sym?.pipSize ?? 0.0001);
    const sl = side === "long" ? px - pipDist : px + pipDist;
    const tp = side === "long" ? px + pipDist * 2 : px - pipDist * 2;
    setDraft({ orderType, side, entry: px, sl, tp, lot });
    setDraftPopover(null);
  }, [livePrice, sym]);

  const confirmDraft = useCallback(async () => {
    if (!draft || !sym || !accountId) return;
    const err = validateStops(draft.side, draft.entry, draft.sl, draft.tp);
    if (err) return toast.error(err);
    try {
      const isMarket = draft.orderType.endsWith("market");
      if (isMarket) {
        await openTradeFn({ data: {
          account_id: accountId, symbol, market: sym.market, direction: draft.side,
          order_type: "market", lot_size: draft.lot,
          entry_price: draft.entry, stop_loss: draft.sl, take_profit: draft.tp,
          commission: 0, swap: 0,
        }});
        toast.success(`${draft.side.toUpperCase()} ${draft.lot} @ market`);
      } else {
        const orderType = draft.orderType.includes("limit") ? "limit" : "stop";
        await placeOrderFn({ data: {
          account_id: accountId, symbol, market: sym.market, direction: draft.side,
          order_type: orderType, lot_size: draft.lot, trigger_price: draft.entry,
          stop_loss: draft.sl, take_profit: draft.tp,
        }});
        toast.success(`${draft.orderType.replace("_", " ")} placed`);
      }
      setDraft(null);
      void reload();
    } catch (e: any) {
      toast.error(e?.message ?? "Order failed");
    }
  }, [draft, sym, accountId, symbol, openTradeFn, placeOrderFn, reload]);

  // ---- Position quick actions --------------------------------------------
  const closePosition = useCallback(async (id: string) => {
    if (livePrice == null) return toast.error("Waiting for live price");
    try {
      await closeTradeFn({ data: { id, exit_price: livePrice, close_reason: "manual" } });
      toast.success("Position closed");
      void reload();
    } catch (e: any) { toast.error(e?.message ?? "Close failed"); }
  }, [livePrice, closeTradeFn, reload]);

  const partialClose = useCallback(async (id: string, fraction: number) => {
    if (livePrice == null) return toast.error("Waiting for live price");
    try {
      await partialCloseFn({ data: { id, fraction, exit_price: livePrice } });
      toast.success(`Closed ${Math.round(fraction * 100)}%`);
      void reload();
    } catch (e: any) { toast.error(e?.message ?? "Partial close failed"); }
  }, [livePrice, partialCloseFn, reload]);

  const moveBE = useCallback(async (id: string) => {
    try { await breakEvenFn({ data: { id } }); toast.success("Moved to break-even"); void reload(); }
    catch (e: any) { toast.error(e?.message ?? "BE failed"); }
  }, [breakEvenFn, reload]);

  const reversePosition = useCallback(async (t: OpenTrade) => {
    if (livePrice == null || !sym) return toast.error("Waiting for live price");
    try {
      await closeTradeFn({ data: { id: t.id, exit_price: livePrice, close_reason: "manual" } });
      const opposite: "long" | "short" = t.direction === "long" ? "short" : "long";
      await openTradeFn({ data: {
        account_id: t.account_id, symbol: t.symbol, market: sym.market, direction: opposite,
        order_type: "market", lot_size: Number(t.lot_size), entry_price: livePrice,
        stop_loss: null, take_profit: null, commission: 0, swap: 0,
      }});
      toast.success("Position reversed");
      void reload();
    } catch (e: any) { toast.error(e?.message ?? "Reverse failed"); }
  }, [livePrice, sym, closeTradeFn, openTradeFn, reload]);

  const startTrailing = useCallback(async (t: OpenTrade) => {
    // No schema for server-side trailing; emulate by moving SL closer to
    // price by 10 pips of the current distance. Repeatable — each click
    // tightens the stop.
    if (livePrice == null || !sym) return;
    const currentSL = t.stop_loss != null ? Number(t.stop_loss) : Number(t.entry_price);
    const distance = Math.abs(livePrice - currentSL);
    const tighter = distance * 0.5;
    const newSL = t.direction === "long" ? livePrice - tighter : livePrice + tighter;
    const err = validateStops(t.direction, Number(t.entry_price), newSL, t.take_profit);
    if (err) return toast.error(err);
    try {
      await modifyTradeFn({ data: { id: t.id, stop_loss: newSL } });
      toast.success(`Trailing SL tightened to ${fmtPrice(sym ?? symbol, newSL)}`);
      void reload();
    } catch (e: any) { toast.error(e?.message ?? "Trailing failed"); }
  }, [livePrice, sym, modifyTradeFn, reload]);

  const duplicateOrder = useCallback(async (o: PendingRow) => {
    if (!sym) return;
    try {
      await placeOrderFn({ data: {
        account_id: o.account_id, symbol: o.symbol, market: sym.market, direction: o.direction,
        order_type: o.order_type === "stop_limit" ? "stop_limit" : (o.order_type as "limit" | "stop"),
        lot_size: Number(o.lot_size), trigger_price: Number(o.trigger_price),
        limit_price: o.limit_price != null ? Number(o.limit_price) : null,
        stop_loss: o.stop_loss != null ? Number(o.stop_loss) : null,
        take_profit: o.take_profit != null ? Number(o.take_profit) : null,
      }});
      toast.success("Order duplicated");
      void reload();
    } catch (e: any) { toast.error(e?.message ?? "Duplicate failed"); }
  }, [sym, placeOrderFn, reload]);

  const cancelPending = useCallback(async (id: string) => {
    try { await cancelOrderFn({ data: { id } }); toast.success("Order cancelled"); void reload(); }
    catch (e: any) { toast.error(e?.message ?? "Cancel failed"); }
  }, [cancelOrderFn, reload]);

  // ---- Live R/R metrics (draft or drag) -----------------------------------
  const activeMetrics = useMemo(() => {
    if (!sym || !account) return null;
    if (draft) {
      return {
        side: draft.side,
        metrics: computeChartMetrics({
          sym, side: draft.side, entry: draft.entry, sl: draft.sl, tp: draft.tp,
          lot: draft.lot, leverage: Number(account.leverage ?? 100), balance: Number(account.balance ?? 0),
        }),
      };
    }
    if (dragging && dragging.id.startsWith("t-")) {
      const [, tid, kind] = dragging.id.split(/-(.+)-(entry|sl|tp)$/);
      const trade = positions.find((p) => p.id === tid);
      if (!trade || kind === "entry") return null;
      const sl = kind === "sl" ? dragging.price : (trade.stop_loss ?? null);
      const tp = kind === "tp" ? dragging.price : (trade.take_profit ?? null);
      return {
        side: trade.direction,
        metrics: computeChartMetrics({
          sym, side: trade.direction, entry: Number(trade.entry_price), sl, tp,
          lot: Number(trade.lot_size), leverage: Number(account.leverage ?? 100), balance: Number(account.balance ?? 0),
        }),
      };
    }
    return null;
  }, [draft, dragging, positions, sym, account]);

  // Compute a live P/L per open position for the ribbon badges.
  const positionPnl = useMemo(() => {
    const map = new Map<string, { pnl: number; pct: number }>();
    if (!sym || livePrice == null) return map;
    for (const t of positions) {
      const p = computePnl(sym, t.direction, Number(t.entry_price), livePrice, Number(t.lot_size));
      const notional = Number(t.entry_price) * Number(t.lot_size) * sym.contractSize;
      const pct = notional > 0 ? (p / notional) * 100 : 0;
      map.set(t.id, { pnl: p, pct });
    }
    return map;
  }, [positions, sym, livePrice]);

  return (
    <div
      ref={hostRef}
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
      onPointerDown={onHostPointerDown}
      onContextMenu={(e) => e.preventDefault()}
      style={{ pointerEvents: draftPopover || draft ? "auto" : "none" }}
    >
      <ChartAccountChip showAll={showAll} onToggleShowAll={setShowAll} />

      {/* Order / draft lines */}
      {lines.map((l) => {
        const y = adapter?.priceToY(l.price);
        if (y == null || !Number.isFinite(y)) return null;
        return (
          <div key={l.id} className="absolute left-0 right-16 flex items-center" style={{ top: y - 10, height: 20 }}>
            <div
              className="h-px flex-1"
              style={{
                background: l.color,
                boxShadow: `0 0 6px ${l.color}`,
                backgroundImage: l.dashed ? `repeating-linear-gradient(to right, ${l.color} 0 6px, transparent 6px 12px)` : undefined,
                backgroundColor: l.dashed ? "transparent" : l.color,
              }}
            />
            <div
              className={cn(
                "pointer-events-auto ml-2 flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase text-white select-none",
                l.editable ? "cursor-ns-resize" : "cursor-default",
              )}
              style={{ background: l.color, borderColor: l.color }}
              onPointerDown={(e) => {
                if (!l.editable) return;
                e.stopPropagation();
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                startDrag(l.id, l.price);
              }}
            >
              {l.label} · {fmtPrice(sym ?? symbol, l.price)}
            </div>
          </div>
        );
      })}

      {/* Position ribbons */}
      {positions.map((t) => {
        const y = adapter?.priceToY(Number(t.entry_price));
        if (y == null) return null;
        const p = positionPnl.get(t.id) ?? { pnl: 0, pct: 0 };
        return (
          <PositionRibbon
            key={`ribbon-${t.id}`}
            top={y}
            currency={account?.currency ?? "USD"}
            data={{
              id: t.id, side: t.direction, entry: Number(t.entry_price), lot: Number(t.lot_size),
              currentPrice: livePrice, pnl: p.pnl, pnlPct: p.pct,
            }}
            onClose={() => closePosition(t.id)}
            onPartial={(f) => partialClose(t.id, f)}
            onBreakEven={() => moveBE(t.id)}
            onReverse={() => reversePosition(t)}
            onTrailing={() => startTrailing(t)}
          />
        );
      })}

      {/* Pending order ribbons */}
      {orders.map((o) => {
        const y = adapter?.priceToY(Number(o.trigger_price));
        if (y == null) return null;
        return (
          <PendingOrderRibbon
            key={`p-ribbon-${o.id}`}
            symbol={symbol}
            top={y}
            data={{ id: o.id, side: o.direction, orderType: o.order_type, trigger: Number(o.trigger_price), lot: Number(o.lot_size) }}
            onCancel={() => cancelPending(o.id)}
            onDuplicate={() => duplicateOrder(o)}
          />
        );
      })}

      {/* Draft popover */}
      {draftPopover ? (
        <DraftOrderPopover
          x={draftPopover.x}
          y={draftPopover.y}
          symbol={symbol}
          price={draftPopover.price}
          livePrice={livePrice}
          defaultLot={sym?.minLot ?? 0.01}
          onCancel={dismissPopover}
          onPlace={(type, lot) => startDraft(type, lot, draftPopover.price)}
        />
      ) : null}

      {/* Draft confirmation bar */}
      {draft ? (
        <div className="pointer-events-auto absolute bottom-3 left-3 z-30 flex items-center gap-2 rounded-md border bg-background/95 p-2 text-[11px] shadow-xl backdrop-blur">
          <span className="font-semibold uppercase">
            {draft.orderType.replace("_", " ")} · {draft.lot} lot
          </span>
          <button
            onClick={confirmDraft}
            className={cn(
              "rounded px-3 py-1 font-semibold text-white",
              draft.side === "long" ? "bg-success" : "bg-danger",
            )}
          >
            Confirm
          </button>
          <button onClick={() => setDraft(null)} className="rounded border px-2 py-1 hover:bg-muted">
            Cancel
          </button>
        </div>
      ) : null}

      {/* Risk/Reward panel */}
      {activeMetrics ? (
        <RiskRewardBox
          side={activeMetrics.side}
          metrics={activeMetrics.metrics}
          currency={account?.currency ?? "USD"}
          className="left-3 top-14"
        />
      ) : null}

      {/* Hint */}
      {!draft && !draftPopover ? (
        <div className="pointer-events-none absolute bottom-3 right-3 rounded bg-background/70 px-2 py-1 text-[10px] text-muted-foreground shadow backdrop-blur">
          Alt-click chart to place an order
        </div>
      ) : null}
    </div>
  );
}

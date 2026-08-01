/**
 * Phase 8B · Replay Studio session context.
 *
 * The single active Replay controller in the authenticated app. It loads the
 * session row and its historical bars, boots the canonical Phase 8A engine,
 * and exposes a read-only view plus thin action delegates.
 *
 * Nothing in this file executes, fills, trails, closes or prices anything.
 * All of that belongs to `@/lib/chart/orders`.
 */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  useSyncExternalStore, type ReactNode,
} from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getReplayCandles, getReplaySession } from "@/lib/replay.functions";
import { makeDrawing } from "@/lib/chart/drawings/store";
import { placeOrEditOrder, closePosition, cancelPendingOrder } from "@/lib/chart/orders/service";
import type { OrderStores } from "@/lib/chart/orders/service";
import type { PositionOrder } from "@/lib/chart/orders/model";
import type { ClosedTrade } from "@/lib/chart/orders/closed-trade";
import type { Candle, Timeframe } from "@/lib/replay/types";
import { bootstrapSession, type BootstrapResult } from "@/lib/replay/session/loader";
import { loadSnapshot } from "@/lib/replay/session/persistence";
import type { ReplaySessionController, ControllerSnapshot } from "@/lib/replay/session/controller";

export type StudioPhase = "loading" | "unavailable" | "invalid" | "ready";

export interface StudioBlocked {
  title: string;
  message: string;
  errors: string[];
}

export interface StudioValue {
  /** Canonical `replay_sessions.id` — the key every reflection artefact hangs off. */
  sessionId: string;
  /** Session starting balance, or null when unknown (never defaulted to 0). */
  startingBalance: number | null;
  phase: StudioPhase;
  blocked: StudioBlocked | null;
  warnings: string[];
  discarded: { reason: string; message: string } | null;
  resumed: boolean;
  resumedAtCursor: number;
  view: ControllerSnapshot | null;
  stores: OrderStores | null;
  orders: PositionOrder[];
  positions: PositionOrder[];
  pending: PositionOrder[];
  trades: ClosedTrade[];
  price: number | null;
  // actions — every one delegates to the controller or the canonical engine
  play: () => void;
  pause: () => void;
  toggle: () => void;
  step: () => void;
  stepCandle: () => void;
  skipCandles: (n: number) => void;
  setSpeed: (s: number) => void;
  seekForwardTo: (timeMs: number) => void;
  finish: () => void;
  saveNow: () => void;
  placeMarketOrder: (direction: "buy" | "sell", opts?: { stopDistance?: number; targetDistance?: number; size?: number }) => void;
  closePositionNow: (orderId: string) => void;
  cancelOrder: (orderId: string) => void;
  retry: () => void;
}

const Ctx = createContext<StudioValue | null>(null);

export function useReplayStudio(): StudioValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useReplayStudio must be used inside <ReplayStudioProvider>");
  return v;
}

function rangeFor(session: any): { from: number; to: number } {
  if (session?.range_start && session?.range_end) {
    return { from: new Date(session.range_start).getTime(), to: new Date(session.range_end).getTime() };
  }
  const dateStr = session?.replay_date ?? new Date().toISOString().slice(0, 10);
  const midnight = new Date(`${dateStr}T00:00:00Z`).getTime();
  return { from: midnight, to: midnight + 24 * 3600 * 1000 };
}

export function ReplayStudioProvider({ id, children }: { id: string; children: ReactNode }) {
  const getSess = useServerFn(getReplaySession);
  const getCandles = useServerFn(getReplayCandles);

  const sessionQuery = useQuery({ queryKey: ["replay-studio-session", id], queryFn: () => getSess({ data: { id } }) });
  const session = (sessionQuery.data?.session ?? null) as any;

  const candleQuery = useQuery({
    queryKey: ["replay-studio-candles", id, session?.symbol, session?.timeframe, session?.range_start, session?.range_end],
    enabled: !!session,
    queryFn: async () => {
      const { from, to } = rangeFor(session);
      return getCandles({
        data: {
          symbol: session.symbol,
          timeframe: (session.timeframe ?? "5m") as Timeframe,
          from,
          to,
          market: session.market ?? undefined,
          session_id: id,
          allowSynthetic: session.provider === "synthetic",
        },
      });
    },
  });

  const [boot, setBoot] = useState<BootstrapResult | null>(null);
  const bootRef = useRef<ReplaySessionController | null>(null);
  const [storeTick, setStoreTick] = useState(0);

  // ── boot once per session + dataset ────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    if (!session || !candleQuery.data) return;
    const candles = (candleQuery.data.candles ?? []) as Candle[];
    if (candleQuery.data.unavailable) { setBoot(null); return; }

    (async () => {
      const snapshot = await loadSnapshot(id).catch(() => null);
      if (cancelled) return;
      const result = bootstrapSession({
        row: {
          id,
          user_id: session.user_id,
          title: session.title,
          symbol: session.symbol,
          timeframe: session.timeframe ?? "5m",
          market: session.market,
          starting_balance: session.starting_balance ?? null,
          source_trade_id: session.source_trade_id ?? null,
          source_journal_id: session.source_journal_id ?? null,
        },
        candles,
        provider: candleQuery.data!.providerId ?? "unknown",
        timezone: (session.timezone as string | null) ?? "UTC",
        isSynthetic: !!candleQuery.data!.isSynthetic,
        allowSynthetic: session.provider === "synthetic",
        snapshot,
      });
      if (cancelled) return;
      if (result.ok) bootRef.current = result.controller;
      setBoot(result);
    })();

    return () => {
      cancelled = true;
      bootRef.current?.dispose();
      bootRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, session?.id, candleQuery.data]);

  const controller = boot?.ok ? boot.controller : null;
  const stores = boot?.ok ? boot.stores : null;

  const view = useSyncExternalStore(
    useCallback((fn: () => void) => (controller ? controller.subscribe(fn) : () => {}), [controller]),
    useCallback(() => (controller ? controller.getSnapshot() : null), [controller]),
    useCallback(() => (controller ? controller.getSnapshot() : null), [controller]),
  );

  // Execution stores are separate emitters — mirror them into a tick counter.
  useEffect(() => {
    if (!stores) return;
    const bump = () => setStoreTick((n) => n + 1);
    const offOrders = stores.orders.subscribe(bump);
    const offTrades = stores.trades?.subscribe(bump);
    return () => { offOrders(); offTrades?.(); };
  }, [stores]);

  // Flush on tab hide and on unload — an interrupted session loses nothing.
  useEffect(() => {
    if (!controller) return;
    const onHide = () => { if (document.visibilityState === "hidden") { controller.pause(); void controller.save(); } };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, [controller]);

  const orders = useMemo(() => (stores ? stores.orders.list().slice() : []), [stores, storeTick]);
  const positions = useMemo(() => (stores ? stores.orders.positions().slice() : []), [stores, storeTick]);
  const pending = useMemo(() => (stores ? stores.orders.pending().slice() : []), [stores, storeTick]);
  const trades = useMemo(() => (stores?.trades ? stores.trades.list().slice() : []), [stores, storeTick]);

  const price = view?.candles.length ? view.candles[view.candles.length - 1].close : null;

  const placeMarketOrder = useCallback(
    (direction: "buy" | "sell", opts: { stopDistance?: number; targetDistance?: number; size?: number } = {}) => {
      if (!stores || !view || price == null) return;
      const dist = opts.stopDistance ?? Math.max(price * 0.002, 1e-8);
      const target = opts.targetDistance ?? dist * 2;
      const stop = direction === "buy" ? price - dist : price + dist;
      const tp = direction === "buy" ? price + target : price - target;
      const drawing = makeDrawing(direction === "buy" ? "long_position" : "short_position", [
        { time: view.transport.marketTime, price },
        { time: view.transport.marketTime, price: stop },
      ]);
      stores.drawings.add(drawing);
      placeOrEditOrder(
        stores,
        {
          symbol: view.dataset.label.split(" ")[0],
          direction,
          orderType: "market",
          entry: price,
          stop,
          target: tp,
          size: opts.size ?? 1,
          drawingId: drawing.id,
        },
        { marketPrice: price },
      );
    },
    [stores, view, price],
  );

  const closePositionNow = useCallback(
    (orderId: string) => {
      if (!stores || price == null) return;
      closePosition(stores, orderId, { price, reason: "manual" });
    },
    [stores, price],
  );

  const cancelOrder = useCallback((orderId: string) => { if (stores) cancelPendingOrder(stores, orderId); }, [stores]);

  const phase: StudioPhase = !session || candleQuery.isLoading || (!boot && !candleQuery.data?.unavailable)
    ? "loading"
    : candleQuery.data?.unavailable
      ? "unavailable"
      : boot && !boot.ok
        ? "invalid"
        : "ready";

  const blocked: StudioBlocked | null =
    phase === "unavailable"
      ? {
          title: "No historical data for this session",
          message: (candleQuery.data?.unavailable as any)?.message ?? "The dataset could not be resolved.",
          errors: [],
        }
      : phase === "invalid" && boot && !boot.ok
        ? { title: "This dataset cannot be replayed", message: "Replay refuses data it cannot reproduce deterministically.", errors: boot.errors }
        : null;

  const value: StudioValue = {
    sessionId: id,
    startingBalance: typeof session?.starting_balance === "number" ? session.starting_balance : null,
    phase,
    blocked,
    warnings: boot?.ok ? boot.warnings : boot?.warnings ?? [],
    discarded: boot?.ok ? boot.discardedSnapshot : null,
    resumed: boot?.ok ? boot.resumed : false,
    resumedAtCursor: boot?.ok ? boot.resumedAtCursor : 0,
    view,
    stores,
    orders,
    positions,
    pending,
    trades,
    price,
    play: () => controller?.play(),
    pause: () => controller?.pause(),
    toggle: () => controller?.toggle(),
    step: () => { controller?.step(); },
    stepCandle: () => { controller?.stepCandle(); },
    skipCandles: (n) => { controller?.skipCandles(n); },
    setSpeed: (s) => { controller?.setSpeed(s); },
    seekForwardTo: (t) => { controller?.seekForwardTo(t); },
    finish: () => { void controller?.complete(); },
    saveNow: () => { void controller?.save(); },
    placeMarketOrder,
    closePositionNow,
    cancelOrder,
    retry: () => { void sessionQuery.refetch(); void candleQuery.refetch(); },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

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
import { toast } from "sonner";
import { logHistoricalMarketReplayed } from "@/lib/activity.functions";
import { useQuery } from "@tanstack/react-query";
import { getReplayCandles, getReplaySession, completeReplaySession } from "@/lib/replay.functions";
import { makeDrawing } from "@/lib/chart/drawings/store";
import {
  placeOrEditOrder, closePosition, cancelPendingOrder, positionMetricsFor,
  updatePositionLevels, partialClosePosition, moveStopToBreakEven,
} from "@/lib/chart/orders/service";
import { inferOrderType } from "@/lib/chart/orders/model";
import { useReplaySettings } from "@/lib/replay/settings";
import { findSymbol } from "@/lib/paper-trading/symbols";
import { lotsToUnits, marketOrderSize } from "@/lib/replay/chart-trading";
import type { OrderStores } from "@/lib/chart/orders/service";
import type { PositionOrder } from "@/lib/chart/orders/model";
import type { ClosedTrade } from "@/lib/chart/orders/closed-trade";
import type { Candle, Timeframe } from "@/lib/replay/types";
import { bootstrapSession, type BootstrapResult } from "@/lib/replay/session/loader";
import { readRules, type ReplayPropRules } from "@/lib/replay/prop-challenge";
import { loadSnapshot } from "@/lib/replay/session/persistence";
import { createReplayTradeRemote, replayTradeScope } from "@/lib/chart/orders/replay-trade-sync";
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
  /**
   * `replay_sessions.market` — needed by anything whose relevance depends on
   * the asset class. The NYSE bell is a jump preset on an equity chart and
   * noise on a crypto one.
   */
  market: string | null;
  /** `replay_sessions.symbol` — for anything needing the instrument's metadata. */
  symbol: string | null;
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

  // ── Phase C · chart-native trading ─────────────────────────────────────
  /** Balance + open P/L, or null when the session has no starting balance. */
  equity: number | null;
  /** Risk budget per trade, in percent of equity. Drives default sizing. */
  riskPercent: number;
  /**
   * Units used when a market order opens with no stop — `defaultLotSize` from
   * Replay Settings, converted from lots. Read-only here: it is edited in
   * Replay Settings, not on the chart, so there is exactly one place to set it.
   */
  defaultUnits: number;
  setRiskPercent: (pct: number) => void;
  /** Units implied by the risk budget for a given entry/stop pair. */
  sizeForRisk: (entry: number, stop: number) => number;
  /** Place (or amend) an order at an arbitrary chart price — pending or market. */
  placeOrderAt: (
    direction: "buy" | "sell",
    levels: { entry: number; stop: number; target: number },
    opts?: { size?: number },
  ) => void;
  /** Drag stop / target of a live position. Entry is immutable. */
  modifyLevels: (orderId: string, levels: { stop?: number; target?: number }) => void;
  /** Amend a resting order's entry / stop / target. */
  modifyPendingLevels: (orderId: string, levels: { entry?: number; stop?: number; target?: number }) => void;
  /** Reduce a live position by a fraction (0–1) at the current price. */
  partialClose: (orderId: string, fraction: number) => void;
  /** Move the stop to break-even, subject to the canonical guard. */
  breakEven: (orderId: string) => void;

  // ── Phase 2 · item 3 · prop-firm challenge ─────────────────────────────
  /**
   * The prop ruleset this session was CREATED under, or null for a plain
   * practice session. Snapshotted into `replay_sessions.settings`, never read
   * from a live setting — same decision spread and slippage got, and for the
   * same reason: two traders on one session must fail at the same point.
   */
  challengeRules: ReplayPropRules | null;
  /** Unrealised P/L across open positions at the cursor. */
  openPnl: number;
}

const Ctx = createContext<StudioValue | null>(null);

export function useReplayStudio(): StudioValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useReplayStudio must be used inside <ReplayStudioProvider>");
  return v;
}

/**
 * Bars of real history loaded *before* the session window so the studio opens
 * with market context on screen (FXReplay-style) instead of a single candle.
 */
const WARMUP_BARS = 600;

function rangeFor(session: any): { from: number; to: number } {
  if (session?.range_start && session?.range_end) {
    return { from: new Date(session.range_start).getTime(), to: new Date(session.range_end).getTime() };
  }
  const dateStr = session?.replay_date ?? new Date().toISOString().slice(0, 10);
  const midnight = new Date(`${dateStr}T00:00:00Z`).getTime();
  return { from: midnight, to: midnight + 24 * 3600 * 1000 };
}

/**
 * Where a fresh session drops the cursor. "beginning" (the default) means the
 * very first candle of the selected day/range, so traders see the open.
 */
function startCursorFor(session: any, observations: number): number {
  const tag: string = (session?.tags ?? []).find?.((t: string) => t.startsWith("start:")) ?? "";
  const mode = tag.slice("start:".length);
  if (mode === "random") return Math.floor(Math.random() * Math.max(1, observations * 0.6));
  if (mode === "before_end") return Math.floor(observations * 0.75);
  return 0;
}

/**
 * Report a refused order.
 *
 * `placeOrEditOrder` returns `{ ok: false, errors }`; it does not throw. Three
 * call sites discarded that result, so a rejected order was indistinguishable
 * from a placed one — the button clicked, nothing appeared, and no reason was
 * given. Same shape as the discarded closed-trade write and the unread
 * `{ error }` fixed earlier the same day.
 *
 * It matters most for the affordability cap: a guard that refuses silently
 * teaches the trader the app is broken rather than that the order was too big.
 */
function reportPlacement(res: { ok: boolean; errors?: string[] }): boolean {
  if (res.ok) return true;
  toast.error("Order not placed", { description: res.errors?.[0] ?? "The order was refused." });
  return false;
}

export function ReplayStudioProvider({ id, children }: { id: string; children: ReactNode }) {
  const getSess = useServerFn(getReplaySession);
  const getCandles = useServerFn(getReplayCandles);

  const sessionQuery = useQuery({ queryKey: ["replay-studio-session", id], queryFn: () => getSess({ data: { id } }) });
  const session = (sessionQuery.data?.session ?? null) as any;
  const logMarketReplayed = useServerFn(logHistoricalMarketReplayed);

  // Track historical market time replayed
  const lastLoggedTimeRef = useRef<number | null>(null);

  const candleQuery = useQuery({
    queryKey: ["replay-studio-candles", id, session?.symbol, session?.timeframe, session?.range_start, session?.range_end, WARMUP_BARS],
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
          warmupBars: WARMUP_BARS,
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
    const warmupCount = Math.min(
      (candleQuery.data as { warmupCount?: number }).warmupCount ?? 0,
      Math.max(0, candles.length - 1),
    );
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
          starting_balance: session.initial_balance ?? null,
          source_trade_id: session.source_trade_id ?? null,
          source_journal_id: session.source_journal_id ?? null,
        },
        candles,
        provider: candleQuery.data!.providerId ?? "unknown",
        timezone: (session.timezone as string | null) ?? "UTC",
        isSynthetic: !!candleQuery.data!.isSynthetic,
        allowSynthetic: session.provider === "synthetic",
        snapshot,
        // Warm-up bars sit *before* the session window: they are visible
        // history, never replayable observations, so the cursor starts past
        // them and the requested range still drives start-mode maths.
        //
        // Counted in CANDLES. The loader converts to the clock's observation
        // space — passing this as observations opened the session 437 bars
        // before its own range_start.
        startCursorCandles:
          warmupCount + startCursorFor(session, Math.max(1, candles.length - warmupCount)),
        // Read from the SESSION ROW, never from the live settings store. The
        // costs were snapshotted when the session was created, so replaying it
        // tomorrow — or on another machine, or after changing the default —
        // fills exactly the same way. Old rows default to 0, which is the
        // honest reading: they ran with no simulated cost.
        costs: {
          spread: Number(session.spread ?? 0),
          slippage: Number(session.slippage ?? 0),
        },

      });
      if (cancelled) return;
      if (result.ok) {
        bootRef.current = result.controller;
        // Phase 8D: the result tape is durable and provenance-tagged, so a
        // completed session can be reviewed from server truth on any device.
        result.stores.trades?.hydrate(replayTradeScope(id));
        result.stores.trades?.attachRemote(createReplayTradeRemote(id));
      }
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

  /**
   * Latest snapshot, readable without becoming a dependency.
   *
   * `view` changes on every observation, so a callback that closed over it
   * would be rebuilt continuously during playback. The manual mutators only
   * need the CURRENT market time at the moment they fire.
   */
  const viewRef = useRef<ControllerSnapshot | null>(null);
  viewRef.current = view;

  // Execution stores are separate emitters — mirror them into a tick counter.
  useEffect(() => {
    if (!stores) return;
    const bump = () => setStoreTick((n) => n + 1);
    const offOrders = stores.orders.subscribe(bump);
    const offTrades = stores.trades?.subscribe(bump);
    return () => {
      offOrders();
      offTrades?.();
    };
  }, [stores]);

  // Track and log historical market time replayed
  useEffect(() => {
    if (!view || !session) return;
    const currentMarketTime = view.transport.marketTime;

    if (lastLoggedTimeRef.current === null) {
      lastLoggedTimeRef.current = currentMarketTime;
      return;
    }

    const diffMs = currentMarketTime - lastLoggedTimeRef.current;
    // Log in chunks of at least 1 minute of market time to reduce noise
    if (diffMs >= 60_000) {
      void logMarketReplayed({
        data: {
          session_id: id,
          symbol: session.symbol,
          start_ts: new Date(lastLoggedTimeRef.current).toISOString(),
          end_ts: new Date(currentMarketTime).toISOString(),
          duration_seconds: Math.floor(diffMs / 1000),
        },
      });
      lastLoggedTimeRef.current = currentMarketTime;
    }
  }, [view?.transport.marketTime, session, id, logMarketReplayed]);

  // Sync session "atEnd" state to server lifecycle
  useEffect(() => {
    if (!view || !controller) return;
    if (view.transport.atEnd && view.transport.lifecycle !== "completed") {
      // Reached end of data - could auto-complete or wait for user
      // For now, we wait for user to click "Finish", but we ensure state is flushed.
      void controller.save();
    }
  }, [view?.transport.atEnd, view?.transport.lifecycle, controller]);


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

  // ── Phase C · chart-native trading ──────────────────────────────────────
  // Equity is a projection: starting balance + realized tape + open P/L.
  const realizedPnl = trades.reduce((sum, t) => sum + (Number.isFinite(t.netPnl) ? t.netPnl : 0), 0);
  const openPnl = positions.reduce((sum, p) => sum + (positionMetricsFor(p, price)?.totalPnl ?? 0), 0);
  const startingBalance =
    session?.initial_balance != null && Number.isFinite(Number(session.initial_balance))
      ? Number(session.initial_balance)
      : null;
  const equity = startingBalance == null ? null : startingBalance + realizedPnl + openPnl;

  const [riskPercent, setRiskPercent] = useState(1);

  /**
   * Size used when a market order opens with NO stop.
   *
   * RS-4's sizing question, settled: this is the trader's `defaultLotSize` from
   * Replay Settings — a setting that already existed, already had a UI, and was
   * read by nothing. The A/B/C options priced earlier were wrong in their
   * premise: Option C (size as a property of the position, in lots, the way
   * FXReplay does it) was not unbuilt, it was UNWIRED.
   *
   * ⚠ LOTS IN, UNITS OUT. `PositionOrder.size` is consumed as UNITS; this
   * setting is in LOTS. The two differ by `contractSize` — 1 for crypto and
   * 100,000 for every forex pair — so passing lots straight through does not
   * error, it understates forex P&L by five orders of magnitude and tests clean
   * on crypto. That is BA-9. The conversion happens here, once, at the boundary.
   */
  const { settings: replaySettings } = useReplaySettings();
  const contractSize = useMemo(
    () => (session?.symbol ? findSymbol(session.symbol)?.contractSize || 1 : 1),
    [session?.symbol],
  );
  const defaultUnits = useMemo(
    () => lotsToUnits(Number(replaySettings.defaultLotSize), contractSize),
    [replaySettings.defaultLotSize, contractSize],
  );

  const sizeForRisk = useCallback(
    (entry: number, stop: number) => {
      const distance = Math.abs(entry - stop);
      if (!(distance > 0) || equity == null || !(equity > 0)) return 1;
      const budget = (equity * riskPercent) / 100;
      const units = budget / distance;
      return Number.isFinite(units) && units > 0 ? units : 1;
    },
    [equity, riskPercent],
  );

  /**
   * The ONE market-order path in Studio.
   *
   * Every express route into a position now lands here — the toolbar's Buy /
   * Sell, the B / S hotkeys, and the right-click menu's market entries. Before
   * consolidation the toolbar passed a risk-derived size while the other three
   * passed nothing and took the `?? 1` fallback, so two buttons an inch apart
   * opened positions differing by orders of magnitude in money. The default
   * lives in here precisely so a caller cannot forget it.
   *
   * The 0.2% stop and 2R target are still the tool's choice, not the trader's.
   * NO SEEDED BRACKET (RS-3, closed by RS-4 Stage A).
   *
   * A market Buy or Sell fills instantly with `stop: null` and `target: null`
   * — no protection and no objective, because the tool has no business
   * inventing either. The trader adds them afterwards by dragging the ghost
   * handles on the position, which is what the live workspace already does and
   * what the real product does. The old 0.2% stop and 2R target were a
   * recommendation dressed as a decision.
   *
   * `stopDistance` / `targetDistance` remain accepted so a caller that DOES
   * know the levels (a test, or a future preset) can still supply them. They
   * simply no longer have defaults.
   */
  const placeMarketOrder = useCallback(
    (direction: "buy" | "sell", opts: { stopDistance?: number; targetDistance?: number; size?: number } = {}) => {
      if (!stores || !view || price == null) return;
      const dist = opts.stopDistance;
      const target = opts.targetDistance;
      const stop = dist == null ? null : direction === "buy" ? price - dist : price + dist;
      const tp = target == null ? null : direction === "buy" ? price + target : price - target;
      // Both anchors sit on the entry when there is no stop: a position drawing
      // is two points and cannot express a missing one, and the entry is where
      // the ghost handle parks so it stays grabbable.
      const drawing = makeDrawing(direction === "buy" ? "long_position" : "short_position", [
        { time: view.transport.marketTime, price },
        { time: view.transport.marketTime, price: stop ?? price },
      ]);
      stores.drawings.add(drawing);
      reportPlacement(placeOrEditOrder(
        stores,
        {
          symbol: view.dataset.label.split(" ")[0],
          direction,
          orderType: "market",
          entry: price,
          stop,
          target: tp,
          /**
           * Sizing — settled (RS-4 / RS-5).
           *
           * With a stop, Risk % means what it says and sizes the position.
           * Without one there is no distance to divide the risk budget by, so
           * the size comes from `defaultLotSize` in Replay Settings, converted
           * from lots to units. One control, in one place, already built.
           *
           * Adding a stop later deliberately does NOT resize the position:
           * re-sizing an open trade changes the basis its P/L is measured
           * against mid-flight, which is worse than an arbitrary size.
           */
          size: marketOrderSize({
            explicit: opts.size,
            stop,
            riskSized: stop == null ? 0 : sizeForRisk(price, stop),
            defaultUnits,
          }),
          drawingId: drawing.id,
        },
        // `equity` feeds validateOrder's notional cap. Omitting it silently
        // disables the guard, which is the failure mode the guard exists for.
        { marketPrice: price, equity },
      ));
    },
    [stores, view, price, sizeForRisk, defaultUnits],
  );

  const placeOrderAt = useCallback(
    (
      direction: "buy" | "sell",
      levels: { entry: number; stop: number; target: number },
      opts: { size?: number } = {},
    ) => {
      if (!stores || !view) return;
      const { entry, stop, target } = levels;
      if (![entry, stop, target].every((v) => Number.isFinite(v))) return;
      const orderType = inferOrderType(direction, entry, price);
      const time = view.transport.marketTime;
      const drawing = makeDrawing(direction === "buy" ? "long_position" : "short_position", [
        { time, price: entry },
        { time, price: target },
        { time, price: stop },
      ]);
      stores.drawings.add(drawing);
      reportPlacement(placeOrEditOrder(
        stores,
        {
          symbol: view.dataset.label.split(" ")[0],
          direction,
          orderType,
          entry,
          stop,
          target,
          size: opts.size ?? sizeForRisk(entry, stop),
          drawingId: drawing.id,
        },
        // `equity` feeds validateOrder's notional cap. Omitting it silently
        // disables the guard, which is the failure mode the guard exists for.
        { marketPrice: price, equity },
      ));
    },
    [stores, view, price, sizeForRisk],
  );

  const modifyLevels = useCallback(
    (orderId: string, levels: { stop?: number; target?: number }) => {
      if (stores) updatePositionLevels(stores, orderId, levels, marketNow());
    },
    [stores],
  );

  const modifyPendingLevels = useCallback(
    (orderId: string, levels: { entry?: number; stop?: number; target?: number }) => {
      if (!stores) return;
      const order = stores.orders.byId(orderId);
      if (!order || order.status !== "pending") return;
      const entry = Number.isFinite(levels.entry ?? NaN) ? (levels.entry as number) : order.entry;
      const stop = Number.isFinite(levels.stop ?? NaN) ? (levels.stop as number) : order.stop;
      const target = Number.isFinite(levels.target ?? NaN) ? (levels.target as number) : order.target;
      reportPlacement(placeOrEditOrder(
        stores,
        {
          symbol: order.symbol,
          direction: order.direction,
          orderType: inferOrderType(order.direction, entry, price),
          entry,
          stop,
          target,
          size: order.size,
          drawingId: order.drawingId,
        },
        // `equity` feeds validateOrder's notional cap. Omitting it silently
        // disables the guard, which is the failure mode the guard exists for.
        { marketPrice: price, equity },
      ));
    },
    [stores, price],
  );

  const partialClose = useCallback(
    (orderId: string, fraction: number) => {
      if (!stores || price == null) return;
      partialClosePosition(stores, orderId, {
        kind: "scale_out",
        percent: Math.max(1, Math.min(99, fraction * 100)),
        price,
      }, marketNow());
    },
    [stores, price],
  );

  const breakEven = useCallback(
    (orderId: string) => { if (stores) moveStopToBreakEven(stores, orderId, price, marketNow()); },
    [stores, price],
  );

  /**
   * The clock a replay's manual actions are stamped with.
   *
   * Every `@/lib/chart/orders/service` mutator takes `now`, defaulting to
   * `Date.now()` — right for the live workspace, wrong here. The engine path
   * already stamps market time (`applyIntent(..., tick.time)`), so omitting it
   * on manual closes put a session's trades in two different eras: a stop-out
   * dated to the replayed July bar, a hand-closed trade dated to today.
   *
   * Measured 2026-08-17 on a July 2026 replay: the per-day P/L strip showed
   * "2026-08-17" for hand-closed trades. It also made `duration` — exit minus
   * entry — read as six weeks for a trade held five minutes, which feeds
   * `averageHoldSeconds` and every hold-time comparison built on it.
   */
  const marketNow = useCallback(
    () => viewRef.current?.transport.marketTime ?? Date.now(),
    [],
  );

  const closePositionNow = useCallback(
    (orderId: string) => {
      if (!stores || price == null) return;
      closePosition(stores, orderId, { price, reason: "manual" }, marketNow());
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

  // Parsed once per session load, not per tick: the ruleset is immutable for
  // the life of the session.
  const challengeRules = useMemo(() => readRules(session?.settings), [session?.settings]);

  const value: StudioValue = {
    challengeRules,
    openPnl,
    sessionId: id,
    market: session?.market ?? null,
    symbol: session?.symbol ?? null,
    startingBalance:
      session?.initial_balance != null && Number.isFinite(Number(session.initial_balance))
        ? Number(session.initial_balance)
        : null,
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
    finish: () => {
      if (!controller) return;
      void (async () => {
        try {
          // Force one last save before transitioning lifecycle
          await controller.save();
          const ok = await controller.complete();
          // We also explicitly call the server function to ensure status is synced correctly
          await completeReplaySession({ data: { id } });

          if (ok) {
            toast.success("Session finished — review and score it below.");
            // Force a refresh of session state to show completion UI
            await sessionQuery.refetch();
          } else {
            toast.error("Session finished locally, but saving to the cloud failed. Retrying…");
          }
        } catch (e) {
          toast.error((e as Error).message || "Could not finish this session.");
        }
      })();
    },

    saveNow: () => {
      if (!controller) return;
      void (async () => {
        try {
          const ok = await controller.save();
          if (ok) toast.success("Progress saved");
          else toast.error("Save failed — we'll keep retrying in the background.");
        } catch (e) {
          toast.error((e as Error).message || "Save failed.");
        }
      })();
    },
    placeMarketOrder,
    closePositionNow,
    cancelOrder,
    equity,
    riskPercent,
    defaultUnits,
    setRiskPercent,
    sizeForRisk,
    placeOrderAt,
    modifyLevels,
    modifyPendingLevels,
    partialClose,
    breakEven,
    retry: () => { void sessionQuery.refetch(); void candleQuery.refetch(); },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

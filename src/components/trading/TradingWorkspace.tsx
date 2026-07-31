import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChartHandle } from "@/components/chart/ChartEngine";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity, BarChart3, BookMarked, BrainCircuit, Camera, CandlestickChart, Check, ChevronDown, ChevronRight,
  Clock, Bell, Eye, EyeOff, Play, Focus, Keyboard, LineChart as LineChartIcon, ListOrdered, Maximize2, Minimize2,
  NotebookPen, Newspaper, Star, Target,
} from "lucide-react";

import { toast } from "sonner";

import { PaperTradingProvider, usePaper } from "@/components/paper-trading/context";
import { TopToolbar } from "@/components/paper-trading/TopToolbar";
import { AccountSummary } from "@/components/paper-trading/AccountSummary";
import { OrderPanel } from "@/components/paper-trading/OrderPanel";
import { PositionsTable } from "@/components/paper-trading/PositionsTable";
import { OrdersTable } from "@/components/paper-trading/OrdersTable";
import { HistoryTable } from "@/components/paper-trading/HistoryTable";
import { WatchlistPanel } from "@/components/paper-trading/WatchlistPanel";
import { SymbolSearch } from "@/components/paper-trading/SymbolSearch";

import { AlertsDialog } from "@/components/chart/AlertsDialog";

import { ChartEngine } from "@/components/chart/ChartEngine";
import { DrawingToolRail } from "@/components/chart/DrawingToolRail";
import { useChartDrawings } from "@/components/chart/useChartDrawings";
import { ChartTextEditor } from "@/components/chart/ChartTextEditor";
import { PositionOrderDialog } from "@/components/chart/PositionOrderDialog";
import { PendingOrdersPanel } from "@/components/chart/PendingOrdersPanel";
import { OpenPositionsPanel } from "@/components/chart/OpenPositionsPanel";
import { ClosedTradesPanel } from "@/components/chart/ClosedTradesPanel";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "@tanstack/react-router";

import { usePositionOrders } from "@/components/chart/usePositionOrders";

import { DrawingContextMenu } from "@/components/chart/DrawingContextMenu";
import { DrawingStore } from "@/lib/chart/drawings/store";
import type { ToolId } from "@/lib/chart/drawings/types";
import { DEFAULT_CHART_SETTINGS } from "@/lib/chart/constants";
import type { ChartSettings, ChartType, IndicatorConfig, IndicatorKey } from "@/lib/chart/types";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import type { Quote, Timeframe } from "@/lib/market-data/types";

import { TradePlanner } from "@/components/trading/chart/TradePlanner";
import { ChartContextMenu } from "@/components/trading/chart/ChartContextMenu";
import { PositionLinesLive, type OpenTradeLine } from "@/components/trading/chart/PositionLinesLive";
import { TodayPnLWidget } from "@/components/trading/TodayPnLWidget";
import { MultiChartStrip, type MultiChartPane } from "@/components/trading/MultiChartStrip";
import { useTradingShortcuts } from "@/hooks/useTradingShortcuts";
import { emitTradeIntent } from "@/lib/trading/trade-intent";

import { GlassCard } from "@/components/ui/glass-card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";


import { cn } from "@/lib/utils";
import { findSymbol } from "@/lib/paper-trading/symbols";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { closeTrade, listTrades, listOrders } from "@/lib/paper-trading.functions";
import { useRiskMonitor } from "@/hooks/use-risk-monitor";
import { useSlTpMonitor } from "@/hooks/use-sl-tp-monitor";
import { useWorkspacePrefs, type WorkspaceTab, type BottomTab, type BlotterFilter } from "@/hooks/use-workspace-prefs";
import { QuickJournalPanel } from "@/components/trading/QuickJournalPanel";
import { WorkspaceNotes } from "@/components/trading/WorkspaceNotes";
import { AiInsightsPanel } from "@/components/trading/AiInsightsPanel";
import { Blotter } from "@/components/trading/Blotter";
import { PlaybookQuickAttach } from "@/components/playbook/PlaybookQuickAttach";
import { ChallengePanel } from "@/components/prop-challenges/ChallengePanel";
import { useActivePropChallenge } from "@/lib/prop-challenges/active-session";

const CHART_TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "30m", "1H", "4H", "1D", "1W"];
/** One-click timeframes pinned in the toolbar, TradingView-style. */
const FAVOURITE_TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "30m", "1H", "4H", "1D"];

const CHART_TYPE_OPTIONS: { key: ChartType; label: string }[] = [
  { key: "candles", label: "Candles" },
  { key: "hollow_candles", label: "Hollow Candles" },
  { key: "heikin_ashi", label: "Heikin Ashi" },
  { key: "bars", label: "Bars" },
  { key: "line", label: "Line" },
  { key: "area", label: "Area" },
  { key: "baseline", label: "Baseline" },
];

type IndicatorDef = { key: IndicatorKey; label: string; params: Record<string, number>; pane: "price" | "sub"; group: string };

const INDICATOR_TOGGLES: IndicatorDef[] = [
  { key: "ema", label: "EMA 20", params: { length: 20 }, pane: "price", group: "Overlays" },
  { key: "sma", label: "SMA 50", params: { length: 50 }, pane: "price", group: "Overlays" },
  { key: "bollinger", label: "Bollinger Bands", params: { length: 20, stddev: 2 }, pane: "price", group: "Overlays" },
  { key: "vwap", label: "VWAP", params: {}, pane: "price", group: "Overlays" },
  { key: "supertrend", label: "SuperTrend (10, 3)", params: { period: 10, multiplier: 3 }, pane: "price", group: "Overlays" },
  { key: "ichimoku", label: "Ichimoku Cloud", params: { conversion: 9, base: 26 }, pane: "price", group: "Overlays" },
  { key: "donchian", label: "Donchian Channels", params: { length: 20 }, pane: "price", group: "Overlays" },
  { key: "volume", label: "Volume", params: {}, pane: "sub", group: "Oscillators" },
  { key: "rsi", label: "RSI (14)", params: { length: 14 }, pane: "sub", group: "Oscillators" },
  { key: "macd", label: "MACD", params: { fast: 12, slow: 26, signal: 9 }, pane: "sub", group: "Oscillators" },
  { key: "sessions", label: "Sessions (Asia / London / NY)", params: {}, pane: "price", group: "Sessions & Levels" },
  { key: "fib", label: "Fibonacci", params: { length: 120 }, pane: "price", group: "Sessions & Levels" },
  { key: "sr", label: "Support / Resistance", params: { left: 5, right: 5, levels: 6 }, pane: "price", group: "Sessions & Levels" },
];

const SMC_SUB_OPTIONS: { key: "show_swings" | "show_bos" | "show_fvg" | "show_ob"; label: string; desc: string }[] = [
  { key: "show_swings", label: "Swing Highs / Lows", desc: "Pivot structure (SH / SL)" },
  { key: "show_bos", label: "BOS / CHoCH", desc: "Break of Structure & Change of Character" },
  { key: "show_fvg", label: "Fair Value Gaps (FVG)", desc: "Bullish / bearish imbalance zones" },
  { key: "show_ob", label: "Order Blocks (OB)", desc: "Last opposing candle before displacement" },
];

/** Right dock — only one tab is visible at a time (terminal style). */
const RIGHT_TABS: { k: WorkspaceTab; label: string; icon: typeof Target }[] = [
  { k: "watchlist", label: "Watchlist", icon: Star },
  { k: "order", label: "Order", icon: Target },
  { k: "positions", label: "Positions", icon: ListOrdered },
  { k: "alerts", label: "Alerts", icon: Bell },
  { k: "news", label: "News", icon: Newspaper },
];

/** Icon-only button used by the left tool rail. */
function RailButton({
  label, icon: Icon, active, onClick,
}: { label: string; icon: typeof Target; active?: boolean; onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          aria-label={label}
          aria-pressed={!!active}
          className={cn(
            "grid h-8 w-8 place-items-center rounded-md transition-colors",
            active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Icon className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}



function TradingWorkspaceInner() {
  const qc = useQueryClient();
  const { symbol, symbolMeta, market, timeframe, setTimeframe, accountId, setAccountId, account } = usePaper();
  useSlTpMonitor(account);
  useRiskMonitor(account);
  const { prefs, update, hydrated } = useWorkspacePrefs();
  const { active: activeChallenge } = useActivePropChallenge();

  // Auto-bind the workspace to the challenge's paper account so every closed
  // trade updates the challenge in real time — no manual linking required.
  useEffect(() => {
    if (!activeChallenge?.paper_account_id) return;
    if (accountId === activeChallenge.paper_account_id) return;
    setAccountId(activeChallenge.paper_account_id);
  }, [activeChallenge?.paper_account_id, accountId, setAccountId]);
  const [enabled, setEnabled] = useState<Record<string, boolean>>(prefs.indicators);
  const [chartType, setChartType] = useState<ChartType>(prefs.chartType as ChartType);
  const [smcOn, setSmcOn] = useState(prefs.smcOn);
  const [smcParts, setSmcParts] = useState<Record<string, boolean>>({
    show_swings: true, show_bos: true, show_fvg: true, show_ob: true,
  });
  const [quote, setQuote] = useState<Quote | null>(null);
  const [adapter, setAdapter] = useState<import("@/lib/chart/adapter").ChartAdapter | null>(null);
  const chartApi = useRef<ChartHandle | null>(null);
  const [tick, setTick] = useState(0);
  const [symbolSearchOpen, setSymbolSearchOpen] = useState(false);
  const [plannerActive, setPlannerActive] = useState(false);
  const [drawingsHidden, setDrawingsHidden] = useState(false);
  const [shortcutsHelp, setShortcutsHelp] = useState(false);
  const [multiPanes, setMultiPanes] = useState<MultiChartPane[]>([]);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [candles, setCandles] = useState<import("@/lib/market-data/types").Candle[]>([]);

  // ── Drawings: chart-anchored objects (time/price), not screen pixels ──
  const drawingStoreRef = useRef<DrawingStore | null>(null);
  if (!drawingStoreRef.current) drawingStoreRef.current = new DrawingStore();
  const drawingStore = drawingStoreRef.current;
  const [activeTool, setActiveTool] = useState<ToolId>("cursor");
  const [magnet, setMagnet] = useState(false);
  const [drawingsLocked, setDrawingsLocked] = useState(false);



  // Rehydrate persisted UI state once localStorage has been read.
  useEffect(() => {
    if (!hydrated) return;
    setEnabled(prefs.indicators);
    setChartType(prefs.chartType as ChartType);
    setSmcOn(prefs.smcOn);
    if (prefs.timeframe && prefs.timeframe !== timeframe) setTimeframe(prefs.timeframe);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // Persist toolbar-driven changes.
  useEffect(() => { if (hydrated) update("indicators", enabled); }, [enabled, hydrated, update]);
  useEffect(() => { if (hydrated) update("chartType", chartType); }, [chartType, hydrated, update]);
  useEffect(() => { if (hydrated) update("smcOn", smcOn); }, [smcOn, hydrated, update]);
  useEffect(() => { if (hydrated && timeframe) update("timeframe", timeframe); }, [timeframe, hydrated, update]);

  const handleReady = useCallback((api: ChartHandle) => {
    chartApi.current = api;
    setAdapter((prev) => (prev === api.adapter ? prev : api.adapter));
    setTick((t) => t + 1);
  }, []);
  const handleAdapter = useCallback((a: import("@/lib/chart/adapter").ChartAdapter | null) => {
    setAdapter((prev) => (prev === a ? prev : a));
  }, []);
  const handleCandles = useCallback((rows: import("@/lib/market-data/types").Candle[]) => {
    setCandles(rows);
  }, []);

  // DOM overlays (position lines, planner) re-project whenever the chart's
  // geometry changes — zoom, pan, price-scale drag or resize.
  useEffect(() => {
    if (!adapter?.subscribeGeometry) return;
    return adapter.subscribeGeometry(() => setTick((t) => t + 1));
  }, [adapter]);

  const activeTf: Timeframe = (CHART_TIMEFRAMES as string[]).includes(timeframe) ? (timeframe as Timeframe) : "1H";


  const chartSettings: ChartSettings = useMemo(
    () => ({ ...DEFAULT_CHART_SETTINGS, symbol, market, timeframe: activeTf, chartType }),
    [symbol, market, activeTf, chartType],
  );

  const indicators: IndicatorConfig[] = useMemo(() => {
    const base: IndicatorConfig[] = INDICATOR_TOGGLES.filter((i) => enabled[i.key]).map((i) => ({
      id: i.key, key: i.key, params: i.params, pane: i.pane, visible: true,
    }));
    // Volume is always declared, with visible reflecting the toggle. Emitting
    // an explicit `visible: false` (instead of dropping the entry) is what
    // lets the chart distinguish "turned off" from "not configured" and
    // actually remove the histogram.
    if (!enabled.volume) {
      base.push({ id: "volume", key: "volume", params: {}, pane: "sub", visible: false });
    }

    if (smcOn) {
      base.push({
        id: "smc", key: "smc", pane: "price", visible: true,
        params: {
          pivot: 3,
          show_swings: smcParts.show_swings ? 1 : 0,
          show_bos: smcParts.show_bos ? 1 : 0,
          show_fvg: smcParts.show_fvg ? 1 : 0,
          show_ob: smcParts.show_ob ? 1 : 0,
        },
      });
    }
    return base;
  }, [enabled, smcOn, smcParts]);

  const activeIndicatorCount = Object.values(enabled).filter(Boolean).length + (smcOn ? 1 : 0);
  const activeChartTypeLabel = CHART_TYPE_OPTIONS.find((c) => c.key === chartType)?.label ?? "Candles";


  // Open positions for this account (all symbols — filter for this symbol only in overlay)
  const fetchOpen = useServerFn(listTrades);
  type OpenTradeRow = OpenTradeLine & { symbol: string };
  const { data: openTradesAll } = useQuery({
    queryKey: ["paper", "trades", accountId, "open"],
    queryFn: () => fetchOpen({ data: { account_id: accountId!, status: "open" } }) as unknown as Promise<OpenTradeRow[]>,
    enabled: !!accountId,
    refetchInterval: 4000,
    // Don't burn quota while the tab is hidden — resume on visibilitychange.
    refetchIntervalInBackground: false,
  });
  const openHere: OpenTradeLine[] = useMemo(
    () => (openTradesAll ?? [])
      .filter((t) => t.symbol === symbol)
      .map((t) => ({
        id: t.id, direction: t.direction,
        entry_price: Number(t.entry_price),
        stop_loss: t.stop_loss != null ? Number(t.stop_loss) : null,
        take_profit: t.take_profit != null ? Number(t.take_profit) : null,
        lot_size: Number(t.lot_size),
      })),
    [openTradesAll, symbol],
  );
  const openCount = openTradesAll?.length ?? 0;

  // Pending orders count for the Trade-tab badge + adaptive section header.
  // Shares the query key with OrdersTable / Blotter so it dedupes.
  const fetchOrdersFn = useServerFn(listOrders);
  const { data: pendingOrdersAll } = useQuery({
    queryKey: ["paper", "orders", accountId],
    queryFn: () => fetchOrdersFn({ data: { account_id: accountId! } }) as unknown as Promise<{ id: string }[]>,
    enabled: !!accountId,
    staleTime: 4_000,
    refetchIntervalInBackground: false,
  });
  const pendingCount = pendingOrdersAll?.length ?? 0;

  const meta = symbolMeta ?? findSymbol(symbol);
  const decimals = meta?.decimals ?? 2;
  const { user } = useAuth();
  const navigate = useNavigate();

  const last = quote?.last ?? meta?.refPrice ?? 0;
  const bid = quote?.bid ?? last;
  const ask = quote?.ask ?? last;
  const spread = quote?.spread ?? Math.max(0, ask - bid);

  // Drawings are scoped per symbol so switching instruments swaps the set.
  useEffect(() => { drawingStore.setScope(symbol); }, [drawingStore, symbol]);

  // Chart pixel size, so the inline text editor can clamp itself on screen
  // instead of opening half-off the canvas near an edge.
  const [chartBounds, setChartBounds] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = adapter?.chartElement?.();
    if (!el || typeof ResizeObserver === "undefined") return;
    const sync = () => setChartBounds({ width: el.clientWidth, height: el.clientHeight });
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [adapter]);


  // Position Tool → pending orders (Phase 2). Creation only: orders are
  // local Paper Trading objects and are never sent to an execution API here.
  const positionOrders = usePositionOrders({
    store: drawingStore,
    symbol,
    marketPrice: last,
    pricePrecision: decimals,
    market: (meta as { market?: string } | null)?.market ?? null,

    onFill: (o) => {
      toast.success(`${o.direction === "buy" ? "Long" : "Short"} filled`, {
        description: `${o.symbol} @ ${(o.fillPrice ?? o.entry).toFixed(decimals)}${o.slippage ? ` · slippage ${(-o.slippage).toFixed(decimals)}` : ""}`,
      });
    },
    onClose: (o) => {
      const win = (o.realizedPnl ?? 0) >= 0;
      const reason = o.closeReason === "stop_loss" ? "Stop loss" : o.closeReason === "take_profit" ? "Target" : "Closed";
      (win ? toast.success : toast.error)(`${reason} · ${o.symbol}`, {
        description: `${(o.realizedR ?? 0) >= 0 ? "+" : ""}${(o.realizedR ?? 0).toFixed(2)}R @ ${(o.closePrice ?? 0).toFixed(decimals)}`,
      });
    },
  });

  const {
    drawings: drawingRevision, menu: drawingMenu, closeMenu: closeDrawingMenu,
    textEditor, commitTextEditor, cancelTextEditor, updateTextEditor,
  } = useChartDrawings({
    adapter,
    store: drawingStore,
    activeTool,
    setActiveTool,
    magnet,
    candles,
    pricePrecision: decimals,
    enabled: !drawingsHidden,
    onPositionDrawn: (d) => positionOrders.openDraft(d),
  });




  // Actions
  const closeFn = useServerFn(closeTrade);
  const closeLast = useMutation({
    mutationFn: async () => {
      const t = openHere[openHere.length - 1];
      if (!t) throw new Error("No open position on this symbol");
      if (last <= 0) throw new Error("No live price yet");
      return closeFn({ data: { id: t.id, exit_price: last, close_reason: "manual" } });
    },
    onSuccess: () => {
      toast.success("Position closed");
      qc.invalidateQueries({ queryKey: ["paper"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const screenshot = useCallback(async () => {
    try {
      const blob = await chartApi.current?.adapter?.screenshot();
      if (!blob) throw new Error("Screenshot unavailable");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${symbol.replace("/", "-")}-${new Date().toISOString().slice(0, 19)}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Chart screenshot downloaded");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [symbol]);

  useTradingShortcuts({
    // The persistent "Armed" chip inside OrderPanel now provides feedback,
    // so we no longer stack a toast on every B/S press.
    onBuy: () => { emitTradeIntent({ kind: "focus_side", side: "long" }); setRightOpen(true); setActiveTab("order"); },
    onSell: () => { emitTradeIntent({ kind: "focus_side", side: "short" }); setRightOpen(true); setActiveTab("order"); },
    onClose: () => closeLast.mutate(),
    onScreenshot: screenshot,
    onPlanTrade: () => setPlannerActive((v) => !v),
    onToggleDrawings: () => setDrawingsHidden((v) => !v),
    onToggleReplay: () => { setRightOpen(true); setActiveTab("order"); },
    onCancelOrders: () => { setRightOpen(true); setActiveTab("positions"); },
  });

  const rightOpen = prefs.rightOpen;
  const setRightOpen = useCallback((v: boolean) => update("rightOpen", v), [update]);
  const detailsOpen = prefs.detailsOpen;
  const setDetailsOpen = useCallback((v: boolean) => update("detailsOpen", v), [update]);
  const leftRailOpen = prefs.leftRailOpen;
  const activeTab: WorkspaceTab = prefs.activeTab;
  const setActiveTab = useCallback((v: WorkspaceTab) => update("activeTab", v), [update]);
  const focusMode = prefs.focusMode;
  const setFocusMode = useCallback((v: boolean) => update("focusMode", v), [update]);
  const rightWidth = Math.min(560, Math.max(280, prefs.rightWidth));


  // Reflect Focus Mode on the document body so app-shell chrome can hide via CSS.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.toggle("workspace-focus", focusMode);
    return () => { document.body.classList.remove("workspace-focus"); };
  }, [focusMode]);

  // Workspace-scoped keyboard shortcuts. Registered in capture phase so we
  // can intercept single-letter keys before the global `useTradingShortcuts`
  // handler consumes them (T especially).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "f") { setFocusMode(!focusMode); e.preventDefault(); e.stopPropagation(); }
      else if (k === "escape" && focusMode) { setFocusMode(false); e.preventDefault(); }
      else if (k === "j") { update("bottomOpen", true); update("bottomTab", "journal"); e.preventDefault(); e.stopPropagation(); }
      else if (k === "?") { setShortcutsHelp((v: boolean) => !v); e.preventDefault(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [focusMode, setFocusMode, setRightOpen, setActiveTab]);

  // Live drag-to-resize for the right rail. Persists on pointerup.
  const dragState = useRef<{ startX: number; startW: number } | null>(null);
  const onResizeStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragState.current = { startX: e.clientX, startW: rightWidth };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => {
      const s = dragState.current; if (!s) return;
      const next = Math.min(560, Math.max(280, s.startW - (ev.clientX - s.startX)));
      update("rightWidth", next);
    };
    const onUp = () => {
      dragState.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [rightWidth, update]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-0 flex-col">
        {/* ── Compact unified toolbar (single row) ────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border/50 bg-card/40 px-2 py-1.5 backdrop-blur sm:px-3">
          <button
            onClick={() => setSymbolSearchOpen(true)}
            className="group flex min-w-0 items-baseline gap-2 rounded-md border border-border/60 bg-background/60 px-2 py-1 text-sm font-bold tracking-wide transition hover:border-primary/40"
            title="Change symbol (⌘F)"
          >
            <span className="truncate">{symbol}</span>
            <span className="hidden truncate text-[10px] font-normal uppercase text-muted-foreground md:inline">{meta?.name}</span>
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground opacity-60 group-hover:opacity-100" />
          </button>

          <div className="flex items-baseline gap-2 tabular-nums">
            <motion.span
              key={last} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }}
              className={cn("text-sm font-bold sm:text-base", quote?.last && quote.last >= bid ? "text-success" : "text-danger")}
            >{last.toFixed(decimals)}</motion.span>
            <span className="hidden text-[10px] text-muted-foreground xl:inline">B <span className="text-foreground">{bid.toFixed(decimals)}</span></span>
            <span className="hidden text-[10px] text-muted-foreground xl:inline">A <span className="text-foreground">{ask.toFixed(decimals)}</span></span>
            <Badge variant="outline" className="hidden h-4 px-1 text-[9px] xl:inline-flex">Sp {spread.toFixed(decimals)}</Badge>
          </div>

          <div className="mx-1 hidden h-5 w-px bg-border/60 md:block" />

          {/* Timeframe */}
          {/* Favourite timeframes — one click, always visible on wide screens */}
          <div className="hidden items-center gap-0.5 rounded-md border border-border/60 bg-background/50 p-0.5 lg:flex">
            {FAVOURITE_TIMEFRAMES.map((tf) => (
              <Tooltip key={tf}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setTimeframe(tf)}
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums transition",
                      activeTf === tf ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                    aria-pressed={activeTf === tf}
                  >{tf}</button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">{tf} timeframe</TooltipContent>
              </Tooltip>
            ))}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2 text-[11px] font-semibold">
                <Clock className="h-3.5 w-3.5" />
                <span className="lg:hidden">{activeTf}</span>
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Timeframe</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="grid grid-cols-4 gap-1 p-1">
                {CHART_TIMEFRAMES.map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setTimeframe(tf)}
                    className={cn(
                      "rounded-md px-2 py-1 text-[11px] font-medium transition",
                      activeTf === tf ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                    )}
                  >{tf}</button>
                ))}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>


          {/* Chart type */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2 text-[11px]">
                <CandlestickChart className="h-3.5 w-3.5" />
                <span className="hidden md:inline">{activeChartTypeLabel}</span>
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Chart Type</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {CHART_TYPE_OPTIONS.map((c) => (
                <DropdownMenuItem key={c.key} onSelect={() => setChartType(c.key)} className="text-xs">
                  <span className="flex-1">{c.label}</span>
                  {chartType === c.key && <Check className="h-3.5 w-3.5 text-primary" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Indicators */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2 text-[11px]">
                <BarChart3 className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Indicators</span>
                {activeIndicatorCount > 0 && (
                  <Badge variant="secondary" className="h-4 px-1 text-[10px]">{activeIndicatorCount}</Badge>
                )}
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Indicators & Studies
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {["Overlays", "Oscillators", "Sessions & Levels"].map((group) => (
                <div key={group}>
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group}</div>
                  {INDICATOR_TOGGLES.filter((i) => i.group === group).map((i) => (
                    <DropdownMenuCheckboxItem
                      key={i.key}
                      checked={!!enabled[i.key]}
                      onCheckedChange={(v) => setEnabled((s) => ({ ...s, [i.key]: !!v }))}
                      onSelect={(e) => e.preventDefault()}
                      className="text-xs"
                    >
                      {i.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </div>
              ))}
              <DropdownMenuSeparator />
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Smart Money Concepts
              </div>
              <DropdownMenuCheckboxItem
                checked={smcOn}
                onCheckedChange={(v) => setSmcOn(!!v)}
                onSelect={(e) => e.preventDefault()}
                className="text-xs font-medium"
              >
                SMC / ICT Toolkit
              </DropdownMenuCheckboxItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="text-xs" disabled={!smcOn}>
                  <span className="flex-1 pl-6">Configure setups…</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-64">
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    SMC / ICT Setups
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {SMC_SUB_OPTIONS.map((p) => (
                    <DropdownMenuCheckboxItem
                      key={p.key}
                      checked={!!smcParts[p.key]}
                      onCheckedChange={(v) => setSmcParts((s) => ({ ...s, [p.key]: !!v }))}
                      onSelect={(e) => e.preventDefault()}
                      className="items-start gap-2 py-2 text-xs"
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">{p.label}</span>
                        <span className="text-[10px] text-muted-foreground">{p.desc}</span>
                      </div>
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Right-aligned quick actions — kept minimal; tools live in the left rail */}
          <div className="ml-auto flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={focusMode ? "default" : "ghost"}
                  size="sm"
                  className="h-7 gap-1 px-2 text-[11px]"
                  onClick={() => setFocusMode(!focusMode)}
                  aria-pressed={focusMode}
                >
                  {focusMode ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                  <span className="hidden lg:inline">{focusMode ? "Exit" : "Fullscreen"}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{focusMode ? "Exit fullscreen (Esc)" : "Fullscreen chart (F)"}</TooltipContent>
            </Tooltip>
          </div>

        </div>

        {/* Collapsible account + session details (progressive disclosure) */}
        {detailsOpen && (
          <div className="border-b border-border/40 bg-background/40 px-2 py-2 sm:px-3 space-y-2">
            <TopToolbar />
            <TodayPnLWidget
              dailyTargetPct={Number(account?.max_daily_risk_pct ?? 5)}
              dailyLossLimitPct={Number(account?.max_daily_risk_pct ?? 5)}
            />
            <AccountSummary />
          </div>
        )}

        {/* ── Main workspace: chart dominates; rails collapse ───────────── */}
        <div className="flex min-h-0 flex-1">
          {/* Left tool rail — drawing tools first, then chart utilities */}
          {!focusMode && (
            <nav
              aria-label="Chart tools"
              className={cn(
                "hidden shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-border/40 bg-card/20 py-2 md:flex",
                leftRailOpen ? "w-11" : "w-8",
              )}
            >
              {leftRailOpen && (
                <>
                  <DrawingToolRail
                    store={drawingStore}
                    activeTool={activeTool}
                    onToolChange={setActiveTool}
                    magnet={magnet}
                    onMagnetChange={setMagnet}
                    hidden={drawingsHidden}
                    onHiddenChange={setDrawingsHidden}
                    locked={drawingsLocked}
                    onLockedChange={setDrawingsLocked}
                    revision={drawingRevision}
                  />
                  <div className="my-1 h-px w-6 bg-border/60" />
                  <RailButton label="Plan trade (T)" icon={Target} active={plannerActive} onClick={() => setPlannerActive((v) => !v)} />
                  <RailButton label="Alerts" icon={Bell} active={activeTab === "alerts"} onClick={() => { setRightOpen(true); setActiveTab("alerts"); }} />
                  <RailButton label="Replay Studio" icon={Play} onClick={() => { window.location.href = "/replay"; }} />
                  <RailButton label="Screenshot (P)" icon={Camera} onClick={screenshot} />
                  <RailButton label="Account & market details" icon={Activity} active={detailsOpen} onClick={() => setDetailsOpen(!detailsOpen)} />
                  <RailButton label="Keyboard shortcuts (?)" icon={Keyboard} active={shortcutsHelp} onClick={() => setShortcutsHelp((v) => !v)} />
                </>
              )}
              <button
                onClick={() => update("leftRailOpen", !leftRailOpen)}
                className="mt-auto grid h-6 w-6 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label={leftRailOpen ? "Collapse tool rail" : "Expand tool rail"}
                title={leftRailOpen ? "Collapse tools" : "Expand tools"}
              >
                <ChevronRight className={cn("h-4 w-4 transition-transform", leftRailOpen && "rotate-180")} />
              </button>
            </nav>
          )}


          <div className="relative flex min-h-[calc(100dvh-4.5rem)] min-w-0 flex-1 flex-col border-r border-border/40">
            {/* Compact active-indicator strip — only shown when indicators
                are active so the chart owns as much vertical space as possible.
                The freshness chip lives inside ChartEngine (top-left) and is
                the single source of truth for data status. */}
            {activeIndicatorCount > 0 && (
              <div className="flex items-center gap-2 border-b border-border/40 bg-background/30 px-3 py-1 text-[10px] text-muted-foreground">
                <LineChartIcon className="h-3 w-3" />
                <span className="truncate">
                  {INDICATOR_TOGGLES.filter((i) => enabled[i.key]).map((i) => i.label).join(" · ")}
                  {smcOn && (activeIndicatorCount > 1 ? " · " : "") + "SMC/ICT"}
                </span>
              </div>
            )}

            {/* Chart canvas + overlays (fills remaining space) */}
            <div className="relative min-h-0 flex-1">
              <ChartEngine
                settings={chartSettings} indicators={indicators}
                onQuote={setQuote} onReady={handleReady}
                onAdapter={handleAdapter} onCandles={handleCandles}
                className="absolute inset-0"
              >
                {textEditor && (
                  <ChartTextEditor
                    state={textEditor}
                    onChange={updateTextEditor}
                    onCommit={commitTextEditor}
                    onCancel={cancelTextEditor}
                    bounds={chartBounds}
                  />
                )}
                {!drawingsHidden && (
                  <>

                    <PositionLinesLive
                      adapter={adapter} sym={meta ?? null}
                      trades={openHere} livePrice={last}
                      tick={tick + (openHere?.length ?? 0)}
                    />
                    <TradePlanner
                      adapter={adapter} sym={meta ?? null}
                      active={plannerActive}
                      onClose={() => setPlannerActive(false)}
                      balance={Number(account?.balance ?? 10000)}
                      leverage={Number(account?.leverage ?? 100)}
                      defaultRiskPct={Number(account?.max_trade_risk_pct ?? 1)}
                      livePrice={last}
                      onSend={(p) => {
                        emitTradeIntent({
                          kind: "prefill",
                          side: p.side,
                          orderType: "market",
                          price: p.entry,
                          sl: p.sl,
                          tp: p.tp,
                          lot: p.lot,
                        });
                        toast.success("Plan sent to Order Panel — review and confirm");
                        setPlannerActive(false);
                      }}
                    />
                    <ChartContextMenu
                      adapter={adapter} sym={meta ?? null} livePrice={last}
                      onIntent={(intent) => {
                        switch (intent.kind) {
                          case "buy_market":
                            emitTradeIntent({ kind: "prefill", side: "long", orderType: "market", price: last }); break;
                          case "sell_market":
                            emitTradeIntent({ kind: "prefill", side: "short", orderType: "market", price: last }); break;
                          case "buy_limit":
                            emitTradeIntent({ kind: "prefill", side: "long", orderType: "limit", price: intent.price }); break;
                          case "sell_limit":
                            emitTradeIntent({ kind: "prefill", side: "short", orderType: "limit", price: intent.price }); break;
                          case "buy_stop":
                            emitTradeIntent({ kind: "prefill", side: "long", orderType: "stop", price: intent.price }); break;
                          case "sell_stop":
                            emitTradeIntent({ kind: "prefill", side: "short", orderType: "stop", price: intent.price }); break;
                          case "alert":
                            toast.success(`Alert set at ${intent.price.toFixed(decimals)}`); break;
                          case "drawing":
                            toast.info("Use the drawing toolbar on the left of the chart. Press H to hide overlays."); break;
                        }
                      }}
                    />
                  </>
                )}
              </ChartEngine>

              {/* Floating focus-mode exit pill (only in focus mode) */}
              <AnimatePresence>
                {focusMode && (
                  <motion.button
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    onClick={() => setFocusMode(false)}
                    className="absolute left-1/2 top-3 z-40 -translate-x-1/2 rounded-full border border-border/60 bg-background/85 px-3 py-1 text-[11px] font-semibold shadow-lg backdrop-blur hover:bg-background"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Minimize2 className="h-3 w-3" /> Exit Focus
                      <kbd className="ml-1 rounded border border-border/60 bg-muted px-1 py-0.5 font-mono text-[9px]">Esc</kbd>
                    </span>
                  </motion.button>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {shortcutsHelp && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    className="absolute bottom-3 right-3 z-40 w-72 rounded-lg border border-border/60 bg-popover/95 p-3 text-xs shadow-xl backdrop-blur"
                  >
                    <div className="mb-2 flex items-center justify-between font-semibold">
                      <span className="inline-flex items-center gap-1.5"><Keyboard className="h-3.5 w-3.5" /> Keyboard Shortcuts</span>
                      <button onClick={() => setShortcutsHelp(false)} className="text-muted-foreground hover:text-foreground">×</button>
                    </div>
                    {[
                      ["F", "Focus Mode"], ["Esc", "Exit Focus"],
                      ["B", "Focus Buy"], ["S", "Focus Sell"],
                      ["J", "Open Journal panel"], ["T", "Plan Trade tool"],
                      ["X", "Close last position"], ["C", "Cancel pending orders"],
                      ["R", "Toggle replay"], ["P", "Screenshot"], ["H", "Hide overlays"],
                      ["?", "Toggle this help"],
                      ["Ctrl/⌘+Enter", "Submit order"],
                    ].map(([k, l]) => (
                      <div key={k} className="flex items-center justify-between border-b border-border/30 py-1 last:border-b-0">
                        <span className="text-muted-foreground">{l}</span>
                        <kbd className="rounded border border-border/60 bg-muted px-1.5 py-0.5 font-mono text-[10px]">{k}</kbd>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Right rail: tabbed, resizable, collapsible workspace panel */}
          {rightOpen ? (
            <>
              {/* Resize handle (desktop only) */}
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize workspace panel"
                onPointerDown={onResizeStart}
                className="hidden md:block w-1 shrink-0 cursor-col-resize bg-border/40 hover:bg-primary/60 active:bg-primary transition-colors"
              />
              <aside
                className="relative flex min-h-0 shrink-0 flex-col overflow-hidden bg-card/30 animate-workspace-slide"
                style={{ width: `min(100%, ${rightWidth}px)` }}
                aria-label="Workspace panel"
              >
                <div className="flex items-center justify-between border-b border-border/40 bg-background/40 px-1.5 py-1">
                  <div
                    role="tablist"
                    aria-label="Workspace"
                    onKeyDown={(e) => {
                      const i = RIGHT_TABS.findIndex((t) => t.k === activeTab);
                      if (e.key === "ArrowRight") { setActiveTab(RIGHT_TABS[(i + 1) % RIGHT_TABS.length].k); e.preventDefault(); }
                      else if (e.key === "ArrowLeft") { setActiveTab(RIGHT_TABS[(i - 1 + RIGHT_TABS.length) % RIGHT_TABS.length].k); e.preventDefault(); }
                    }}
                    className="flex min-w-0 items-center gap-0.5 overflow-x-auto no-scrollbar"
                  >
                    {RIGHT_TABS.map(({ k, label, icon: Icon }) => {
                      const count = k === "positions" ? (openCount || undefined) : undefined;
                      return (
                        <button
                          key={k}
                          role="tab"
                          id={`ws-tab-${k}`}
                          aria-selected={activeTab === k}
                          aria-controls={`ws-panel-${k}`}
                          tabIndex={activeTab === k ? 0 : -1}
                          onClick={() => setActiveTab(k)}
                          title={label}
                          className={cn(
                            "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors duration-150",
                            activeTab === k
                              ? "bg-primary/15 text-primary"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground",
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          <span className="hidden xl:inline">{label}</span>
                          {count != null && (
                            <Badge variant="secondary" className="h-4 px-1 text-[9px]">{count}</Badge>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => setRightOpen(false)}
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    aria-label="Collapse workspace panel"
                    title="Collapse (click to expand rail)"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                <div className="min-h-0 flex-1 space-y-3 overflow-auto p-2 sm:p-3">
                  {activeChallenge?.id && activeTab === "order" && <ChallengePanel />}

                  {activeTab === "watchlist" && (
                    <div role="tabpanel" id="ws-panel-watchlist" aria-labelledby="ws-tab-watchlist" className="animate-in fade-in duration-150">
                      <WatchlistPanel />
                    </div>
                  )}

                  {activeTab === "order" && (
                    <div
                      role="tabpanel"
                      id="ws-panel-order"
                      aria-labelledby="ws-tab-order"
                      className="space-y-3 animate-in fade-in duration-150"
                    >
                      <OrderPanel compact />
                    </div>
                  )}

                  {activeTab === "positions" && (
                    <div
                      role="tabpanel"
                      id="ws-panel-positions"
                      aria-labelledby="ws-tab-positions"
                      className="space-y-3 animate-in fade-in duration-150"
                    >
                      <AdaptiveSection title="Positions" count={openCount} emptyLabel="No open positions">
                        <PositionsTable />
                      </AdaptiveSection>
                      <AdaptiveSection
                        title="Chart positions"
                        count={positionOrders.openPositions.length}
                        emptyLabel="No open chart positions."
                      >
                        <OpenPositionsPanel
                          positions={positionOrders.openPositions}
                          closed={positionOrders.closedPositions}
                          marketPrice={last}
                          decimals={decimals}
                          onBreakEven={(id: string) => {
                            const res = positionOrders.breakEven(id);
                            if (res.ok) toast.success("Stop moved to break-even");
                            else toast.error(res.error);
                          }}
                          onClose={(id: string) => {
                            if (!positionOrders.closeAtMarket(id)) toast.error("No live price — cannot close yet");
                          }}
                          onArchive={positionOrders.archive}
                          onPartialClose={(id: string, pct: number) => {
                            const res = positionOrders.partialClose(id, pct);
                            if (res.ok) toast.success(`Closed ${pct}% of the position`);
                            else toast.error(res.error);
                            return res;
                          }}
                          onScaleOut={(id: string, pct: number) => {
                            const res = positionOrders.scaleOut(id, pct);
                            if (res.ok) toast.success(`Scaled out ${pct}%`);
                            else toast.error(res.error);
                            return res;
                          }}
                          onScaleIn={(id: string, pct: number) => {
                            const res = positionOrders.scaleIn(id, pct);
                            if (res.ok) toast.success(`Scaled in ${pct}%`);
                            else toast.error(res.error);
                            return res;
                          }}
                          onTakeProfits={(id: string) => {
                            const res = positionOrders.applyTakeProfits(id);
                            if (res.ok) toast.success("Take-profit ladder set (25 / 25 / 50)");
                            else toast.error(res.errors?.[0] ?? "Could not set the ladder");
                            return res;
                          }}
                          onTrailing={(id: string, cfg) => {
                            const res = positionOrders.applyTrailingConfig(id, cfg);
                            if (res) toast.success(cfg ? "Trailing stop armed" : "Trailing stop off");
                            else toast.error("Position is not open.");
                            return { ok: Boolean(res) };
                          }}
                          onAutoBreakEven={(id: string, r) => {
                            const res = positionOrders.applyAutoBreakEven(id, r);
                            if (res) toast.success(r ? `Auto break-even at +${r}R` : "Auto break-even off");
                            else toast.error("Position is not open.");
                            return { ok: Boolean(res) };
                          }}
                        />

                      </AdaptiveSection>
                      <AdaptiveSection
                        title="Closed trades"
                        count={positionOrders.visibleTrades.length}
                        emptyLabel="No closed chart trades yet."
                      >
                        <ClosedTradesPanel
                          trades={positionOrders.visibleTrades}
                          filter={positionOrders.tradeFilter}
                          onFilterChange={positionOrders.setTradeFilter}
                          decimals={decimals}
                          onViewOnChart={(t) => {
                            drawingStore.select(t.drawingId);
                            toast.info("Completed trade highlighted on the chart");
                          }}
                          onAddToJournal={async (t) => {
                            if (!user?.id) { toast.error("Sign in to journal this trade"); return; }
                            const res = await positionOrders.addToJournal(t.id, user.id);
                            if (!res.ok) { toast.error(res.error); return; }
                            toast.success(res.created ? "Journal entry created" : "Opening existing journal entry");
                            navigate({ to: "/journal/$entryId", params: { entryId: res.entryId } });
                          }}
                          onOpenJournal={(t) => {
                            if (t.journalEntryId) navigate({ to: "/journal/$entryId", params: { entryId: t.journalEntryId } });
                          }}
                          onArchive={(t, archived) => {
                            positionOrders.archiveTrade(t.id, archived);
                            toast.success(archived ? "Trade archived" : "Trade restored");
                          }}
                        />
                      </AdaptiveSection>

                      <AdaptiveSection
                        title="Chart orders"
                        count={positionOrders.pendingOrders.length}
                        emptyLabel="No pending Position Tool orders."
                      >
                        <PendingOrdersPanel
                          orders={positionOrders.pendingOrders}
                          decimals={decimals}
                          onEdit={positionOrders.editOrder}
                          onCancel={(id: string) => {
                            if (positionOrders.cancelOrder(id)) toast.success("Pending order cancelled");
                          }}
                        />
                      </AdaptiveSection>
                      <AdaptiveSection title="Pending orders" count={pendingCount} emptyLabel="No pending orders">
                        <OrdersTable />
                      </AdaptiveSection>

                    </div>
                  )}

                  {activeTab === "alerts" && (
                    <div
                      role="tabpanel"
                      id="ws-panel-alerts"
                      aria-labelledby="ws-tab-alerts"
                      className="space-y-3 animate-in fade-in duration-150"
                    >
                      <div className="rounded-md border border-border/40 bg-background/30 p-3 text-center">
                        <Bell className="mx-auto h-5 w-5 text-muted-foreground" />
                        <p className="mt-2 text-xs font-semibold">Price alerts</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">Get notified when {symbol} reaches your level.</p>
                        <Button size="sm" className="mt-2 h-7 text-[11px]" onClick={() => setAlertsOpen(true)}>
                          Manage alerts
                        </Button>
                      </div>
                    </div>
                  )}

                  {activeTab === "news" && (
                    <div
                      role="tabpanel"
                      id="ws-panel-news"
                      aria-labelledby="ws-tab-news"
                      className="space-y-3 animate-in fade-in duration-150"
                    >
                      <AiInsightsPanel symbol={symbol} />
                    </div>
                  )}
                </div>

              </aside>
            </>
          ) : (
            <button
              onClick={() => setRightOpen(true)}
              className="hidden md:flex w-11 shrink-0 flex-col items-center gap-2 border-l border-border/40 bg-card/20 py-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground transition hover:bg-card/40 hover:text-foreground"
              aria-label="Expand workspace panel"
              title="Expand panel"
            >
              <ChevronDown className="h-4 w-4 rotate-90" />
              <span className="rotate-180 [writing-mode:vertical-rl]">Workspace</span>
            </button>
          )}
        </div>

        {/* Bottom dock — Orders / Positions / History / Journal / Trade Notes */}
        <BottomDock
          symbol={symbol}
          multiPanes={multiPanes}
          setMultiPanes={setMultiPanes}
          bottomTab={prefs.bottomTab}
          setBottomTab={(t) => update("bottomTab", t)}
          open={prefs.bottomOpen}
          setOpen={(v) => update("bottomOpen", v)}
          dockHeight={Math.min(560, Math.max(180, prefs.dockHeight))}
          setDockHeight={(h) => update("dockHeight", h)}
          blotterFilter={prefs.blotterFilter}
          setBlotterFilter={(f) => update("blotterFilter", f)}
        />

        <SymbolSearch open={symbolSearchOpen} onOpenChange={setSymbolSearchOpen} />
        <AlertsDialog open={alertsOpen} onOpenChange={setAlertsOpen} symbol={symbol} />

        <PositionOrderDialog
          draft={positionOrders.draft}
          marketPrice={last}
          tick={positionOrders.tick}
          decimals={decimals}
          mode={positionOrders.draftMode}
          inferredType={positionOrders.inferredType}
          onConfirm={(d) => {
            const order = positionOrders.confirmDraft(d);
            if (order) {
              toast.success(`${order.direction === "buy" ? "Buy" : "Sell"} order pending`, {
                description: `${order.symbol} @ ${order.entry.toFixed(decimals)} · R:R 1 : ${order.rr.toFixed(2)}`,
              });
            }
          }}
          onEdit={() => {
            positionOrders.closeDraft();
            toast.info("Adjust the position on the chart, then reopen the ticket to confirm");
          }}
          onCancel={() => positionOrders.closeDraft()}
        />



        {drawingMenu && (
          <DrawingContextMenu
            store={drawingStore}
            menu={drawingMenu}
            onClose={closeDrawingMenu}
            revision={drawingRevision}
            onOpenOrderTicket={positionOrders.openDraftForId}
            onCancelOrder={(id: string) => { if (positionOrders.cancelOrder(id)) toast.success("Pending order cancelled"); }}
          />
        )}
      </div>

    </TooltipProvider>
  );
}

/**
 * AdaptiveSection — always renders its header so switching between the empty
 * and populated state doesn't shift layout. When count is zero, the body is
 * a single muted line; when > 0, the passed-in table is rendered.
 */
function AdaptiveSection({
  title, count, emptyLabel, children,
}: { title: string; count: number; emptyLabel: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="rounded-md border border-border/40 bg-background/30">
      <header className="flex items-center gap-2 border-b border-border/40 px-2.5 py-1">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{title}</span>
        {count > 0 && (
          <span className="rounded-full bg-primary/15 px-1.5 text-[9px] font-semibold tabular-nums text-primary">{count}</span>
        )}
      </header>
      {count === 0 ? (
        <p className="px-2.5 py-1.5 text-[11px] text-muted-foreground/80">{emptyLabel}</p>
      ) : (
        <div className="p-2">{children}</div>
      )}
    </section>
  );
}

const BOTTOM_TABS: { k: BottomTab; label: string }[] = [
  { k: "orders", label: "Orders" },
  { k: "positions", label: "Positions" },
  { k: "history", label: "History" },
  { k: "journal", label: "Journal" },
  { k: "notes", label: "Trade Notes" },
];

/**
 * BottomDock — dockable, resizable, collapsible terminal panel.
 * State is owned by the workspace (single prefs instance) and passed down so
 * the dock, the rail and the shortcuts never desync.
 */
function BottomDock({
  symbol, multiPanes, setMultiPanes,
  bottomTab, setBottomTab, open, setOpen,
  dockHeight, setDockHeight, blotterFilter, setBlotterFilter,
}: {
  symbol: string;
  multiPanes: MultiChartPane[];
  setMultiPanes: (p: MultiChartPane[]) => void;
  bottomTab: BottomTab;
  setBottomTab: (t: BottomTab) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
  dockHeight: number;
  setDockHeight: (h: number) => void;
  blotterFilter: BlotterFilter;
  setBlotterFilter: (f: BlotterFilter) => void;
}) {
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);
  const onResizeStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { startY: e.clientY, startH: dockHeight };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => {
      const s = dragRef.current; if (!s) return;
      setDockHeight(Math.min(560, Math.max(180, s.startH - (ev.clientY - s.startY))));
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [dockHeight, setDockHeight]);

  return (
    <div className="border-t border-border/40 bg-card/30">
      {open ? (
        <>
          <div className="hidden md:block">
            <MultiChartStrip panes={multiPanes} onChange={setMultiPanes} primarySymbol={symbol} />
          </div>
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize dock"
            onPointerDown={onResizeStart}
            className="h-1 cursor-row-resize bg-border/40 transition-colors hover:bg-primary/60 active:bg-primary"
          />
        </>
      ) : null}
      <div className="flex min-h-0 flex-col" style={open ? { height: dockHeight } : undefined}>
        <div className="flex h-8 items-center gap-1 border-b border-border/40 px-2">
          <div
            role="tablist"
            aria-label="Bottom dock"
            onKeyDown={(e) => {
              const i = BOTTOM_TABS.findIndex((t) => t.k === bottomTab);
              if (e.key === "ArrowRight") { setBottomTab(BOTTOM_TABS[(i + 1) % BOTTOM_TABS.length].k); e.preventDefault(); }
              else if (e.key === "ArrowLeft") { setBottomTab(BOTTOM_TABS[(i - 1 + BOTTOM_TABS.length) % BOTTOM_TABS.length].k); e.preventDefault(); }
            }}
            className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto no-scrollbar"
          >
            {BOTTOM_TABS.map(({ k, label }) => {
              const active = open && bottomTab === k;
              return (
                <button
                  key={k}
                  role="tab"
                  id={`dock-tab-${k}`}
                  aria-selected={active}
                  aria-controls={`dock-panel-${k}`}
                  tabIndex={active ? 0 : -1}
                  onClick={() => { setBottomTab(k); setOpen(true); }}
                  className={cn(
                    "shrink-0 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors",
                    active ? "bg-background/70 text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setOpen(!open)}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label={open ? "Collapse dock" : "Expand dock"}
            title={open ? "Collapse dock" : "Expand dock"}
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", !open && "rotate-180")} />
          </button>
        </div>
        {open && (
          <div id={`dock-panel-${bottomTab}`} role="tabpanel" className="min-h-0 flex-1 overflow-hidden">
            {bottomTab === "orders" && <Blotter filter="pending" onFilterChange={setBlotterFilter} />}
            {bottomTab === "positions" && <Blotter filter="open" onFilterChange={setBlotterFilter} />}
            {bottomTab === "history" && <Blotter filter="closed" onFilterChange={setBlotterFilter} />}
            {bottomTab === "journal" && (
              <div className="h-full overflow-auto p-2 sm:p-3"><QuickJournalPanel symbol={symbol} /></div>
            )}
            {bottomTab === "notes" && (
              <div className="h-full overflow-auto p-2 sm:p-3"><WorkspaceNotes symbol={symbol} /></div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


import { useMarketCadence } from "@/lib/market-data/hooks";
export function TradingWorkspace({ fullscreen: _fullscreen }: { fullscreen?: boolean } = {}) {
  return (
    <PaperTradingProvider>
      <TradingWorkspaceInner />
      <WorkspaceCadence />
    </PaperTradingProvider>
  );
}

/** Registers Twelve Data workspace cadence ONLY when the active symbol is a
 *  Twelve Data market (forex/metals/indices). Crypto workspaces stream from
 *  Binance and don't need the forex poller. */
function WorkspaceCadence() {
  const { market } = usePaper();
  useMarketCadence("workspace", market !== "crypto");
  return null;
}

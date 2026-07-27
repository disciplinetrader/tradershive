import { useCallback, useMemo, useRef, useState } from "react";
import type { ChartHandle } from "@/components/chart/ChartEngine";
import { motion } from "framer-motion";
import { Activity, BarChart3, Camera, CandlestickChart, Check, ChevronDown, Clock, Keyboard, LineChart as LineChartIcon, Target } from "lucide-react";
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


import { ChartEngine } from "@/components/chart/ChartEngine";
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
import { closeTrade, listTrades } from "@/lib/paper-trading.functions";
import { useRiskMonitor } from "@/hooks/use-risk-monitor";
import { useSlTpMonitor } from "@/hooks/use-sl-tp-monitor";

const CHART_TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "30m", "1H", "4H", "1D", "1W"];

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

function TradingWorkspaceInner() {
  const qc = useQueryClient();
  const { symbol, symbolMeta, market, timeframe, setTimeframe, accountId, account } = usePaper();
  useSlTpMonitor(account);
  useRiskMonitor(account);
  const [enabled, setEnabled] = useState<Record<string, boolean>>({ ema: true, volume: true });
  const [chartType, setChartType] = useState<ChartType>("candles");
  const [smcOn, setSmcOn] = useState(false);
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

  const handleReady = useCallback((api: ChartHandle) => {
    chartApi.current = api;
    setAdapter((prev) => (prev === api.adapter ? prev : api.adapter));
    setTick((t) => t + 1);
  }, []);

  const activeTf: Timeframe = (CHART_TIMEFRAMES as string[]).includes(timeframe) ? (timeframe as Timeframe) : "1H";

  const chartSettings: ChartSettings = useMemo(
    () => ({ ...DEFAULT_CHART_SETTINGS, symbol, market, timeframe: activeTf, chartType }),
    [symbol, market, activeTf, chartType],
  );

  const indicators: IndicatorConfig[] = useMemo(() => {
    const base: IndicatorConfig[] = INDICATOR_TOGGLES.filter((i) => enabled[i.key]).map((i) => ({
      id: i.key, key: i.key, params: i.params, pane: i.pane, visible: true,
    }));
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

  const meta = symbolMeta ?? findSymbol(symbol);
  const decimals = meta?.decimals ?? 2;
  const last = quote?.last ?? meta?.refPrice ?? 0;
  const bid = quote?.bid ?? last;
  const ask = quote?.ask ?? last;
  const spread = quote?.spread ?? Math.max(0, ask - bid);

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
    onBuy: () => { emitTradeIntent({ kind: "focus_side", side: "long" }); toast.info("Buy side selected (Enter to submit)"); },
    onSell: () => { emitTradeIntent({ kind: "focus_side", side: "short" }); toast.info("Sell side selected"); },
    onClose: () => closeLast.mutate(),
    onScreenshot: screenshot,
    onPlanTrade: () => setPlannerActive((v) => !v),
    onToggleDrawings: () => setDrawingsHidden((v) => !v),
    onToggleReplay: () => toast.info("Replay toggle: coming in next phase"),
    onCancelOrders: () => toast.info("Cancel all pending orders: coming in next phase"),
  });

  const [rightOpen, setRightOpen] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);

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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2 text-[11px] font-semibold">
                <Clock className="h-3.5 w-3.5" /> {activeTf}
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

          {/* Right-aligned quick actions */}
          <div className="ml-auto flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={plannerActive ? "default" : "ghost"} size="sm"
                  className="h-7 gap-1 px-2 text-[11px]"
                  onClick={() => setPlannerActive((v) => !v)}
                >
                  <Target className="h-3.5 w-3.5" /> <span className="hidden lg:inline">Plan</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Plan Trade — click chart to place entry</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px]" onClick={screenshot}>
                  <Camera className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Screenshot (P)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px]" onClick={() => setShortcutsHelp((v) => !v)}>
                  <Keyboard className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Keyboard shortcuts</TooltipContent>
            </Tooltip>
            <Button
              variant="ghost" size="sm"
              className="h-7 gap-1 px-2 text-[11px]"
              onClick={() => setDetailsOpen((v) => !v)}
              aria-expanded={detailsOpen}
              title="Toggle account & market details"
            >
              <Activity className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Details</span>
              <ChevronDown className={cn("h-3 w-3 opacity-60 transition-transform", detailsOpen && "rotate-180")} />
            </Button>
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

        {/* ── Main workspace: chart dominates; right rail collapses ─────── */}
        <div
          className={cn(
            "grid min-h-0 flex-1 grid-cols-1 gap-0",
            rightOpen
              ? "md:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]"
              : "md:grid-cols-[minmax(0,1fr)_44px]",
          )}
        >
          <div className="relative flex min-h-[calc(100dvh-4.5rem)] flex-col border-r border-border/40">
            {/* Live indicator strip (thin) */}
            <div className="flex items-center gap-2 border-b border-border/40 bg-background/30 px-3 py-1 text-[10px] text-muted-foreground">
              <LineChartIcon className="h-3 w-3" />
              <span className="truncate">
                {activeIndicatorCount === 0 ? "No indicators active" : (
                  <>
                    {INDICATOR_TOGGLES.filter((i) => enabled[i.key]).map((i) => i.label).join(" · ")}
                    {smcOn && (activeIndicatorCount > 1 ? " · " : "") + "SMC/ICT"}
                  </>
                )}
              </span>
              <div className="ml-auto flex items-center gap-1">
                <Activity className="h-3 w-3 text-success animate-pulse" /> live
              </div>
            </div>

            {/* Chart canvas + overlays (fills remaining space) */}
            <div className="relative min-h-0 flex-1">
              <ChartEngine
                settings={chartSettings} indicators={indicators}
                onQuote={setQuote} onReady={handleReady} className="absolute inset-0"
              >
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
                            toast.info(`Alert armed at ${intent.price.toFixed(decimals)} — persistence in next phase`); break;
                          case "drawing":
                            toast.info("Drawing tools: use TradingView native palette (H to hide overlays)"); break;
                        }
                      }}
                    />
                  </>
                )}
              </ChartEngine>

              {shortcutsHelp && (
                <div className="absolute bottom-3 right-3 z-40 w-64 rounded-lg border border-border/60 bg-popover p-3 text-xs shadow-xl">
                  <div className="mb-2 flex items-center justify-between font-semibold">
                    <span>Shortcuts</span>
                    <button onClick={() => setShortcutsHelp(false)} className="text-muted-foreground hover:text-foreground">×</button>
                  </div>
                  {[
                    ["B", "Focus Buy"], ["S", "Focus Sell"], ["T", "Plan Trade tool"],
                    ["X", "Close last position"], ["C", "Cancel pending orders"],
                    ["R", "Toggle replay"], ["P", "Screenshot"], ["H", "Hide overlays"],
                    ["Ctrl/⌘+Enter", "Submit order"],
                  ].map(([k, l]) => (
                    <div key={k} className="flex items-center justify-between border-b border-border/30 py-1 last:border-b-0">
                      <span className="text-muted-foreground">{l}</span>
                      <kbd className="rounded border border-border/60 bg-muted px-1.5 py-0.5 font-mono text-[10px]">{k}</kbd>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right rail: collapsible order/trade panel */}
          {rightOpen ? (
            <div className="relative flex min-h-0 flex-col overflow-hidden bg-card/30">
              <button
                onClick={() => setRightOpen(false)}
                className="absolute right-1 top-1 z-10 grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label="Collapse trade panel"
                title="Collapse trade panel"
              >
                <ChevronDown className="h-4 w-4 -rotate-90" />
              </button>
              <div className="min-h-0 flex-1 overflow-auto p-2 sm:p-3">
                <OrderPanel />
              </div>
            </div>
          ) : (
            <button
              onClick={() => setRightOpen(true)}
              className="hidden md:flex flex-col items-center gap-2 border-l border-border/40 bg-card/20 py-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground transition hover:bg-card/40 hover:text-foreground"
              aria-label="Expand trade panel"
              title="Expand trade panel"
            >
              <ChevronDown className="h-4 w-4 rotate-90" />
              <span className="rotate-180 [writing-mode:vertical-rl]">Trade</span>
            </button>
          )}
        </div>

        {/* Bottom tabbed dock — positions, orders, history, watchlist */}
        <div className="border-t border-border/40 bg-card/30">
          <div className="hidden md:block">
            <MultiChartStrip panes={multiPanes} onChange={setMultiPanes} primarySymbol={symbol} />
          </div>
          <Tabs defaultValue="positions" className="w-full">
            <div className="border-t border-border/40 px-3 pt-1">
              <TabsList className="bg-transparent w-full justify-start overflow-x-auto no-scrollbar h-8">
                <TabsTrigger value="positions" className="text-xs">Positions</TabsTrigger>
                <TabsTrigger value="orders" className="text-xs">Orders</TabsTrigger>
                <TabsTrigger value="history" className="text-xs">History</TabsTrigger>
                <TabsTrigger value="watchlist" className="text-xs">Watchlist</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="positions" className="p-2 sm:p-3 max-h-[280px] overflow-auto"><PositionsTable /></TabsContent>
            <TabsContent value="orders" className="p-2 sm:p-3 max-h-[280px] overflow-auto"><OrdersTable /></TabsContent>
            <TabsContent value="history" className="p-2 sm:p-3 max-h-[280px] overflow-auto"><HistoryTable /></TabsContent>
            <TabsContent value="watchlist" className="p-2 sm:p-3 max-h-[280px] overflow-auto"><WatchlistPanel /></TabsContent>
          </Tabs>
        </div>

        <SymbolSearch open={symbolSearchOpen} onOpenChange={setSymbolSearchOpen} />
      </div>
    </TooltipProvider>
  );
}

export function TradingWorkspace({ fullscreen: _fullscreen }: { fullscreen?: boolean } = {}) {
  return (
    <PaperTradingProvider>
      <TradingWorkspaceInner />
    </PaperTradingProvider>
  );
}

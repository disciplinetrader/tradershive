import { useCallback, useMemo, useRef, useState } from "react";
import type { ChartHandle } from "@/components/chart/ChartEngine";
import { motion } from "framer-motion";
import { Activity, Camera, ChevronDown, Eye, EyeOff, Keyboard, LineChart as LineChartIcon, Target } from "lucide-react";
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
import type { ChartSettings, IndicatorConfig, IndicatorKey } from "@/lib/chart/types";
import type { Quote, Timeframe } from "@/lib/market-data/types";

import { TradePlanner } from "@/components/trading/chart/TradePlanner";
import { ChartContextMenu } from "@/components/trading/chart/ChartContextMenu";
import { PositionLinesLive, type OpenTradeLine } from "@/components/trading/chart/PositionLinesLive";
import { TodayPnLWidget } from "@/components/trading/TodayPnLWidget";
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

const CHART_TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "30m", "1H", "4H", "1D", "1W"];

const INDICATOR_TOGGLES: { key: IndicatorKey; label: string; params: Record<string, number>; pane: "price" | "sub" }[] = [
  { key: "ema", label: "EMA 20", params: { length: 20 }, pane: "price" },
  { key: "sma", label: "SMA 50", params: { length: 50 }, pane: "price" },
  { key: "bollinger", label: "Bollinger", params: { length: 20, stddev: 2 }, pane: "price" },
  { key: "vwap", label: "VWAP", params: {}, pane: "price" },
  { key: "volume", label: "Volume", params: {}, pane: "sub" },
  { key: "rsi", label: "RSI", params: { length: 14 }, pane: "sub" },
  { key: "macd", label: "MACD", params: { fast: 12, slow: 26, signal: 9 }, pane: "sub" },
];

function TradingWorkspaceInner() {
  const qc = useQueryClient();
  const { symbol, symbolMeta, market, timeframe, setTimeframe, accountId, account } = usePaper();
  const [enabled, setEnabled] = useState<Record<string, boolean>>({ ema: true, volume: true });
  const [quote, setQuote] = useState<Quote | null>(null);
  const [adapter, setAdapter] = useState<import("@/lib/chart/adapter").ChartAdapter | null>(null);
  const chartApi = useRef<ChartHandle | null>(null);
  const [tick, setTick] = useState(0);
  const [symbolSearchOpen, setSymbolSearchOpen] = useState(false);
  const [plannerActive, setPlannerActive] = useState(false);
  const [drawingsHidden, setDrawingsHidden] = useState(false);
  const [shortcutsHelp, setShortcutsHelp] = useState(false);

  const handleReady = useCallback((api: ChartHandle) => {
    chartApi.current = api;
    setAdapter((prev) => (prev === api.adapter ? prev : api.adapter));
    setTick((t) => t + 1);
  }, []);

  const activeTf: Timeframe = (CHART_TIMEFRAMES as string[]).includes(timeframe) ? (timeframe as Timeframe) : "1H";

  const chartSettings: ChartSettings = useMemo(
    () => ({ ...DEFAULT_CHART_SETTINGS, symbol, market, timeframe: activeTf }),
    [symbol, market, activeTf],
  );

  const indicators: IndicatorConfig[] = useMemo(
    () => INDICATOR_TOGGLES.filter((i) => enabled[i.key]).map((i) => ({
      id: i.key, key: i.key, params: i.params, pane: i.pane, visible: true,
    })),
    [enabled],
  );

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

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-0 flex-col gap-3 p-3">
        <TopToolbar />
        <TodayPnLWidget
          dailyTargetPct={Number(account?.max_daily_risk_pct ?? 5)}
          dailyLossLimitPct={Number(account?.max_daily_risk_pct ?? 5)}
        />
        <AccountSummary />

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
          <GlassCard className="relative flex h-[600px] flex-col overflow-hidden p-0">
            {/* Chart header */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 px-3 py-2">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSymbolSearchOpen(true)}
                  className="group flex items-baseline gap-2 rounded-md border border-transparent px-1.5 py-1 transition hover:border-border/60 hover:bg-background/60"
                  title="Change symbol"
                >
                  <span className="text-sm font-bold tracking-wide">{symbol}</span>
                  <span className="text-[11px] uppercase text-muted-foreground">{meta?.name}</span>
                  <ChevronDown className="h-3 w-3 text-muted-foreground opacity-60 group-hover:opacity-100" />
                </button>
                <div className="flex items-baseline gap-3 tabular-nums">
                  <motion.span
                    key={last} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }}
                    className={cn("text-lg font-bold", quote?.last && quote.last >= bid ? "text-success" : "text-danger")}
                  >{last.toFixed(decimals)}</motion.span>
                  <span className="text-[11px] text-muted-foreground">Bid <span className="text-foreground">{bid.toFixed(decimals)}</span></span>
                  <span className="text-[11px] text-muted-foreground">Ask <span className="text-foreground">{ask.toFixed(decimals)}</span></span>
                  <Badge variant="outline" className="text-[10px]">Spread {spread.toFixed(decimals)}</Badge>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={plannerActive ? "default" : "ghost"} size="sm"
                      className="h-7 gap-1 px-2 text-[11px]"
                      onClick={() => setPlannerActive((v) => !v)}
                    >
                      <Target className="h-3.5 w-3.5" /> Plan Trade
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Click a point on the chart to place Entry, then drag SL / TP (T)</TooltipContent>
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
                <Tabs value={activeTf} onValueChange={(v) => setTimeframe(v)}>
                  <TabsList className="h-7 bg-background/60">
                    {CHART_TIMEFRAMES.map((tf) => (
                      <TabsTrigger key={tf} value={tf} className="h-6 px-2 text-[11px]">{tf}</TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>
            </div>

            {/* Indicator toggle strip */}
            <div className="flex flex-wrap items-center gap-1 border-b border-border/50 px-3 py-1.5">
              <LineChartIcon className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
              {INDICATOR_TOGGLES.map((i) => {
                const on = !!enabled[i.key];
                return (
                  <Button
                    key={i.key} variant={on ? "default" : "ghost"} size="sm"
                    className="h-6 gap-1 px-2 text-[11px]"
                    onClick={() => setEnabled((s) => ({ ...s, [i.key]: !on }))}
                  >
                    {on ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}{i.label}
                  </Button>
                );
              })}
              <div className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
                <Activity className="h-3 w-3 text-success animate-pulse" /> live
              </div>
            </div>

            {/* Chart canvas + overlays */}
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
          </GlassCard>

          <div className="flex min-h-0 flex-col gap-3">
            <OrderPanel />
          </div>
        </div>

        <GlassCard className="min-h-[240px] p-0">
          <Tabs defaultValue="positions" className="w-full">
            <div className="border-b border-border/50 px-3 pt-2">
              <TabsList className="bg-background/60">
                <TabsTrigger value="positions" className="text-xs">Positions</TabsTrigger>
                <TabsTrigger value="orders" className="text-xs">Orders</TabsTrigger>
                <TabsTrigger value="history" className="text-xs">History</TabsTrigger>
                <TabsTrigger value="watchlist" className="text-xs">Watchlist</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="positions" className="p-3"><PositionsTable /></TabsContent>
            <TabsContent value="orders" className="p-3"><OrdersTable /></TabsContent>
            <TabsContent value="history" className="p-3"><HistoryTable /></TabsContent>
            <TabsContent value="watchlist" className="p-3"><WatchlistPanel /></TabsContent>
          </Tabs>
        </GlassCard>

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

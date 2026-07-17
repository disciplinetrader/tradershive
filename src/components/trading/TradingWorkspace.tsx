import { useCallback, useMemo, useState } from "react";
import type { ChartHandle } from "@/components/chart/ChartEngine";
import { motion } from "framer-motion";
import { Activity, Eye, EyeOff, LineChart as LineChartIcon } from "lucide-react";

import { PaperTradingProvider, usePaper } from "@/components/paper-trading/context";
import { TopToolbar } from "@/components/paper-trading/TopToolbar";
import { AccountSummary } from "@/components/paper-trading/AccountSummary";
import { OrderPanel } from "@/components/paper-trading/OrderPanel";
import { PositionsTable } from "@/components/paper-trading/PositionsTable";
import { OrdersTable } from "@/components/paper-trading/OrdersTable";
import { HistoryTable } from "@/components/paper-trading/HistoryTable";
import { WatchlistPanel } from "@/components/paper-trading/WatchlistPanel";
import { SymbolSearch } from "@/components/paper-trading/SymbolSearch";
import { ChevronDown } from "lucide-react";

import { ChartEngine } from "@/components/chart/ChartEngine";
import { OrderLinesOverlay, type OrderLine } from "@/components/chart/OrderLinesOverlay";
import { DEFAULT_CHART_SETTINGS } from "@/lib/chart/constants";
import type { ChartSettings, IndicatorConfig, IndicatorKey } from "@/lib/chart/types";
import type { Quote, Timeframe } from "@/lib/market-data/types";

import { GlassCard } from "@/components/ui/glass-card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { findSymbol } from "@/lib/paper-trading/symbols";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listTrades } from "@/lib/paper-trading.functions";

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
  const { symbol, symbolMeta, market, timeframe, setTimeframe, accountId } = usePaper();
  const [enabled, setEnabled] = useState<Record<string, boolean>>({ ema: true, volume: true });
  const [quote, setQuote] = useState<Quote | null>(null);
  const [adapter, setAdapter] = useState<import("@/lib/chart/adapter").ChartAdapter | null>(null);
  const [tick, setTick] = useState(0);
  const [symbolSearchOpen, setSymbolSearchOpen] = useState(false);
  const handleReady = useCallback((api: ChartHandle) => {
    setAdapter((prev) => (prev === api.adapter ? prev : api.adapter));
    setTick((t) => t + 1);
  }, []);

  const activeTf: Timeframe = (CHART_TIMEFRAMES as string[]).includes(timeframe)
    ? (timeframe as Timeframe)
    : "1H";

  const chartSettings: ChartSettings = useMemo(
    () => ({
      ...DEFAULT_CHART_SETTINGS,
      symbol,
      market,
      timeframe: activeTf,
    }),
    [symbol, market, activeTf],
  );

  const indicators: IndicatorConfig[] = useMemo(
    () =>
      INDICATOR_TOGGLES.filter((i) => enabled[i.key]).map((i) => ({
        id: i.key,
        key: i.key,
        params: i.params,
        pane: i.pane,
        visible: true,
      })),
    [enabled],
  );

  // Order lines from open positions on this symbol
  const fetchOpen = useServerFn(listTrades);
  type OpenTrade = {
    id: string;
    symbol: string;
    entry_price: number;
    stop_loss: number | null;
    take_profit: number | null;
    direction: "long" | "short";
  };
  const { data: openTradesAll } = useQuery({
    queryKey: ["paper", "trades", accountId, "open"],
    queryFn: () =>
      fetchOpen({ data: { account_id: accountId!, status: "open" } }) as unknown as Promise<OpenTrade[]>,
    enabled: !!accountId,
    refetchInterval: 4000,
  });
  const openTrades = useMemo(
    () => (openTradesAll ?? []).filter((t) => t.symbol === symbol),
    [openTradesAll, symbol],
  );

  const _qc = useQueryClient();
  const orderLines: OrderLine[] = useMemo(() => {
    if (!openTrades) return [];
    const out: OrderLine[] = [];
    for (const t of openTrades) {
      out.push({ id: `${t.id}-entry`, kind: "entry", price: t.entry_price, editable: false });
      if (t.stop_loss != null) out.push({ id: `${t.id}-sl`, kind: "sl", price: t.stop_loss, editable: false });
      if (t.take_profit != null) out.push({ id: `${t.id}-tp`, kind: "tp", price: t.take_profit, editable: false });
    }
    return out;
  }, [openTrades]);

  const meta = symbolMeta ?? findSymbol(symbol);
  const decimals = meta?.decimals ?? 2;
  const last = quote?.last ?? meta?.refPrice ?? 0;
  const bid = quote?.bid ?? last;
  const ask = quote?.ask ?? last;
  const spread = quote?.spread ?? Math.max(0, ask - bid);

  return (
    <div className="flex min-h-0 flex-col gap-3 p-3">
      {/* Toolbar */}
      <TopToolbar />

      {/* Account KPI strip */}
      <AccountSummary />

      {/* Main grid: chart + order panel */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <GlassCard className="relative flex h-[600px] flex-col overflow-hidden p-0">
          {/* Chart header */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 px-3 py-2">
            <div className="flex items-center gap-3">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-bold tracking-wide">{symbol}</span>
                <span className="text-[11px] uppercase text-muted-foreground">{meta?.name}</span>
              </div>
              <div className="flex items-baseline gap-3 tabular-nums">
                <motion.span
                  key={last}
                  initial={{ opacity: 0.4 }}
                  animate={{ opacity: 1 }}
                  className={cn(
                    "text-lg font-bold",
                    quote?.last && quote.last >= bid ? "text-emerald-400" : "text-rose-400",
                  )}
                >
                  {last.toFixed(decimals)}
                </motion.span>
                <span className="text-[11px] text-muted-foreground">
                  Bid <span className="text-foreground">{bid.toFixed(decimals)}</span>
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Ask <span className="text-foreground">{ask.toFixed(decimals)}</span>
                </span>
                <Badge variant="outline" className="text-[10px]">Spread {spread.toFixed(decimals)}</Badge>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Timeframe selector */}
              <Tabs value={activeTf} onValueChange={(v) => setTimeframe(v)}>
                <TabsList className="h-7 bg-background/60">
                  {CHART_TIMEFRAMES.map((tf) => (
                    <TabsTrigger key={tf} value={tf} className="h-6 px-2 text-[11px]">
                      {tf}
                    </TabsTrigger>
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
                  key={i.key}
                  variant={on ? "default" : "ghost"}
                  size="sm"
                  className="h-6 gap-1 px-2 text-[11px]"
                  onClick={() => setEnabled((s) => ({ ...s, [i.key]: !on }))}
                >
                  {on ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                  {i.label}
                </Button>
              );
            })}
            <div className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
              <Activity className="h-3 w-3 text-emerald-400 animate-pulse" />
              live
            </div>
          </div>

          {/* Chart canvas */}
          <div className="relative min-h-0 flex-1">
            <ChartEngine
              settings={chartSettings}
              indicators={indicators}
              onQuote={setQuote}
              onReady={handleReady}
              className="absolute inset-0"
            >
              <OrderLinesOverlay
                adapter={adapter}
                lines={orderLines}
                tick={tick + (openTrades?.length ?? 0)}
              />
            </ChartEngine>
          </div>
        </GlassCard>

        {/* Right column — order panel */}
        <div className="flex min-h-0 flex-col gap-3">
          <OrderPanel />
        </div>
      </div>

      {/* Bottom tabs: positions / orders / history / watchlist */}
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
    </div>
  );
}

export function TradingWorkspace({ fullscreen: _fullscreen }: { fullscreen?: boolean } = {}) {
  return (
    <PaperTradingProvider>
      <TradingWorkspaceInner />
    </PaperTradingProvider>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ChartEngine, type ChartHandle } from "@/components/chart/ChartEngine";
import { ChartToolbar } from "@/components/chart/ChartToolbar";
import { Watchlist } from "@/components/chart/Watchlist";
import { TradePanel } from "@/components/chart/TradePanel";
import { BottomTabs } from "@/components/chart/BottomTabs";
import { AlertsDialog } from "@/components/chart/AlertsDialog";
import { OrderLinesOverlay, type OrderLine } from "@/components/chart/OrderLinesOverlay";
import { DEFAULT_CHART_SETTINGS, INDICATORS } from "@/lib/chart/constants";
import type { ChartSettings, DrawingTool, IndicatorConfig, IndicatorKey } from "@/lib/chart/types";
import { saveLayout, pushRecentSymbol, uploadChartScreenshot } from "@/lib/chart/storage";

interface Props {
  fullscreen?: boolean;
  initial?: Partial<ChartSettings>;
}

/**
 * Professional trading workspace. Layout:
 *   Top Toolbar
 *   Watchlist | Chart Area (grid) | Trade Panel
 *   Bottom Tabs
 * Consumes ONLY MarketDataEngine via <ChartEngine />.
 */
export function ChartWorkspace({ fullscreen, initial }: Props) {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<ChartSettings>({ ...DEFAULT_CHART_SETTINGS, ...initial });
  const [indicators, setIndicators] = useState<IndicatorConfig[]>([]);
  const [grid, setGrid] = useState("1x1");
  const [tool, setTool] = useState<DrawingTool>("cursor");
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [chartApi, setChartApi] = useState<ChartHandle | null>(null);
  const [orderLines, setOrderLines] = useState<OrderLine[]>([]);

  // Load open paper positions for the active symbol → render entry/SL/TP lines
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { setOrderLines([]); return; }
      const { data } = await supabase
        .from("paper_trades")
        .select("id,entry_price,stop_loss,take_profit,direction")
        .eq("user_id", u.user.id)
        .eq("symbol", settings.symbol)
        .eq("status", "open");
      if (cancelled || !data) return;
      const lines: OrderLine[] = [];
      for (const t of data) {
        lines.push({ id: `${t.id}-entry`, kind: "entry", price: Number(t.entry_price), label: `${t.direction.toUpperCase()} ENTRY`, editable: false });
        if (t.stop_loss != null) lines.push({ id: `${t.id}-sl`, kind: "sl", price: Number(t.stop_loss), label: "SL" });
        if (t.take_profit != null) lines.push({ id: `${t.id}-tp`, kind: "tp", price: Number(t.take_profit), label: "TP" });
      }
      setOrderLines(lines);
    }
    void load();
    const ch = supabase
      .channel(`paper_trades:${settings.symbol}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "paper_trades", filter: `symbol=eq.${settings.symbol}` }, () => void load())
      .subscribe();
    return () => { cancelled = true; void supabase.removeChannel(ch); };
  }, [settings.symbol]);

  const handleOrderLineChange = useCallback((id: string, price: number) => {
    setOrderLines((prev) => prev.map((l) => (l.id === id ? { ...l, price } : l)));
  }, []);
  const handleOrderLineCommit = useCallback(async (id: string, price: number) => {
    const [tradeId, kind] = id.split(/-(sl|tp|entry)$/);
    if (!tradeId || (kind !== "sl" && kind !== "tp")) return;
    const patch = kind === "sl" ? { stop_loss: price } : { take_profit: price };
    const { error } = await supabase.from("paper_trades").update(patch).eq("id", tradeId);
    if (error) toast.error(`Failed to update ${kind.toUpperCase()}: ${error.message}`);
    else toast.success(`${kind.toUpperCase()} moved to ${price.toFixed(4)}`);
  }, []);

  const updateSettings = useCallback((patch: Partial<ChartSettings>) => setSettings((s) => ({ ...s, ...patch })), []);

  // Record recent symbol
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) void pushRecentSymbol(data.user.id, settings.symbol, settings.timeframe);
    });
  }, [settings.symbol, settings.timeframe]);

  // Hotkeys
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTool("cursor");
      if (e.key === "+") chartApi?.fitContent();
      if (e.key === " ") { setTool("cursor"); e.preventDefault(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void handleSaveLayout(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartApi, settings, indicators]);

  function addIndicator(key: IndicatorKey) {
    const meta = INDICATORS.find((i) => i.key === key)!;
    setIndicators((prev) => [...prev, {
      id: `${key}-${Date.now()}`, key, params: { ...meta.defaults }, pane: meta.pane, visible: true,
    }]);
  }
  function removeIndicator(id: string) { setIndicators((prev) => prev.filter((i) => i.id !== id)); }

  async function handleScreenshot() {
    if (!chartApi) return;
    const blob = await chartApi.screenshot();
    if (!blob) return toast.error("Screenshot failed");
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    const path = await uploadChartScreenshot(data.user.id, blob, `${settings.symbol.replace(/[^A-Z0-9]/gi, "_")}.png`);
    if (path) toast.success("Screenshot saved to your library");
  }

  async function handleSaveLayout() {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    const row = await saveLayout({
      user_id: data.user.id, name: `${settings.symbol} · ${settings.timeframe}`, grid,
      symbols: [settings.symbol], timeframes: [settings.timeframe], indicators, settings,
    } as any);
    if (row) toast.success("Layout saved");
  }

  const gridCells = useMemo(() => {
    const [colsStr, rowsStr] = grid.split("x");
    const cols = Number(colsStr) || 1, rows = Number(rowsStr) || 1;
    return { cols, rows, cells: cols * rows };
  }, [grid]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <ChartToolbar
        settings={settings} onChange={updateSettings}
        indicators={indicators} onAddIndicator={addIndicator} onRemoveIndicator={removeIndicator}
        grid={grid} onGridChange={setGrid}
        activeTool={tool} onToolChange={setTool}
        onScreenshot={handleScreenshot} onSaveLayout={handleSaveLayout}
        onFullscreen={() => navigate({ to: "/charts/fullscreen" })}
        onOpenAlerts={() => setAlertsOpen(true)}
        onOpenReplay={() => navigate({ to: "/replay" })}
      />
      <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)_280px]">
        {!fullscreen ? (
          <aside className="min-h-0 border-r border-border/60 bg-card/30">
            <Watchlist symbol={settings.symbol}
              onPick={(s) => updateSettings({ symbol: s.symbol, market: (s as any).market })} />
          </aside>
        ) : <div />}

        <section className="min-h-0">
          <div className="grid h-full min-h-0" style={{ gridTemplateColumns: `repeat(${gridCells.cols}, minmax(0,1fr))`, gridTemplateRows: `repeat(${gridCells.rows}, minmax(0,1fr))` }}>
            {Array.from({ length: gridCells.cells }, (_, i) => (
              <div key={i} className="relative min-h-0 border-r border-b border-border/40 last:border-r-0">
                {i === 0 ? (
                  <ChartEngine settings={settings} indicators={indicators} onReady={setChartApi}>
                    <OrderLinesOverlay
                      adapter={chartApi?.adapter ?? null}
                      lines={orderLines}
                      tick={chartApi?.candles.length ?? 0}
                      onChange={handleOrderLineChange}
                      onCommit={handleOrderLineCommit}
                    />
                  </ChartEngine>
                ) : (
                  <ChartEngine
                    settings={{ ...settings, symbol: settings.symbol, timeframe: settings.timeframe }}
                    indicators={indicators}
                  />
                )}
              </div>
            ))}
          </div>
        </section>

        {!fullscreen ? (
          <aside className="min-h-0">
            <TradePanel symbol={settings.symbol} market={settings.market} />
          </aside>
        ) : <div />}
      </div>
      {!fullscreen ? (
        <div className="h-[210px] shrink-0 border-t border-border/60 bg-card/30">
          <BottomTabs />
        </div>
      ) : null}
      <AlertsDialog open={alertsOpen} onOpenChange={setAlertsOpen} symbol={settings.symbol} />
    </div>
  );
}

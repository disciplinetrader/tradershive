import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ChartEngine, type ChartHandle } from "@/components/chart/ChartEngine";
import { ChartToolbar } from "@/components/chart/ChartToolbar";
import { LeftToolRail } from "@/components/chart/LeftToolRail";
import { RightIconRail } from "@/components/chart/RightIconRail";
import { ChartInfoBar } from "@/components/chart/ChartInfoBar";
import { RangeBar } from "@/components/chart/RangeBar";
import { Watchlist } from "@/components/chart/Watchlist";
import { TradePanel } from "@/components/chart/TradePanel";
import { BottomTabs } from "@/components/chart/BottomTabs";
import { AlertsDialog } from "@/components/chart/AlertsDialog";
import { ChartTradingOverlay } from "@/components/chart/ChartTradingOverlay";
import { DEFAULT_CHART_SETTINGS, INDICATORS } from "@/lib/chart/constants";
import type { ChartSettings, DrawingTool, IndicatorConfig, IndicatorKey } from "@/lib/chart/types";
import { saveLayout, pushRecentSymbol, uploadChartScreenshot } from "@/lib/chart/storage";
import { ChevronDown, ChevronUp, Plus, MoreHorizontal, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePersistentDisclosure } from "@/hooks/use-persistent-disclosure";


interface Props {
  fullscreen?: boolean;
  initial?: Partial<ChartSettings>;
}

type RightTab = "watchlist" | "trade";

/**
 * TradingView-style Trading Workspace:
 *   ┌──────────── top toolbar ────────────┐
 *   │ left rail │  chart  │ right panel   │ right rail
 *   │           │  info   │ (watchlist)   │
 *   │           │  candle │───────────────│
 *   │           │  ...    │ trade panel   │
 *   │           │ range bar             │
 *   ├─────────── bottom tabs (positions / orders / history) ───────────┤
 * All market data flows through MarketDataEngine via <ChartEngine />.
 */
export function ChartWorkspace({ fullscreen, initial }: Props) {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<ChartSettings>({ ...DEFAULT_CHART_SETTINGS, ...initial });
  const [indicators, setIndicators] = useState<IndicatorConfig[]>([]);
  const [grid, setGrid] = useState("1x1");
  const [tool, setTool] = useState<DrawingTool>("cursor");
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [chartApi, setChartApi] = useState<ChartHandle | null>(null);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  // Right panel + bottom tabs default collapsed for first-time users so the
  // chart itself is the primary focus; choice is persisted after first toggle.
  const [rightOpen, setRightOpen] = usePersistentDisclosure("chart-right", false);
  const [rightTab, setRightTab] = useState<RightTab>("watchlist");
  const [bottomOpen, setBottomOpen] = usePersistentDisclosure("chart-bottom", false);

  const updateSettings = useCallback((patch: Partial<ChartSettings>) => setSettings((s) => ({ ...s, ...patch })), []);


  // Persist recent symbol
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) void pushRecentSymbol(data.user.id, settings.symbol, settings.timeframe);
    });
  }, [settings.symbol, settings.timeframe]);

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

  const lastCandle = chartApi?.candles?.[chartApi.candles.length - 1] ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <ChartToolbar
        settings={settings} onChange={updateSettings}
        indicators={indicators} onAddIndicator={addIndicator} onRemoveIndicator={removeIndicator}
        grid={grid} onGridChange={setGrid}
        activeTool={tool} onToolChange={setTool}
        onScreenshot={handleScreenshot} onSaveLayout={handleSaveLayout}
        onFullscreen={() => navigate({ to: "/trading/fullscreen" })}
        onOpenAlerts={() => setAlertsOpen(true)}
        onOpenReplay={() => navigate({ to: "/replay" })}
        onToggleRightPanel={() => setRightOpen((v) => !v)}
        rightPanelOpen={rightOpen}
      />

      <div className="flex min-h-0 flex-1">
        {/* Left drawing tool rail — hidden on small screens */}
        {!fullscreen ? <div className="hidden md:block"><LeftToolRail active={tool} onChange={setTool} /></div> : null}


        {/* Chart + right panel */}
        <div className="flex min-h-0 flex-1">
          {/* Chart column */}
          <section className="relative flex min-h-0 flex-1 flex-col">
            <div className="relative min-h-0 flex-1">
              <div className="grid h-full min-h-0"
                style={{ gridTemplateColumns: `repeat(${gridCells.cols}, minmax(0,1fr))`, gridTemplateRows: `repeat(${gridCells.rows}, minmax(0,1fr))` }}>
                {Array.from({ length: gridCells.cells }, (_, i) => (
                  <div key={i} className="relative min-h-0 border-r border-b border-border/40 last:border-r-0">
                    {i === 0 ? (
                      <>
                        <ChartInfoBar
                          symbol={settings.symbol}
                          timeframe={settings.timeframe}
                          market={settings.market}
                          last={lastCandle}
                        />
                        <ChartEngine
                          settings={settings}
                          indicators={indicators}
                          onReady={setChartApi}
                          onQuote={(q) => setLivePrice(q?.last ?? null)}
                        >
                          <ChartTradingOverlay
                            adapter={chartApi?.adapter ?? null}
                            symbol={settings.symbol}
                            tick={chartApi?.candles.length ?? 0}
                            livePrice={livePrice}
                          />
                        </ChartEngine>
                      </>
                    ) : (
                      <ChartEngine
                        settings={{ ...settings, symbol: settings.symbol, timeframe: settings.timeframe }}
                        indicators={indicators}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
            {!fullscreen ? <RangeBar /> : null}
          </section>

          {/* Right panel: Watchlist (default) with tab to Trade */}
          {!fullscreen && rightOpen ? (
            <aside className="hidden min-h-0 w-[240px] shrink-0 flex-col border-l border-border/60 bg-surface md:flex lg:w-[260px] xl:w-[280px]">

              <div className="flex h-9 items-center gap-1 border-b border-border/60 px-2 text-[11px]">
                <RightTabButton active={rightTab === "watchlist"} onClick={() => setRightTab("watchlist")}>
                  <span className="mr-1 inline-block h-2 w-2 rounded-full bg-danger" />
                  Red list
                  <ChevronDown className="ml-1 h-3 w-3 opacity-60" />
                </RightTabButton>
                <RightTabButton active={rightTab === "trade"} onClick={() => setRightTab("trade")}>
                  Trade
                </RightTabButton>
                <div className="ml-auto flex items-center gap-0.5 text-muted-foreground">
                  <button aria-label="Add symbol" title="Add symbol" className="grid h-6 w-6 place-items-center rounded hover:bg-background/60 hover:text-foreground"><Plus className="h-3.5 w-3.5" /></button>
                  <button aria-label="Sections" title="Sections" className="grid h-6 w-6 place-items-center rounded hover:bg-background/60 hover:text-foreground"><LayoutGrid className="h-3.5 w-3.5" /></button>
                  <button aria-label="More" title="More" className="grid h-6 w-6 place-items-center rounded hover:bg-background/60 hover:text-foreground"><MoreHorizontal className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                {rightTab === "watchlist" ? (
                  <Watchlist symbol={settings.symbol}
                    onPick={(s) => updateSettings({ symbol: s.symbol, market: (s as any).market })} />
                ) : (
                  <div className="h-full overflow-y-auto">
                    <TradePanel symbol={settings.symbol} market={settings.market} />
                  </div>
                )}
              </div>
            </aside>
          ) : null}
        </div>

        {/* Right icon rail */}
        {/* Right icon rail — hidden on small screens */}
        {!fullscreen ? (
          <div className="hidden md:block">
            <RightIconRail
              active={rightTab}
              onSelect={(k) => {
                if (k === "watchlist") { setRightOpen(true); setRightTab("watchlist"); }
                else if (k === "alerts") setAlertsOpen(true);
                else if (k === "ai") navigate({ to: "/ai/chat" });
                else if (k === "notes") { setRightOpen(true); setRightTab("trade"); }
              }}
            />
          </div>
        ) : null}

      </div>

      {/* Bottom tabs */}
      {!fullscreen ? (
        <div className={cn("shrink-0 border-t border-border/60 bg-surface hidden md:block", bottomOpen ? "h-[220px]" : "h-8")}>
          <div className="flex h-8 items-center gap-2 border-b border-border/60 px-2 text-[11px] text-muted-foreground">
            <span className="font-semibold uppercase tracking-wider">Trading Panel</span>
            <button
              onClick={() => setBottomOpen((v) => !v)}
              className="ml-auto grid h-6 w-6 place-items-center rounded hover:bg-background/60 hover:text-foreground"
              title={bottomOpen ? "Collapse" : "Expand"}
            >
              {bottomOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
            </button>
          </div>
          {bottomOpen ? (
            <div className="h-[calc(100%-2rem)] overflow-hidden">
              <BottomTabs symbol={settings.symbol} />
            </div>
          ) : null}
        </div>
      ) : null}

      <AlertsDialog open={alertsOpen} onOpenChange={setAlertsOpen} symbol={settings.symbol} />
    </div>
  );
}

function RightTabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex h-7 items-center rounded px-2 text-[11px] font-semibold transition",
        active ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

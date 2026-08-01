/**
 * Phase B · Studio chart — full charting surface over the deterministic
 * replay projection.
 *
 * Data still comes exclusively from `view.candles` (what the clock has
 * consumed plus the forming bar); nothing here fetches, and the chart can
 * never reveal a future bar. Higher display timeframes are folded from those
 * same bars via `aggregateCandles`.
 *
 * On top of that projection it mounts the same feature layer as the live
 * terminal: drawings (with persistence + object tree) and indicators.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Eye, EyeOff, LineChart, Shapes } from "lucide-react";

import { createLightweightAdapter } from "@/lib/chart/adapters/lightweight";
import type { ChartAdapter } from "@/lib/chart/adapter";
import type { ChartSettings, IndicatorConfig, IndicatorKey } from "@/lib/chart/types";
import type { ToolId } from "@/lib/chart/drawings/types";
import { INDICATOR_TOGGLES } from "@/lib/chart/indicator-registry";
import { DrawingStore } from "@/lib/chart/drawings/store";
import { aggregatableFrom, aggregateCandles } from "@/lib/replay/aggregate";
import type { Candle, Timeframe } from "@/lib/market-data/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { DrawingToolRail } from "@/components/chart/DrawingToolRail";
import { ChartTextEditor } from "@/components/chart/ChartTextEditor";
import { ObjectTree } from "@/components/chart/ObjectTree";
import { useChartDrawings } from "@/components/chart/useChartDrawings";

import { StudioTradeLayer, type ArmedOrder } from "./StudioTradeLayer";
import { useReplayStudio } from "./context";

/** Decimals inferred from price magnitude — FX pairs need more than indices. */
function decimalsFor(price: number | null): number {
  if (price == null || !Number.isFinite(price)) return 2;
  const abs = Math.abs(price);
  if (abs >= 1000) return 2;
  if (abs >= 100) return 3;
  if (abs >= 1) return 5;
  return 6;
}

export function StudioChart({ onAdapterReady }: { onAdapterReady?: (a: ChartAdapter | null) => void }) {
  const {
    view, sessionId, riskPercent, setRiskPercent, placeMarketOrder, sizeForRisk, price: livePrice,
  } = useReplayStudio();
  const [armed, setArmed] = useState<ArmedOrder | null>(null);
  const tradingLive = view?.transport.lifecycle !== "completed";
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartWrapRef = useRef<HTMLDivElement | null>(null);
  const adapterRef = useRef<ChartAdapter | null>(null);
  const [adapter, setAdapter] = useState<ChartAdapter | null>(null);
  const fittedRef = useRef(false);

  const symbol = view?.dataset.label.split(" ")[0] ?? "";
  const baseTf = (view?.dataset.timeframe ?? "5m") as Timeframe;

  // ---- display timeframe (folded from the base, never re-fetched) ---------
  const [displayTf, setDisplayTf] = useState<Timeframe>(baseTf);
  useEffect(() => { setDisplayTf(baseTf); }, [baseTf]);
  const timeframeOptions = useMemo(() => aggregatableFrom(baseTf), [baseTf]);

  // ---- indicators ---------------------------------------------------------
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const indicators: IndicatorConfig[] = useMemo(() => {
    const base: IndicatorConfig[] = INDICATOR_TOGGLES.filter((i) => enabled[i.key]).map((i) => ({
      id: i.key, key: i.key, params: { ...i.params }, pane: i.pane, visible: true,
    }));
    // Volume is always declared so the adapter can tell "off" from "absent".
    if (!enabled.volume) base.push({ id: "volume", key: "volume", params: {}, pane: "sub", visible: false });
    return base;
  }, [enabled]);
  const activeIndicatorCount = Object.values(enabled).filter(Boolean).length;

  // ---- drawings -----------------------------------------------------------
  const storeRef = useRef<DrawingStore | null>(null);
  if (!storeRef.current) storeRef.current = new DrawingStore();
  const drawingStore = storeRef.current;

  const [activeTool, setActiveTool] = useState<ToolId>("cursor");
  const [magnet, setMagnet] = useState(false);
  const [drawingsHidden, setDrawingsHidden] = useState(false);
  const [drawingsLocked, setDrawingsLocked] = useState(false);
  const [objectTreeOpen, setObjectTreeOpen] = useState(false);
  const [chartBounds, setChartBounds] = useState({ width: 0, height: 0 });

  // Drawings persist per replay session, not per symbol: two backtests on the
  // same pair are different pieces of work and must not share annotations.
  useEffect(() => {
    if (sessionId) drawingStore.setScope(`replay:${sessionId}`);
  }, [drawingStore, sessionId]);

  const candles: Candle[] = useMemo(() => {
    const raw = (view?.candles ?? []) as unknown as Candle[];
    return aggregateCandles(raw, baseTf, displayTf);
  }, [view?.candles, baseTf, displayTf]);

  const lastPrice = candles.length ? candles[candles.length - 1].close : null;
  const decimals = decimalsFor(lastPrice);

  const settings: ChartSettings = useMemo(
    () => ({
      chartType: "candles",
      timeframe: displayTf,
      symbol,
      priceScale: "auto",
      crosshair: "normal",
      showGrid: true,
      showVolume: false,
      sessionShading: false,
      autoScale: true,
      timezone: view?.dataset.timezone ?? "UTC",
    }),
    [symbol, displayTf, view?.dataset.timezone],
  );

  // Mount the renderer once — the adapter owns its own resize handling.
  useEffect(() => {
    if (!hostRef.current) return;
    const a = createLightweightAdapter({ container: hostRef.current, settings });
    adapterRef.current = a;
    setAdapter(a);
    fittedRef.current = false;
    onAdapterReady?.(a);
    return () => {
      a.destroy();
      adapterRef.current = null;
      setAdapter(null);
      onAdapterReady?.(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { adapterRef.current?.applySettings(settings); }, [settings]);

  useEffect(() => {
    const a = adapterRef.current;
    if (!a || !candles.length) return;
    a.setCandles(candles);
    if (!fittedRef.current && candles.length > 4) {
      a.fitContent();
      fittedRef.current = true;
    }
  }, [candles]);

  // Refit once after a timeframe fold so the new bar width is sensible.
  useEffect(() => { fittedRef.current = false; }, [displayTf]);

  useEffect(() => { adapterRef.current?.syncOverlayIndicators(indicators, candles); }, [indicators, candles]);
  useEffect(() => { adapterRef.current?.syncSubPaneIndicators(indicators, candles); }, [indicators, candles]);
  useEffect(() => {
    adapterRef.current?.setVolumeVisible(!!enabled.volume, candles);
  }, [enabled.volume, candles]);

  // Text-editor placement needs the chart box in element pixels.
  useEffect(() => {
    const el = chartWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setChartBounds({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const {
    drawings: drawingRevision,
    textEditor, commitTextEditor, cancelTextEditor, updateTextEditor,
  } = useChartDrawings({
    adapter,
    store: drawingStore,
    activeTool,
    setActiveTool,
    magnet,
    candles,
    pricePrecision: decimals,
    enabled: !drawingsHidden && !drawingsLocked,
  });

  const toggleIndicator = (key: IndicatorKey) =>
    setEnabled((prev) => ({ ...prev, [key]: !prev[key] }));

  const groups = useMemo(() => {
    const out = new Map<string, typeof INDICATOR_TOGGLES>();
    for (const def of INDICATOR_TOGGLES) {
      const list = out.get(def.group) ?? [];
      list.push(def);
      out.set(def.group, list);
    }
    return [...out.entries()];
  }, []);

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Chart toolbar — timeframe fold + indicators, terminal density. */}
      <div className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-border/60 bg-card/40 px-2">
        <span className="shrink-0 pr-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {symbol}
        </span>
        {timeframeOptions.map((tf) => (
          <Button
            key={tf}
            size="sm"
            variant={displayTf === tf ? "secondary" : "ghost"}
            className={cn("h-6 shrink-0 px-2 font-mono text-[11px]", displayTf === tf && "font-semibold")}
            onClick={() => setDisplayTf(tf)}
          >
            {tf}
          </Button>
        ))}

        <div className="mx-1 h-4 w-px shrink-0 bg-border/60" />

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" className="h-6 shrink-0 gap-1 px-2 text-[11px]">
              <LineChart className="h-3.5 w-3.5" />
              Indicators
              {activeIndicatorCount ? (
                <span className="rounded bg-primary/15 px-1 font-mono text-[10px] text-primary">
                  {activeIndicatorCount}
                </span>
              ) : null}
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="max-h-[60vh] w-64 overflow-y-auto p-2">
            {groups.map(([group, defs]) => (
              <div key={group} className="mb-2 last:mb-0">
                <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {group}
                </div>
                {defs.map((def) => (
                  <label
                    key={def.key}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-[12px] hover:bg-accent/50"
                  >
                    <Checkbox
                      checked={!!enabled[def.key]}
                      onCheckedChange={() => toggleIndicator(def.key)}
                    />
                    {def.label}
                  </label>
                ))}
              </div>
            ))}
          </PopoverContent>
        </Popover>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={objectTreeOpen ? "secondary" : "ghost"}
              className="h-6 shrink-0 gap-1 px-2 text-[11px]"
              onClick={() => setObjectTreeOpen((v) => !v)}
            >
              <Shapes className="h-3.5 w-3.5" /> Objects
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Object tree — manage drawings</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              className="h-6 shrink-0 gap-1 px-2 text-[11px]"
              onClick={() => setDrawingsHidden((v) => !v)}
            >
              {drawingsHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{drawingsHidden ? "Show" : "Hide"} drawings</TooltipContent>
        </Tooltip>

        {displayTf !== baseTf ? (
          <span className="ml-auto shrink-0 pl-2 text-[10px] text-muted-foreground">
            folded from {baseTf}
          </span>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Drawing rail — identical toolset to the live terminal. */}
        <div className="hidden w-[44px] shrink-0 flex-col items-center gap-0.5 overflow-y-auto border-r border-border/60 bg-card/30 py-1 md:flex">
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
        </div>

        <div ref={chartWrapRef} className="relative min-w-0 flex-1">
          <div ref={hostRef} className="absolute inset-0" data-testid="studio-chart" data-studio-chart="" />
          {textEditor ? (
            <ChartTextEditor
              state={textEditor}
              onChange={updateTextEditor}
              onCommit={commitTextEditor}
              onCancel={cancelTextEditor}
              bounds={chartBounds}
            />
          ) : null}
          {objectTreeOpen ? (
            <div className="absolute bottom-3 left-3 z-40">
              <ObjectTree
                store={drawingStore}
                revision={drawingRevision}
                formatPrice={(v) => v.toFixed(decimals)}
                onClose={() => setObjectTreeOpen(false)}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

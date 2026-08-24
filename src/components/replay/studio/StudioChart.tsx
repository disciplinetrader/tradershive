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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Eye, EyeOff, LineChart, Newspaper, Shapes } from "lucide-react";

import { createLightweightAdapter } from "@/lib/chart/adapters/lightweight";
import type { ChartAdapter, ExternalMarker } from "@/lib/chart/adapter";
import type { ChartSettings, IndicatorConfig, IndicatorKey } from "@/lib/chart/types";
import type { ToolId } from "@/lib/chart/drawings/types";
import { INDICATOR_TOGGLES } from "@/lib/chart/indicator-registry";
import { DrawingStore } from "@/lib/chart/drawings/store";
import { aggregatableFrom, aggregateCandles } from "@/lib/replay/aggregate";
import { useEconomicEvents } from "@/lib/economic-calendar/api";
import { StudioNewsLayer } from "./StudioNewsLayer";
import { currenciesForSymbol } from "@/lib/economic-calendar/types";
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
import { ChartContextMenu, type ChartOrderIntent } from "@/components/chart/ChartContextMenu";
import { bracketFor } from "@/lib/replay/chart-trading";
import { findSymbol } from "@/lib/paper-trading/symbols";
import { useReplayStudio } from "./context";
import { useSecondarySymbol } from "./useSecondarySymbol";

/** Decimals inferred from price magnitude — FX pairs need more than indices. */
function decimalsFor(price: number | null): number {
  if (price == null || !Number.isFinite(price)) return 2;
  const abs = Math.abs(price);
  if (abs >= 1000) return 2;
  if (abs >= 100) return 3;
  if (abs >= 1) return 5;
  return 6;
}

export interface StudioChartProps {
  onAdapterReady?: (a: ChartAdapter | null) => void;
  /**
   * Shared annotation store. Panes MUST be given one: a `DrawingStore`
   * persists to `localStorage` under its scope, so two stores on one session
   * scope are two writers of one key — the last to persist silently erases
   * whatever the other drew. Sharing one instance also happens to be the
   * behaviour a trader wants, since drawings are anchored in absolute time and
   * price and therefore mean the same thing on every fold.
   */
  drawingStore?: DrawingStore;
  /** Opening fold. Defaults to the dataset's own base timeframe. */
  initialTimeframe?: Timeframe;
  /** Hide the focused-chart controls: drawing rail, indicators, trading. */
  compact?: boolean;
  /**
   * MSYM-1 · render a DIFFERENT instrument than the session's, projected onto
   * the session's clock. A pane given one is display-only and can never place
   * an order — enforced here rather than by the caller, because the execution
   * engine decides fills on price with no symbol on the tick, so a secondary
   * pane that could trade would fill the primary symbol's orders.
   */
  secondarySymbol?: string | null;
}

export function StudioChart({
  onAdapterReady, drawingStore: sharedStore, initialTimeframe, compact = false,
  secondarySymbol = null,
}: StudioChartProps) {
  const {
    view, sessionId, riskPercent, setRiskPercent, placeMarketOrder, sizeForRisk, price: livePrice,
    seekForwardTo, symbol: sessionSymbol, placeOrderAt, market: sessionMarket,
  } = useReplayStudio();
  /**
   * A secondary pane is read-only no matter what the caller passed. `compact`
   * is a layout preference; this is a correctness guard.
   */
  const isSecondary = !!secondarySymbol;
  const readOnly = compact || isSecondary;
  const [armed, setArmed] = useState<ArmedOrder | null>(null);
  const [newsOn, setNewsOn] = useState(true);
  const tradingLive = view?.transport.lifecycle !== "completed";
  // The session row's symbol, not the dataset label parsed below: the label
  // is a display string that happens to start with the ticker.
  const symbolMeta = useMemo(
    () => (sessionSymbol ? findSymbol(sessionSymbol) ?? null : null),
    [sessionSymbol],
  );

  /**
   * Turn a right-click intent into an order, through the SAME derivation the
   * armed click-to-place flow uses (`bracketFor`) and the same submission path
   * (`placeOrderAt` / `placeMarketOrder`).
   *
   * The menu decides WHAT the click means; this decides nothing about order
   * semantics beyond routing. That split is what stops Replay growing a second
   * set of order rules alongside the workspace's.
   */
  const onChartIntent = useCallback(
    (intent: ChartOrderIntent) => {
      if (intent.kind === "buy_market" || intent.kind === "sell_market") {
        placeMarketOrder(intent.kind === "buy_market" ? "buy" : "sell");
        return;
      }
      if (intent.kind === "alert" || intent.kind === "drawing") return;

      const direction = intent.kind.startsWith("buy") ? "buy" : "sell";
      const levels = bracketFor(direction, intent.price, { stopFraction: 0.002, rr: 2 });
      placeOrderAt(direction, levels, { size: sizeForRisk(levels.entry, levels.stop) });
    },
    [placeMarketOrder, placeOrderAt, sizeForRisk],
  );


  // Esc always disarms order placement, so the chart never gets stuck armed.
  useEffect(() => {
    if (!armed) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setArmed(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [armed]);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartWrapRef = useRef<HTMLDivElement | null>(null);
  const adapterRef = useRef<ChartAdapter | null>(null);
  const [adapter, setAdapter] = useState<ChartAdapter | null>(null);
  const fittedRef = useRef(false);

  const symbol = secondarySymbol ?? view?.dataset.label.split(" ")[0] ?? "";
  const baseTf = (view?.dataset.timeframe ?? "5m") as Timeframe;

  // ---- display timeframe (folded from the base, never re-fetched) ---------
  const [displayTf, setDisplayTf] = useState<Timeframe>(initialTimeframe ?? baseTf);
  // Follow the dataset's base only while the pane has no opinion of its own.
  useEffect(() => { setDisplayTf(initialTimeframe ?? baseTf); }, [initialTimeframe, baseTf]);
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
  const drawingStore = sharedStore ?? storeRef.current;

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

  // The clock's position in absolute time: the open of the newest bar the
  // session has consumed. This — not an index — is what a second instrument
  // can be projected onto, because two symbols do not share a bar grid.
  const primaryRaw = (view?.candles ?? []) as unknown as Candle[];
  const primaryTimeMs = primaryRaw.length ? primaryRaw[primaryRaw.length - 1].time : null;

  const secondary = useSecondarySymbol({
    symbol: secondarySymbol,
    timeframe: baseTf,
    from: view?.dataset.startTime ?? 0,
    to: view?.dataset.endTime ?? 0,
    market: sessionMarket ?? undefined,
    primaryTimeMs,
  });

  const candles: Candle[] = useMemo(() => {
    // Secondary bars are fetched at the session's BASE timeframe and folded by
    // the same aggregator, so a secondary pane inherits the fold guarantees
    // rather than getting a second, differently-behaved path.
    const raw = isSecondary ? secondary.candles : primaryRaw;
    return aggregateCandles(raw, baseTf, displayTf);
  }, [isSecondary, secondary.candles, primaryRaw, baseTf, displayTf]);

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

  // ---- economic calendar (news markers + go-to-news) ----------------------
  // Only events at or before the last consumed bar are drawn: the calendar
  // must never leak information the replay clock has not reached yet.
  const currencies = useMemo(() => currenciesForSymbol(symbol), [symbol]);
  const { data: newsEvents } = useEconomicEvents({
    fromMs: view?.dataset.startTime ?? null,
    toMs: view?.dataset.endTime ?? null,
    currencies,
    impacts: ["high", "medium"],
    enabled: newsOn && !!view,
  });

  const marketTime = view?.transport.marketTime ?? 0;
  const visibleNews = useMemo(
    () => (newsEvents ?? []).filter((e) => e.timeMs <= marketTime),
    [newsEvents, marketTime],
  );
  const nextNews = useMemo(
    () => (newsEvents ?? []).find((e) => e.timeMs > marketTime) ?? null,
    [newsEvents, marketTime],
  );

  useEffect(() => {
    const a = adapterRef.current;
    if (!a) return;
    if (!newsOn) { a.setExternalMarkers([]); return; }
    const markers: ExternalMarker[] = visibleNews.map((e) => ({
      timeMs: e.timeMs,
      position: "aboveBar",
      shape: "square",
      color: e.impact === "high" ? "hsl(var(--destructive))" : "hsl(var(--muted-foreground))",
      text: `${e.currency} ${e.title}`.slice(0, 42),
    }));
    a.setExternalMarkers(markers);
  }, [visibleNews, newsOn, candles]);

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

        {/* Everything past the timeframe row belongs to the FOCUSED chart.
            In a grid these controls are per-account, not per-pane — four
            risk fields and four Buy buttons over one position would be four
            ways to ask the same question. */}
        {readOnly ? null : (
        <>
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

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={newsOn ? "secondary" : "ghost"}
              className="h-6 shrink-0 gap-1 px-2 text-[11px]"
              onClick={() => setNewsOn((v) => !v)}
            >
              <Newspaper className="h-3.5 w-3.5" /> News
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {newsOn ? "Hide" : "Show"} high/medium impact economic events
          </TooltipContent>
        </Tooltip>

        {newsOn && nextNews ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                className="h-6 shrink-0 px-2 text-[11px] text-muted-foreground"
                onClick={() => seekForwardTo(nextNews.timeMs)}
              >
                Next: {nextNews.currency} {nextNews.title.slice(0, 22)}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Jump to {new Date(nextNews.timeMs).toISOString().slice(0, 16).replace("T", " ")} UTC
            </TooltipContent>
          </Tooltip>
        ) : null}

        {displayTf !== baseTf ? (
          <span className="shrink-0 pl-2 text-[10px] text-muted-foreground">folded from {baseTf}</span>
        ) : null}

        {/* Phase C · chart-native trading controls */}
        <div className="ml-auto flex shrink-0 items-center gap-1 pl-2">
          <label className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            Risk
            <input
              type="number"
              min={0.1}
              max={10}
              step={0.1}
              value={riskPercent}
              onChange={(e) => setRiskPercent(Number(e.target.value) || 0.1)}
              className="h-6 w-12 rounded border border-border/60 bg-background px-1 text-right font-mono text-[11px] text-foreground"
              aria-label="Risk per trade in percent of equity"
            />
            %
          </label>
          <Button
            size="sm"
            variant={armed?.direction === "buy" ? "default" : "ghost"}
            className="h-6 shrink-0 px-2 text-[11px]"
            disabled={!tradingLive}
            onClick={() =>
              setArmed((a) => (a?.direction === "buy" ? null : { direction: "buy", stopFraction: 0.002, rr: 2 }))
            }
          >
            Buy limit
          </Button>
          <Button
            size="sm"
            variant={armed?.direction === "sell" ? "default" : "ghost"}
            className="h-6 shrink-0 px-2 text-[11px]"
            disabled={!tradingLive}
            onClick={() =>
              setArmed((a) => (a?.direction === "sell" ? null : { direction: "sell", stopFraction: 0.002, rr: 2 }))
            }
          >
            Sell limit
          </Button>
          <div className="mx-1 h-4 w-px shrink-0 bg-border/60" />
          <Button
            size="sm"
            className="h-6 shrink-0 bg-emerald-600 px-2 text-[11px] text-white hover:bg-emerald-600/90"
            disabled={!tradingLive || livePrice == null}
            onClick={() => {
              if (livePrice == null) return;
              const dist = Math.max(Math.abs(livePrice) * 0.002, 1e-8);
              placeMarketOrder("buy", { stopDistance: dist, targetDistance: dist * 2, size: sizeForRisk(livePrice, livePrice - dist) });
            }}
          >
            Buy
          </Button>
          <Button
            size="sm"
            className="h-6 shrink-0 bg-rose-600 px-2 text-[11px] text-white hover:bg-rose-600/90"
            disabled={!tradingLive || livePrice == null}
            onClick={() => {
              if (livePrice == null) return;
              const dist = Math.max(Math.abs(livePrice) * 0.002, 1e-8);
              placeMarketOrder("sell", { stopDistance: dist, targetDistance: dist * 2, size: sizeForRisk(livePrice, livePrice + dist) });
            }}
          >
            Sell
          </Button>
        </div>
        </>
        )}
      </div>


      <div className="flex min-h-0 flex-1">
        {/* Drawing rail — identical toolset to the live terminal. */}
        <div className={cn(
          "w-[44px] shrink-0 flex-col items-center gap-0.5 overflow-y-auto border-r border-border/60 bg-card/30 py-1",
          readOnly ? "hidden" : "hidden md:flex",
        )}>
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
          <div
            ref={hostRef}
            className="absolute inset-0"
            data-testid="studio-chart"
            data-studio-chart=""
            /* The fold this pane is actually rendering, so a multi-pane
               layout can be checked for what it SHOWS rather than for
               what it was handed. */
            data-timeframe={displayTf}
            /* MSYM-1 · the instrument and the newest bar this pane is
               DRAWING. The multi-symbol guarantee is an inequality between
               panes — no pane's newest bar may be later than the primary's —
               and an inequality can only be asserted if both sides are
               readable from the DOM. Reading it off React state instead would
               test the state, which is exactly what a desync survives. */
            data-symbol={symbol}
            data-last-bar={candles.length ? String(candles[candles.length - 1].time) : ""}
            data-secondary={isSecondary ? "1" : "0"}
          />
          {/* Detail for the news markers drawn above. Fed the SAME gated list
              the markers are built from — `visibleNews`, never `newsEvents` —
              so an event the replay clock has not reached has no marker,
              nothing to click and no reachable forecast.
              Both panes get it: a fold pane shows the same instrument's
              calendar, and on a secondary symbol the currencies differ but the
              events are still real context for the bar under them. */}
          {newsOn ? (
            <StudioNewsLayer
              adapter={adapter}
              events={visibleNews}
              tick={`${view?.transport.cursor ?? 0}:${displayTf}:${chartBounds.width}x${chartBounds.height}`}
              chartTimezone={settings.timezone}
            />
          ) : null}
          {/* Order and position lines belong to the SESSION's instrument. On a
              secondary pane they would draw the primary symbol's entry, stop
              and target as price levels on a chart where those numbers mean
              nothing. A fold pane still gets them: same instrument, same
              levels. */}
          {isSecondary ? null : (
            <StudioTradeLayer
              adapter={adapter}
              tick={`${view?.transport.cursor ?? 0}:${displayTf}:${chartBounds.width}x${chartBounds.height}`}
              decimals={decimals}
              armed={armed}
              onPlaced={() => setArmed(null)}
            />
          )}
          {/* Right-click trading. The SAME menu the live workspace mounts —
              one component, two mount points. Alerts are excluded because
              Replay has none, and a row that cannot do anything is worse than
              a missing one. */}
          {/* `tradingLive` alone is not enough: right-click placement would
              submit against the SESSION's symbol while the trader is looking
              at another instrument's chart. The engine decides fills on price
              with no symbol on the tick, so that order would fill on prices
              this chart never showed. */}
          {tradingLive && !isSecondary && (
            <ChartContextMenu
              adapter={adapter}
              sym={symbolMeta}
              livePrice={livePrice ?? undefined}
              allow={["buy_market", "sell_market", "buy_limit", "sell_limit", "buy_stop", "sell_stop", "drawing"]}
              onIntent={onChartIntent}
            />
          )}
          {armed ? (
            <div className="pointer-events-none absolute left-1/2 top-3 z-40 -translate-x-1/2 rounded-full border border-border/60 bg-background/95 px-3 py-1 text-[11px] shadow-lg backdrop-blur">
              Click the chart to place a {armed.direction === "buy" ? "buy" : "sell"} order · {riskPercent}% risk · Esc to cancel
            </div>
          ) : null}
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

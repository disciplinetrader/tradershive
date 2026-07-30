import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { marketData } from "@/lib/market-data/engine";
import type { Candle, Quote } from "@/lib/market-data/types";
import { TIMEFRAME_SECONDS } from "@/lib/market-data/constants";
import type { ChartSettings, IndicatorConfig } from "@/lib/chart/types";
import type { ChartAdapter, ChartAdapterFactory } from "@/lib/chart/adapter";
import { createLightweightAdapter } from "@/lib/chart/adapters/lightweight";
import { Button } from "@/components/ui/button";

interface Props {
  settings: ChartSettings;
  indicators: IndicatorConfig[];
  onQuote?: (q: Quote | null) => void;
  onReady?: (api: ChartHandle) => void;
  /** Receives the live renderer adapter (or null on unmount). */
  onAdapter?: (adapter: ChartAdapter | null) => void;
  /** Receives the loaded candle history — used by magnet snapping. */
  onCandles?: (candles: Candle[]) => void;
  /**
   * Renderer factory — defaults to lightweight-charts. Swap in a TradingView
   * Advanced Charts factory here (or via context) to migrate without touching
   * consumers.
   */
  adapter?: ChartAdapterFactory;
  className?: string;
  children?: React.ReactNode;
}

export interface ChartHandle {
  screenshot: () => Promise<Blob | null>;
  fitContent: () => void;
  resetScale: () => void;
  adapter: ChartAdapter | null;
  candles: Candle[];
}

/**
 * Thin React binding over ChartAdapter. Owns the MarketDataEngine
 * subscription lifecycle; delegates every draw call to the adapter.
 */
export const ChartEngine = forwardRef<ChartHandle, Props>(function ChartEngine(
  { settings, indicators, onQuote, onReady, onAdapter, onCandles, adapter: adapterFactory = createLightweightAdapter, className, children },
  ref,
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const adapterRef = useRef<ChartAdapter | null>(null);
  const [adapterInstance, setAdapterInstance] = useState<ChartAdapter | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadNonce, setLoadNonce] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [freshness, setFreshness] = useState<"loading" | "live" | "cached" | "error">("loading");

  // Mount adapter once
  useEffect(() => {
    if (!hostRef.current) return;
    const a = adapterFactory({ container: hostRef.current, settings });
    adapterRef.current = a;
    setAdapterInstance(a);
    return () => { a.destroy(); adapterRef.current = null; setAdapterInstance(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { onAdapter?.(adapterInstance); }, [adapterInstance, onAdapter]);
  useEffect(() => { onCandles?.(candles); }, [candles, onCandles]);

  // Settings & chart type
  useEffect(() => { adapterRef.current?.applySettings(settings); }, [settings]);
  useEffect(() => {
    const a = adapterRef.current;
    if (!a) return;
    a.setChartType(settings.chartType);
    if (candles.length) a.setCandles(candles);
  }, [settings.chartType, candles]);

  // Load history + subscribe live via MarketDataEngine
  useEffect(() => {
    marketData.init();
    let cancelled = false;
    const to = Date.now();
    const tfMs = TIMEFRAME_SECONDS[settings.timeframe] * 1000;
    const from = to - tfMs * 500;
    setLoadError(null);
    setFreshness((f) => (candles.length ? f : "loading"));
    marketData
      .getCandles({ symbol: settings.symbol, timeframe: settings.timeframe, from, to, limit: 500 }, settings.market)
      .then((rows) => {
        if (cancelled) return;
        if (!rows || rows.length === 0) {
          // Only block the chart when there is truly nothing to show.
          if (!candles.length) {
            setLoadError("No historical data is available for this symbol yet.");
            setFreshness("error");
          } else {
            setFreshness("cached");
          }
          return;
        }
        setCandles(rows);
        adapterRef.current?.setCandles(rows);
        setLastUpdated(Date.now());
        setFreshness("live");
      })
      .catch((e) => {
        if (cancelled) return;
        const msg = (e as Error)?.message ?? "Unknown error";
        // Graceful degradation: keep the last-known chart on screen and
        // surface a subtle "Cached" chip instead of a red error card.
        if (candles.length) {
          setFreshness("cached");
          return;
        }
        const friendly = /rate|429|cooldown|quota/i.test(msg)
          ? "Live market data is briefly unavailable. Retrying automatically…"
          : /not_configured/i.test(msg)
          ? "This market provider isn't configured yet."
          : "We couldn't reach the market data provider.";
        setLoadError(friendly);
        setFreshness("error");
      });

    const sub = marketData.subscribe(settings.symbol, (q) => {
      setQuote(q); onQuote?.(q);
      setLastUpdated(Date.now());
      setFreshness("live");
      setCandles((prev) => {
        if (!prev.length) return prev;
        const stepMs = TIMEFRAME_SECONDS[settings.timeframe] * 1000;
        const bucket = Math.floor(q.ts / stepMs) * stepMs;
        const last = prev[prev.length - 1];
        let next: Candle[];
        if (last.time === bucket) {
          next = [...prev.slice(0, -1), { ...last, close: q.last, high: Math.max(last.high, q.last), low: Math.min(last.low, q.last) }];
        } else if (bucket > last.time) {
          next = [...prev, { time: bucket, open: q.last, high: q.last, low: q.last, close: q.last, volume: 0 }];
        } else return prev;
        adapterRef.current?.updateLastCandle(next[next.length - 1]);
        return next;
      });
    }, settings.market);

    return () => { cancelled = true; sub.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.symbol, settings.timeframe, settings.market, onQuote, loadNonce]);

  // Indicators + volume
  useEffect(() => { adapterRef.current?.syncOverlayIndicators(indicators, candles); }, [indicators, candles]);
  useEffect(() => { adapterRef.current?.syncSubPaneIndicators(indicators, candles); }, [indicators, candles]);
  useEffect(() => {
    const showVol = settings.showVolume || indicators.some((i) => i.key === "volume" && i.visible !== false);
    adapterRef.current?.setVolumeVisible(showVol, candles);
  }, [settings.showVolume, indicators, candles]);

  // Handle
  useImperativeHandle(ref, () => ({
    screenshot: () => adapterRef.current?.screenshot() ?? Promise.resolve(null),
    fitContent: () => adapterRef.current?.fitContent(),
    resetScale: () => adapterRef.current?.resetPriceScale(),
    adapter: adapterRef.current,
    candles,
  }), [candles]);

  useEffect(() => {
    const currentAdapter = adapterRef.current;
    if (!currentAdapter) return;
    onReady?.({
      screenshot: () => currentAdapter.screenshot(),
      fitContent: () => currentAdapter.fitContent(),
      resetScale: () => currentAdapter.resetPriceScale(),
      adapter: currentAdapter,
      candles,
    });
  }, [candles, onReady]);

  const freshnessLabel =
    freshness === "live" ? "Live" :
    freshness === "cached" ? "Cached" :
    freshness === "error" ? "Offline" : "Loading";
  const freshnessDot =
    freshness === "live" ? "bg-success animate-pulse" :
    freshness === "cached" ? "bg-warning" :
    freshness === "error" ? "bg-danger" : "bg-muted-foreground/60";
  const updatedAgo = lastUpdated
    ? Math.max(1, Math.round((Date.now() - lastUpdated) / 1000))
    : null;

  return (
    <div className={className ?? "relative h-full w-full"}>
      <div ref={hostRef} className="absolute inset-0" />
      {children}

      {/* Cold-start skeleton — premium shimmer, never a red error card */}
      {!candles.length && !loadError ? (
        <div className="absolute inset-0 flex flex-col p-6" aria-busy="true" aria-live="polite">
          <div className="mb-3 h-3 w-40 animate-pulse rounded bg-muted/60" />
          <div className="flex flex-1 items-end gap-1">
            {Array.from({ length: 40 }).map((_, i) => (
              <div
                key={i}
                className="flex-1 animate-pulse rounded-sm bg-muted/50"
                style={{ height: `${25 + ((i * 37) % 55)}%`, animationDelay: `${i * 30}ms` }}
              />
            ))}
          </div>
          <div className="mt-3 text-center text-xs text-muted-foreground">
            Loading {settings.symbol} · {settings.timeframe}
          </div>
        </div>
      ) : null}

      {/* Cold-start error — friendly, actionable, never a raw stack */}
      {loadError && !candles.length ? (
        <div className="absolute inset-0 flex items-center justify-center bg-background/40 backdrop-blur-sm">
          <div className="max-w-sm rounded-lg border border-border bg-background/95 p-5 text-center shadow-lg">
            <div className="mb-1 text-sm font-semibold text-foreground">Market data paused</div>
            <div className="mb-4 text-xs text-muted-foreground">{loadError}</div>
            <Button
              type="button"
              size="sm"
              onClick={() => { setLoadError(null); setLoadNonce((n) => n + 1); }}
            >
              Try again
            </Button>
          </div>
        </div>
      ) : null}

      {/* Symbol + freshness chip (top-left). Data status is honest but calm. */}
      <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
        <div className="rounded-md border border-border/40 bg-background/70 px-2 py-1 text-xs font-medium text-foreground backdrop-blur">
          {settings.symbol} · {settings.timeframe} · {quote?.last?.toFixed(4) ?? "—"}
        </div>
        <div
          className="flex items-center gap-1.5 rounded-md border border-border/40 bg-background/70 px-2 py-1 text-[10px] font-medium text-muted-foreground backdrop-blur"
          title={
            freshness === "live" ? `Streaming — updated ${updatedAgo ?? 0}s ago`
            : freshness === "cached" ? `Cached data — live provider is briefly unavailable`
            : freshness === "error" ? "No connection to market provider"
            : "Loading market data"
          }
        >
          <span className={`h-1.5 w-1.5 rounded-full ${freshnessDot}`} />
          {freshnessLabel}
          {freshness === "cached" && updatedAgo ? <span className="opacity-70">· {updatedAgo}s</span> : null}
        </div>
      </div>
    </div>
  );
});

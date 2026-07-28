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
  { settings, indicators, onQuote, onReady, adapter: adapterFactory = createLightweightAdapter, className, children },
  ref,
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const adapterRef = useRef<ChartAdapter | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadNonce, setLoadNonce] = useState(0);

  // Mount adapter once
  useEffect(() => {
    if (!hostRef.current) return;
    const a = adapterFactory({ container: hostRef.current, settings });
    adapterRef.current = a;
    return () => { a.destroy(); adapterRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Settings & chart type
  useEffect(() => { adapterRef.current?.applySettings(settings); }, [settings]);
  useEffect(() => {
    const a = adapterRef.current;
    if (!a) return;
    a.setChartType(settings.chartType);
    // The adapter rebuilds its price series on type change — re-push the
    // existing candles so the new series isn't empty until the next bar.
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
    marketData
      .getCandles({ symbol: settings.symbol, timeframe: settings.timeframe, from, to, limit: 500 }, settings.market)
      .then((rows) => {
        if (cancelled) return;
        if (!rows || rows.length === 0) {
          setLoadError("No data returned by market provider.");
          return;
        }
        setCandles(rows);
        adapterRef.current?.setCandles(rows);
      })
      .catch((e) => {
        if (cancelled) return;
        const msg = (e as Error)?.message ?? "Unknown error";
        const friendly = /rate|429|cooldown|quota/i.test(msg)
          ? "Market data provider is rate-limited. Retrying shortly…"
          : /not_configured/i.test(msg)
          ? "Market data provider is not configured."
          : `Couldn't load ${settings.symbol}. ${msg}`;
        setLoadError(friendly);
      });

    const sub = marketData.subscribe(settings.symbol, (q) => {
      setQuote(q); onQuote?.(q);
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

  return (
    <div className={className ?? "relative h-full w-full"}>
      <div ref={hostRef} className="absolute inset-0" />
      {children}
      {!candles.length && !loadError ? (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          Loading {settings.symbol} · {settings.timeframe}…
        </div>
      ) : null}
      {loadError ? (
        <div className="absolute inset-0 flex items-center justify-center bg-background/40 backdrop-blur-sm">
          <div className="max-w-sm rounded-lg border border-border bg-background/90 p-4 text-center shadow-lg">
            <div className="mb-1 text-sm font-semibold text-foreground">Chart unavailable</div>
            <div className="mb-3 text-xs text-muted-foreground">{loadError}</div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => { setLoadError(null); setLoadNonce((n) => n + 1); }}
            >
              Retry
            </Button>
          </div>
        </div>
      ) : null}
      <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-background/60 px-2 py-1 text-xs font-medium text-foreground backdrop-blur">
        {settings.symbol} · {settings.timeframe} · {quote?.last?.toFixed(4) ?? "—"}
      </div>
    </div>
  );
});

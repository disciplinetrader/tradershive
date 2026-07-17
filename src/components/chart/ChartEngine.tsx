import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart, CandlestickSeries, LineSeries, AreaSeries, BarSeries, BaselineSeries, HistogramSeries,
  CrosshairMode as LWCrosshair, ColorType,
  type IChartApi, type ISeriesApi, type UTCTimestamp,
} from "lightweight-charts";
import { marketData } from "@/lib/market-data/engine";
import type { Candle, Quote, Timeframe } from "@/lib/market-data/types";
import type { ChartSettings, ChartType, IndicatorConfig } from "@/lib/chart/types";
import { ema, sma, bollinger, vwap, rsi, macd, atr, donchian, heikinAshi } from "@/lib/chart/indicators";
import { TIMEFRAME_SECONDS } from "@/lib/market-data/constants";

interface Props {
  settings: ChartSettings;
  indicators: IndicatorConfig[];
  onQuote?: (q: Quote | null) => void;
  onReady?: (api: ChartHandle) => void;
  className?: string;
}

export interface ChartHandle {
  screenshot: () => Promise<Blob | null>;
  fitContent: () => void;
  resetScale: () => void;
}

const INDICATOR_COLORS = ["#22d3ee","#a78bfa","#f472b6","#f59e0b","#34d399","#f87171","#60a5fa"];

/**
 * The single Chart Engine every module consumes. Feeds itself from the
 * shared MarketDataEngine — never touches Binance/OANDA directly.
 */
export function ChartEngine({ settings, indicators, onQuote, onReady, className }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const priceSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const overlayRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const volSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);

  // Build chart once
  useEffect(() => {
    if (!hostRef.current) return;
    const chart = createChart(hostRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#94a3b8",
        fontFamily: "ui-sans-serif, system-ui",
      },
      grid: {
        vertLines: { color: "rgba(148,163,184,0.08)", visible: settings.showGrid },
        horzLines: { color: "rgba(148,163,184,0.08)", visible: settings.showGrid },
      },
      rightPriceScale: {
        borderColor: "rgba(148,163,184,0.15)",
        mode: settings.priceScale === "log" ? 1 : settings.priceScale === "percentage" ? 2 : 0,
        autoScale: settings.autoScale,
        invertScale: settings.priceScale === "inverted",
      },
      timeScale: { borderColor: "rgba(148,163,184,0.15)", timeVisible: true, secondsVisible: false },
      crosshair: {
        mode: settings.crosshair === "magnet" ? LWCrosshair.Magnet
          : settings.crosshair === "hidden" ? LWCrosshair.Hidden : LWCrosshair.Normal,
      },
    });
    chartRef.current = chart;
    onReady?.({
      screenshot: async () => {
        const canvas = chart.takeScreenshot();
        return await new Promise<Blob | null>((r) => canvas.toBlob((b) => r(b), "image/png"));
      },
      fitContent: () => chart.timeScale().fitContent(),
      resetScale: () => chart.priceScale("right").applyOptions({ autoScale: true }),
    });
    return () => { chart.remove(); chartRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update chart options when settings change
  useEffect(() => {
    const c = chartRef.current; if (!c) return;
    c.applyOptions({
      grid: {
        vertLines: { visible: settings.showGrid },
        horzLines: { visible: settings.showGrid },
      },
      crosshair: {
        mode: settings.crosshair === "magnet" ? LWCrosshair.Magnet
          : settings.crosshair === "hidden" ? LWCrosshair.Hidden : LWCrosshair.Normal,
      },
      rightPriceScale: {
        mode: settings.priceScale === "log" ? 1 : settings.priceScale === "percentage" ? 2 : 0,
        autoScale: settings.autoScale,
        invertScale: settings.priceScale === "inverted",
      },
    });
  }, [settings.showGrid, settings.crosshair, settings.priceScale, settings.autoScale]);

  // Recreate price series when chart type changes
  useEffect(() => {
    const chart = chartRef.current; if (!chart) return;
    if (priceSeriesRef.current) { chart.removeSeries(priceSeriesRef.current); priceSeriesRef.current = null; }
    priceSeriesRef.current = buildPriceSeries(chart, settings.chartType);
  }, [settings.chartType]);

  // Load history + subscribe live via MarketDataEngine
  useEffect(() => {
    const chart = chartRef.current; if (!chart) return;
    marketData.init();
    let cancelled = false;
    const to = Date.now();
    const tfMs = TIMEFRAME_SECONDS[settings.timeframe] * 1000;
    const from = to - tfMs * 500;
    marketData
      .getCandles({ symbol: settings.symbol, timeframe: settings.timeframe, from, to, limit: 500 }, settings.market)
      .then((rows) => {
        if (cancelled) return;
        setCandles(rows);
        applyCandles(priceSeriesRef.current!, settings.chartType, rows);
        chart.timeScale().fitContent();
      })
      .catch((e) => console.warn("[chart] history load failed", e));

    const sub = marketData.subscribe(settings.symbol, (q) => {
      setQuote(q); onQuote?.(q);
      setCandles((prev) => {
        if (!prev.length) return prev;
        const stepMs = TIMEFRAME_SECONDS[settings.timeframe] * 1000;
        const bucket = Math.floor(q.ts / stepMs) * stepMs;
        const last = prev[prev.length - 1];
        let next: Candle[];
        if (last.time === bucket) {
          const upd = { ...last, close: q.last, high: Math.max(last.high, q.last), low: Math.min(last.low, q.last) };
          next = [...prev.slice(0, -1), upd];
        } else if (bucket > last.time) {
          next = [...prev, { time: bucket, open: q.last, high: q.last, low: q.last, close: q.last, volume: 0 }];
        } else return prev;
        try { updateLast(priceSeriesRef.current!, settings.chartType, next); } catch { /* ignore */ }
        return next;
      });
    }, settings.market);

    return () => { cancelled = true; sub.unsubscribe(); };
  }, [settings.symbol, settings.timeframe, settings.market, settings.chartType, onQuote]);

  // Indicator overlays
  const overlayIndicators = useMemo(
    () => indicators.filter((i) => i.pane !== "sub" && i.visible !== false),
    [indicators],
  );
  useEffect(() => {
    const chart = chartRef.current; if (!chart || !candles.length) return;
    const closes = candles.map((c) => c.close);
    const activeIds = new Set<string>();

    overlayIndicators.forEach((cfg, idx) => {
      const color = cfg.color ?? INDICATOR_COLORS[idx % INDICATOR_COLORS.length];
      const buckets = computeOverlay(cfg, candles, closes);
      buckets.forEach((series, key) => {
        const id = `${cfg.id}:${key}`;
        activeIds.add(id);
        let s = overlayRef.current.get(id);
        if (!s) {
          s = chart.addSeries(LineSeries, { color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
          overlayRef.current.set(id, s);
        }
        s.setData(series.map((v, i) => ({ time: (candles[i].time / 1000) as UTCTimestamp, value: v }))
          .filter((p) => Number.isFinite(p.value)) as any);
      });
    });

    // Remove overlays that are no longer active
    for (const [id, s] of overlayRef.current) {
      if (!activeIds.has(id)) { chart.removeSeries(s); overlayRef.current.delete(id); }
    }
  }, [overlayIndicators, candles]);

  // Volume pane
  useEffect(() => {
    const chart = chartRef.current; if (!chart) return;
    const showVol = settings.showVolume || indicators.some((i) => i.key === "volume" && i.visible !== false);
    if (showVol && !volSeriesRef.current) {
      volSeriesRef.current = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "vol",
      });
      chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    }
    if (!showVol && volSeriesRef.current) { chart.removeSeries(volSeriesRef.current); volSeriesRef.current = null; }
    if (volSeriesRef.current) {
      volSeriesRef.current.setData(candles.map((c) => ({
        time: (c.time / 1000) as UTCTimestamp, value: c.volume,
        color: c.close >= c.open ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)",
      })) as any);
    }
  }, [candles, settings.showVolume, indicators]);

  return (
    <div className={className ?? "relative h-full w-full"}>
      <div ref={hostRef} className="absolute inset-0" />
      {!candles.length ? (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          Loading {settings.symbol} · {settings.timeframe}…
        </div>
      ) : null}
      <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-background/60 px-2 py-1 text-xs font-medium text-foreground backdrop-blur">
        {settings.symbol} · {settings.timeframe} · {quote?.last?.toFixed(4) ?? "—"}
      </div>
    </div>
  );
}

function buildPriceSeries(chart: IChartApi, type: ChartType): ISeriesApi<any> {
  switch (type) {
    case "line": return chart.addSeries(LineSeries, { color: "#22d3ee", lineWidth: 2 });
    case "area": return chart.addSeries(AreaSeries, { lineColor: "#22d3ee", topColor: "rgba(34,211,238,0.4)", bottomColor: "rgba(34,211,238,0)" });
    case "baseline": return chart.addSeries(BaselineSeries, {});
    case "bars": return chart.addSeries(BarSeries, { upColor: "#22c55e", downColor: "#ef4444" });
    case "hollow_candles":
      return chart.addSeries(CandlestickSeries, {
        upColor: "transparent", downColor: "#ef4444",
        borderUpColor: "#22c55e", borderDownColor: "#ef4444",
        wickUpColor: "#22c55e", wickDownColor: "#ef4444",
      });
    case "heikin_ashi":
    case "candles":
    default:
      return chart.addSeries(CandlestickSeries, {
        upColor: "#22c55e", downColor: "#ef4444",
        borderUpColor: "#22c55e", borderDownColor: "#ef4444",
        wickUpColor: "#22c55e", wickDownColor: "#ef4444",
      });
  }
}

function toRow(c: Candle) {
  return { time: (c.time / 1000) as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close };
}

function applyCandles(series: ISeriesApi<any>, type: ChartType, candles: Candle[]) {
  const src = type === "heikin_ashi" ? heikinAshi(candles) : candles;
  if (type === "line" || type === "area" || type === "baseline") {
    series.setData(src.map((c) => ({ time: (c.time / 1000) as UTCTimestamp, value: c.close })) as any);
  } else {
    series.setData(src.map(toRow) as any);
  }
}

function updateLast(series: ISeriesApi<any>, type: ChartType, candles: Candle[]) {
  const src = type === "heikin_ashi" ? heikinAshi(candles) : candles;
  const last = src[src.length - 1]; if (!last) return;
  if (type === "line" || type === "area" || type === "baseline") {
    series.update({ time: (last.time / 1000) as UTCTimestamp, value: last.close } as any);
  } else {
    series.update(toRow(last) as any);
  }
}

function computeOverlay(cfg: IndicatorConfig, candles: Candle[], closes: number[]): Map<string, number[]> {
  const map = new Map<string, number[]>();
  const p = cfg.params;
  switch (cfg.key) {
    case "ema": map.set("ema", ema(closes, p.length ?? 20)); break;
    case "sma": map.set("sma", sma(closes, p.length ?? 50)); break;
    case "vwap": map.set("vwap", vwap(candles)); break;
    case "bollinger": {
      const bb = bollinger(closes, p.length ?? 20, p.stddev ?? 2);
      map.set("upper", bb.upper); map.set("mid", bb.mid); map.set("lower", bb.lower); break;
    }
    case "donchian": {
      const d = donchian(candles, p.length ?? 20);
      map.set("upper", d.upper); map.set("lower", d.lower); map.set("mid", d.mid); break;
    }
    case "supertrend": {
      const a = atr(candles, p.period ?? 10);
      const mult = p.multiplier ?? 3;
      const line = candles.map((c, i) => (c.high + c.low) / 2 - mult * a[i]);
      map.set("supertrend", line); break;
    }
    case "ichimoku": {
      const conv = donchian(candles, p.conversion ?? 9).mid;
      const base = donchian(candles, p.base ?? 26).mid;
      map.set("conv", conv); map.set("base", base); break;
    }
    default: break;
  }
  // Subpane indicators (rsi/macd/atr/adx/stochastic/cci/obv) are computed by
  // dedicated sub-pane series in a future iteration; kept out of the price
  // overlay to preserve visual clarity.
  void rsi; void macd;
  return map;
}

/**
 * Lightweight-Charts adapter implementing ChartAdapter.
 *
 * Encapsulates every call to `lightweight-charts` — the rest of the app
 * only sees the ChartAdapter interface. Replacing this file with a
 * TradingView Advanced Charts adapter is the migration path.
 */

import {
  createChart, CandlestickSeries, LineSeries, AreaSeries, BarSeries, BaselineSeries, HistogramSeries,
  CrosshairMode as LWCrosshair, ColorType,
  type IChartApi, type ISeriesApi, type UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "@/lib/market-data/types";
import type { ChartAdapter, ChartAdapterFactory } from "../adapter";
import type { ChartSettings, ChartType, IndicatorConfig } from "../types";
import { ema, sma, bollinger, vwap, atr, donchian, heikinAshi, fibonacci, supportResistance, sessions, smc } from "../indicators";

const INDICATOR_COLORS = ["#22d3ee", "#a78bfa", "#f472b6", "#f59e0b", "#34d399", "#f87171", "#60a5fa"];

export const createLightweightAdapter: ChartAdapterFactory = ({ container, settings, onCrosshair }) => {
  const chart = createChart(container, {
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
      mode: priceMode(settings),
      autoScale: settings.autoScale,
      invertScale: settings.priceScale === "inverted",
    },
    timeScale: { borderColor: "rgba(148,163,184,0.15)", timeVisible: true, secondsVisible: false },
    crosshair: { mode: crosshairMode(settings) },
  });

  let priceSeries: ISeriesApi<any> = buildPriceSeries(chart, settings.chartType);
  let currentType: ChartType = settings.chartType;
  const overlays = new Map<string, ISeriesApi<"Line">>();
  let volSeries: ISeriesApi<"Histogram"> | null = null;

  if (onCrosshair) {
    chart.subscribeCrosshairMove((param) => {
      const time = param.time ? Number(param.time) * 1000 : null;
      const p = param.seriesData.get(priceSeries) as { close?: number; value?: number } | undefined;
      const price = p ? (p.close ?? p.value ?? null) : null;
      onCrosshair({ price: price ?? null, time });
    });
  }

  return {
    kind: "lightweight-charts",
    setCandles(candles) {
      applyCandles(priceSeries, currentType, candles);
      chart.timeScale().fitContent();
    },
    updateLastCandle(candle) {
      try { updateLast(priceSeries, currentType, [candle]); } catch { /* series torn down */ }
    },
    applySettings(next) {
      chart.applyOptions({
        grid: {
          vertLines: { visible: next.showGrid },
          horzLines: { visible: next.showGrid },
        },
        crosshair: { mode: crosshairMode(next) },
        rightPriceScale: {
          mode: priceMode(next),
          autoScale: next.autoScale,
          invertScale: next.priceScale === "inverted",
        },
      });
    },
    setChartType(type) {
      if (type === currentType) return;
      chart.removeSeries(priceSeries);
      priceSeries = buildPriceSeries(chart, type);
      currentType = type;
    },
    syncOverlayIndicators(indicators, candles) {
      if (!candles.length) return;
      const closes = candles.map((c) => c.close);
      const active = new Set<string>();
      indicators
        .filter((i) => i.pane !== "sub" && i.visible !== false)
        .forEach((cfg, idx) => {
          const color = cfg.color ?? INDICATOR_COLORS[idx % INDICATOR_COLORS.length];
          const buckets = computeOverlay(cfg, candles, closes);
          buckets.forEach((series, key) => {
            const id = `${cfg.id}:${key}`;
            active.add(id);
            let s = overlays.get(id);
            if (!s) {
              s = chart.addSeries(LineSeries, { color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
              overlays.set(id, s);
            }
            s.setData(
              series.map((v, i) => ({ time: (candles[i].time / 1000) as UTCTimestamp, value: v }))
                .filter((p) => Number.isFinite(p.value)) as any,
            );
          });
        });
      for (const [id, s] of overlays) {
        if (!active.has(id)) { chart.removeSeries(s); overlays.delete(id); }
      }
    },
    setVolumeVisible(visible, candles) {
      if (visible && !volSeries) {
        volSeries = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "vol" });
        chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
      }
      if (!visible && volSeries) { chart.removeSeries(volSeries); volSeries = null; }
      if (volSeries) {
        volSeries.setData(candles.map((c) => ({
          time: (c.time / 1000) as UTCTimestamp, value: c.volume,
          color: c.close >= c.open ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)",
        })) as any);
      }
    },
    priceToY(price) { try { return priceSeries.priceToCoordinate(price) ?? null; } catch { return null; } },
    yToPrice(y) { try { return priceSeries.coordinateToPrice(y) as number ?? null; } catch { return null; } },
    timeToX(timeMs) { try { return chart.timeScale().timeToCoordinate((timeMs / 1000) as UTCTimestamp) ?? null; } catch { return null; } },
    xToTime(x) {
      try {
        const t = chart.timeScale().coordinateToTime(x);
        return t ? Number(t) * 1000 : null;
      } catch { return null; }
    },
    async screenshot() {
      const canvas = chart.takeScreenshot();
      return await new Promise<Blob | null>((r) => canvas.toBlob((b) => r(b), "image/png"));
    },
    fitContent() { chart.timeScale().fitContent(); },
    resetPriceScale() { chart.priceScale("right").applyOptions({ autoScale: true }); },
    destroy() { chart.remove(); overlays.clear(); volSeries = null; },
  } satisfies ChartAdapter;
};

function priceMode(s: ChartSettings) {
  return s.priceScale === "log" ? 1 : s.priceScale === "percentage" ? 2 : 0;
}
function crosshairMode(s: ChartSettings) {
  return s.crosshair === "magnet" ? LWCrosshair.Magnet
    : s.crosshair === "hidden" ? LWCrosshair.Hidden
    : LWCrosshair.Normal;
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
      map.set("supertrend", candles.map((c, i) => (c.high + c.low) / 2 - mult * a[i])); break;
    }
    case "ichimoku": {
      map.set("conv", donchian(candles, p.conversion ?? 9).mid);
      map.set("base", donchian(candles, p.base ?? 26).mid); break;
    }
    case "fib": {
      const f = fibonacci(candles, p.length ?? 120);
      for (const [k, v] of Object.entries(f)) map.set(`fib_${k}`, v);
      break;
    }
    case "sr": {
      const s = supportResistance(candles, p.left ?? 5, p.right ?? 5, p.levels ?? 6);
      map.set("resistance", s.resistance);
      map.set("support", s.support);
      break;
    }
    case "sessions": {
      const s = sessions(candles);
      map.set("asia", s.asia); map.set("london", s.london); map.set("ny", s.ny);
      break;
    }
    case "smc": {
      const s = smc(candles, p.pivot ?? 3);
      map.set("swing_high", s.swing_high);
      map.set("swing_low", s.swing_low);
      map.set("bos", s.bos);
      map.set("fvg", s.fvg);
      break;
    }
    default: break;
  }
  return map;
}

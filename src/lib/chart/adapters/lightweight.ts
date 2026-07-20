/**
 * Lightweight-Charts adapter implementing ChartAdapter.
 *
 * Encapsulates every call to `lightweight-charts` — the rest of the app
 * only sees the ChartAdapter interface. Replacing this file with a
 * TradingView Advanced Charts adapter is the migration path.
 */

import {
  createChart, CandlestickSeries, LineSeries, AreaSeries, BarSeries, BaselineSeries, HistogramSeries,
  createSeriesMarkers, CrosshairMode as LWCrosshair, ColorType,
  type IChartApi, type ISeriesApi, type ISeriesMarkersPluginApi, type SeriesMarker, type UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "@/lib/market-data/types";
import type { ChartAdapter, ChartAdapterFactory } from "../adapter";
import type { ChartSettings, ChartType, IndicatorConfig } from "../types";
import { ema, sma, bollinger, vwap, atr, donchian, heikinAshi, fibonacci, supportResistance, sessions, smc, rsi, macd } from "../indicators";

const INDICATOR_COLORS = ["#22d3ee", "#a78bfa", "#f472b6", "#f59e0b", "#34d399", "#f87171", "#60a5fa"];

export const createLightweightAdapter: ChartAdapterFactory = ({ container, settings, onCrosshair }) => {
  // lightweight-charts' color parser doesn't accept oklch()/color-mix(). Resolve any
  // CSS color string to a concrete rgb()/rgba() via the browser before passing it in.
  const resolveColor = (value: string, fallback: string): string => {
    if (typeof window === "undefined") return fallback;
    const el = document.createElement("div");
    el.style.color = "";
    el.style.color = value;
    document.body.appendChild(el);
    const resolved = getComputedStyle(el).color;
    document.body.removeChild(el);
    return resolved && resolved !== "" ? resolved : fallback;
  };
  const cs = typeof window !== "undefined" ? getComputedStyle(document.documentElement) : null;
  const cssVar = (name: string, fallback: string) => (cs?.getPropertyValue(name).trim() || fallback);
  const textColor = resolveColor(cssVar("--muted-foreground", "#94a3b8"), "#94a3b8");
  const fg = cssVar("--foreground", "#94a3b8");
  const gridColor = resolveColor(`color-mix(in oklab, ${fg} 8%, transparent)`, "rgba(148,163,184,0.08)");
  const borderColor = resolveColor(`color-mix(in oklab, ${fg} 15%, transparent)`, "rgba(148,163,184,0.15)");
  // Resolve a concrete background — lightweight-charts' attribution-logo widget
  // parses this to pick a light/dark variant and its parser rejects oklch().
  const bgColor = resolveColor(cssVar("--card", "#0f172a"), "#0f172a");
  const chart = createChart(container, {
    autoSize: true,
    layout: {
      background: { type: ColorType.Solid, color: bgColor },
      textColor,
      fontFamily: "ui-sans-serif, system-ui",
    },

    grid: {
      vertLines: { color: gridColor, visible: settings.showGrid },
      horzLines: { color: gridColor, visible: settings.showGrid },
    },
    rightPriceScale: {
      borderColor,
      mode: priceMode(settings),
      autoScale: settings.autoScale,
      invertScale: settings.priceScale === "inverted",
    },
    timeScale: { borderColor, timeVisible: true, secondsVisible: false },
    crosshair: { mode: crosshairMode(settings) },
  });

  let priceSeries: ISeriesApi<any> = buildPriceSeries(chart, settings.chartType);
  let currentType: ChartType = settings.chartType;
  const overlays = new Map<string, ISeriesApi<"Line">>();
  const subPanes = new Map<string, { series: ISeriesApi<any>; paneIndex: number }>();
  const sessionSeries = new Map<string, ISeriesApi<"Histogram">>();
  const smcBoxSeries = new Map<string, ISeriesApi<"Line">>();
  let smcMarkers: ISeriesMarkersPluginApi<UTCTimestamp> | null = null;
  let externalMarkers: ISeriesMarkersPluginApi<UTCTimestamp> | null = null;

  const SESSION_COLORS: Record<string, string> = {
    asia: "#a78bfa",
    london: "#60a5fa",
    ny: "#fb923c",
  };
  const SMC_BOX_COLORS: Record<string, string> = {
    fvg_bull: "rgba(34,197,94,0.9)",
    fvg_bear: "rgba(239,68,68,0.9)",
    ob_bull: "rgba(34,197,94,0.9)",
    ob_bear: "rgba(239,68,68,0.9)",
  };
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
      // Marker plugins were bound to the old series — drop them so callers
      // re-attach on the next sync.
      smcMarkers = null;
      externalMarkers = null;
    },

    syncOverlayIndicators(indicators, candles) {
      if (!candles.length) return;
      const closes = candles.map((c) => c.close);
      const active = new Set<string>();
      const activeSessions = new Set<string>();
      const activeSmcBoxes = new Set<string>();
      let smcHandled = false;
      indicators
        .filter((i) => i.pane !== "sub" && i.visible !== false)
        .forEach((cfg, idx) => {
          const color = cfg.color ?? INDICATOR_COLORS[idx % INDICATOR_COLORS.length];

          // Sessions render as colored bars pinned to the bottom of the pane.
          if (cfg.key === "sessions") {
            const s = sessions(candles);
            const buckets: Record<string, number[]> = { asia: s.asia, london: s.london, ny: s.ny };
            for (const [name, arr] of Object.entries(buckets)) {
              const id = `${cfg.id}:${name}`;
              activeSessions.add(id);
              let hs = sessionSeries.get(id);
              if (!hs) {
                hs = chart.addSeries(HistogramSeries, {
                  priceScaleId: `sess_${name}`,
                  color: SESSION_COLORS[name],
                  priceLineVisible: false,
                  lastValueVisible: false,
                  base: 0,
                });
                chart.priceScale(`sess_${name}`).applyOptions({
                  scaleMargins: { top: 0.97, bottom: 0 },
                  visible: false,
                });
                sessionSeries.set(id, hs);
              }
              hs.setData(
                candles
                  .map((c, i) => ({ time: (c.time / 1000) as UTCTimestamp, value: Number.isFinite(arr[i]) ? 1 : 0, color: SESSION_COLORS[name] }))
                  .filter((p) => p.value > 0) as any,
              );
            }
            return;
          }

          // SMC/ICT renders swing lines + BOS/CHoCH markers + FVG/OB boxes.
          if (cfg.key === "smc") {
            smcHandled = true;
            const s = smc(candles, (cfg.params.pivot as number) ?? 3);
            const showSwings = (cfg.params.show_swings ?? 1) !== 0;
            const showBos = (cfg.params.show_bos ?? 1) !== 0;
            const showFvg = (cfg.params.show_fvg ?? 1) !== 0;
            const showOb = (cfg.params.show_ob ?? 1) !== 0;
            const lineBuckets: Record<string, { data: number[]; color: string; dash?: boolean }> = {
              ...(showSwings ? { swing_high: { data: s.swing_high, color: "#22c55e" }, swing_low: { data: s.swing_low, color: "#ef4444" } } : {}),
              ...(showBos ? { bos: { data: s.bos, color: "#60a5fa", dash: true } } : {}),
            } as any;
            
            for (const [key, { data, color: c, dash }] of Object.entries(lineBuckets)) {
              const id = `${cfg.id}:${key}`;
              active.add(id);
              let ln = overlays.get(id);
              if (!ln) {
                ln = chart.addSeries(LineSeries, {
                  color: c, lineWidth: 2, priceLineVisible: false, lastValueVisible: false,
                  lineStyle: dash ? 2 : 0,
                });
                overlays.set(id, ln);
              }
              ln.setData(
                data.map((v, i) => ({ time: (candles[i].time / 1000) as UTCTimestamp, value: v }))
                  .filter((p) => Number.isFinite(p.value)) as any,
              );
            }
            // FVG / OB boxes: render each as top+bottom line segments (chart box).
            const visibleBoxes = s.boxes.filter((b) =>
              b.kind.startsWith("fvg") ? showFvg : b.kind.startsWith("ob") ? showOb : true,
            );
            visibleBoxes.forEach((box, bi) => {
              const color = SMC_BOX_COLORS[box.kind];
              const dashed = box.kind.startsWith("ob");
              (["top", "bottom"] as const).forEach((edge) => {
                const id = `${cfg.id}:box${bi}:${edge}`;
                activeSmcBoxes.add(id);
                let ln = smcBoxSeries.get(id);
                if (!ln) {
                  ln = chart.addSeries(LineSeries, {
                    color, lineWidth: 1, lineStyle: dashed ? 2 : 0,
                    priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
                  });
                  smcBoxSeries.set(id, ln);
                }
                const v = edge === "top" ? box.top : box.bottom;
                ln.setData([
                  { time: (box.time / 1000) as UTCTimestamp, value: v },
                  { time: (box.endTime / 1000) as UTCTimestamp, value: v },
                ] as any);
              });
            });
            // Swing + BOS markers via the plugin.
            const markers: SeriesMarker<UTCTimestamp>[] = s.markers
              .filter((m) => {
                const isBos = /BOS|CHoCH/i.test(m.text ?? "");
                if (isBos) return showBos;
                return showSwings;
              })
              .map((m) => ({
                time: (m.time / 1000) as UTCTimestamp,
                position: m.position,
                shape: m.shape,
                color: m.color,
                text: m.text,
              }));
            if (!smcMarkers) smcMarkers = createSeriesMarkers(priceSeries, markers) as any;
            else smcMarkers.setMarkers(markers);
            return;
          }

          const buckets = computeOverlay(cfg, candles, closes);
          buckets.forEach((series, key) => {
            const id = `${cfg.id}:${key}`;
            active.add(id);
            let ln = overlays.get(id);
            if (!ln) {
              ln = chart.addSeries(LineSeries, { color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
              overlays.set(id, ln);
            }
            ln.setData(
              series.map((v, i) => ({ time: (candles[i].time / 1000) as UTCTimestamp, value: v }))
                .filter((p) => Number.isFinite(p.value)) as any,
            );
          });
        });
      for (const [id, s] of overlays) {
        if (!active.has(id)) { chart.removeSeries(s); overlays.delete(id); }
      }
      for (const [id, s] of sessionSeries) {
        if (!activeSessions.has(id)) { chart.removeSeries(s); sessionSeries.delete(id); }
      }
      for (const [id, s] of smcBoxSeries) {
        if (!activeSmcBoxes.has(id)) { chart.removeSeries(s); smcBoxSeries.delete(id); }
      }
      if (!smcHandled && smcMarkers) { smcMarkers.setMarkers([]); }
    },
    syncSubPaneIndicators(indicators, candles) {
      if (!candles.length) return;
      const closes = candles.map((c) => c.close);
      const active = new Set<string>();
      // Assign each configured sub indicator a dedicated pane index (1, 2, 3…).
      // Volume stays in the overlay margin; not handled here.
      const oscillators = indicators.filter(
        (i) => i.pane === "sub" && i.visible !== false && i.key !== "volume",
      );
      oscillators.forEach((cfg, i) => {
        const paneIndex = i + 1;
        const series = computeSub(cfg, candles, closes);
        for (const [key, { data, color, type, extra }] of Object.entries(series)) {
          const id = `${cfg.id}:${key}`;
          active.add(id);
          let entry = subPanes.get(id);
          if (!entry || entry.paneIndex !== paneIndex) {
            if (entry) chart.removeSeries(entry.series);
            const s = type === "histogram"
              ? chart.addSeries(HistogramSeries, { color, priceLineVisible: false, lastValueVisible: false, ...extra }, paneIndex)
              : chart.addSeries(LineSeries, { color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, ...extra }, paneIndex);
            entry = { series: s, paneIndex };
            subPanes.set(id, entry);
          }
          entry.series.setData(
            data
              .map((v, idx) => ({ time: (candles[idx].time / 1000) as UTCTimestamp, value: v }))
              .filter((p) => Number.isFinite(p.value)) as any,
          );
        }
      });
      for (const [id, entry] of subPanes) {
        if (!active.has(id)) { try { chart.removeSeries(entry.series); } catch { /* removed with pane */ } subPanes.delete(id); }
      }
      // Compact pane heights so oscillators get ~120px each.
      try {
        const panes = chart.panes();
        const container = chart.chartElement();
        const totalH = container.clientHeight || 600;
        const oscPaneCount = panes.length - 1;
        if (oscPaneCount > 0) {
          const oscH = Math.min(140, Math.max(90, (totalH * 0.28) / oscPaneCount));
          panes.slice(1).forEach((p) => p.setHeight(oscH));
        }
      } catch { /* older builds */ }
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
    addPriceLine(opts) {
      const line = priceSeries.createPriceLine({
        price: opts.price,
        color: resolveColor(opts.color, "#60a5fa"),
        title: opts.title ?? "",
        lineStyle: (opts.lineStyle ?? 2) as any,
        lineWidth: (opts.lineWidth ?? 1) as any,
        axisLabelVisible: opts.axisLabelVisible ?? true,
      });
      return {
        remove: () => { try { priceSeries.removePriceLine(line); } catch { /* series torn down */ } },
        applyOptions: (o) => {
          const patch: any = { ...o };
          if (o.color) patch.color = resolveColor(o.color, "#60a5fa");
          if (o.lineStyle != null) patch.lineStyle = o.lineStyle;
          if (o.lineWidth != null) patch.lineWidth = o.lineWidth;
          line.applyOptions(patch);
        },
      };
    },
    setExternalMarkers(markers) {
      const mapped: SeriesMarker<UTCTimestamp>[] = markers.map((m) => ({
        time: (m.timeMs / 1000) as UTCTimestamp,
        position: m.position,
        shape: m.shape,
        color: resolveColor(m.color, "#a855f7"),
        text: m.text,
      }));
      if (!externalMarkers) externalMarkers = createSeriesMarkers(priceSeries, mapped) as any;
      else externalMarkers.setMarkers(mapped);
    },
    destroy() {
      chart.remove();
      overlays.clear(); subPanes.clear(); sessionSeries.clear(); smcBoxSeries.clear();
      smcMarkers = null; externalMarkers = null; volSeries = null;
    },
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
    // sessions + smc: handled separately in syncOverlayIndicators.
    default: break;
  }
  return map;
}

type SubSeriesSpec = { data: number[]; color: string; type: "line" | "histogram"; extra?: Record<string, unknown> };

function computeSub(cfg: IndicatorConfig, candles: Candle[], closes: number[]): Record<string, SubSeriesSpec> {
  const p = cfg.params;
  switch (cfg.key) {
    case "rsi": {
      const v = rsi(closes, p.length ?? 14);
      return { rsi: { data: v, color: "#a78bfa", type: "line" } };
    }
    case "macd": {
      const m = macd(closes, p.fast ?? 12, p.slow ?? 26, p.signal ?? 9);
      return {
        macd: { data: m.macdLine, color: "#22d3ee", type: "line" },
        signal: { data: m.signal, color: "#f59e0b", type: "line" },
        hist: { data: m.hist, color: "#64748b", type: "histogram" },
      };
    }
    case "atr": {
      const v = atr(candles, p.length ?? 14);
      return { atr: { data: v, color: "#34d399", type: "line" } };
    }
    case "stochastic": {
      const k = p.k ?? 14;
      const dLen = p.d ?? 3;
      const kv: number[] = [];
      for (let i = 0; i < candles.length; i++) {
        const s = Math.max(0, i - k + 1);
        const slice = candles.slice(s, i + 1);
        const hi = Math.max(...slice.map((c) => c.high));
        const lo = Math.min(...slice.map((c) => c.low));
        kv.push(hi === lo ? 50 : ((candles[i].close - lo) / (hi - lo)) * 100);
      }
      return {
        k: { data: kv, color: "#22d3ee", type: "line" },
        d: { data: sma(kv, dLen), color: "#f59e0b", type: "line" },
      };
    }
    case "cci": {
      const length = p.length ?? 20;
      const tp = candles.map((c) => (c.high + c.low + c.close) / 3);
      const out: number[] = [];
      for (let i = 0; i < tp.length; i++) {
        const s = Math.max(0, i - length + 1);
        const slice = tp.slice(s, i + 1);
        const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
        const md = slice.reduce((a, b) => a + Math.abs(b - mean), 0) / slice.length;
        out.push(md === 0 ? 0 : (tp[i] - mean) / (0.015 * md));
      }
      return { cci: { data: out, color: "#a78bfa", type: "line" } };
    }
    case "obv": {
      const out: number[] = [0];
      for (let i = 1; i < candles.length; i++) {
        const prev = out[i - 1];
        out.push(candles[i].close > candles[i - 1].close ? prev + candles[i].volume : candles[i].close < candles[i - 1].close ? prev - candles[i].volume : prev);
      }
      return { obv: { data: out, color: "#22d3ee", type: "line" } };
    }
    default:
      return {};
  }
}


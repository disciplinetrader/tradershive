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
  type ISeriesPrimitive, type IPrimitivePaneView, type Logical,
} from "lightweight-charts";
import type { Candle } from "@/lib/market-data/types";
import type { ChartAdapter, ChartAdapterFactory, DrawingsSource } from "../adapter";
import type { ChartCoords } from "../drawings/types";
import type { ChartSettings, ChartType, IndicatorConfig } from "../types";
import { ema, sma, bollinger, vwap, atr, donchian, heikinAshi, fibonacci, supportResistance, smc, rsi, macd } from "../indicators";

const INDICATOR_COLORS = ["#22d3ee", "#a78bfa", "#f472b6", "#f59e0b", "#34d399", "#f87171", "#60a5fa"];

function safeLocale() {
  if (typeof navigator === "undefined") return "en-US";
  const fallback = "en-US";
  const candidates = [navigator.language, ...(Array.isArray(navigator.languages) ? navigator.languages : [])]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .map((value) => value.replace(/@.*$/, ""));
  for (const candidate of candidates) {
    try {
      Intl.DateTimeFormat(candidate);
      return candidate;
    } catch {
      /* try next */
    }
  }
  return fallback;
}

function containerSize(container: HTMLElement) {
  const rect = container.getBoundingClientRect();
  return {
    width: Math.max(1, Math.floor(rect.width || container.clientWidth || 800)),
    height: Math.max(1, Math.floor(rect.height || container.clientHeight || 480)),
  };
}

/** The browser's IANA timezone, falling back to UTC on locked-down runtimes. */
export function browserTimezone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
}

function resolveTimezone(tz: string | undefined): string {
  if (!tz || tz === "auto" || tz === "local") return browserTimezone();
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return tz; } catch { return "UTC"; }
}

/** Offset (in ms) that must be ADDED to a UTC instant to get wall-clock time in `tz`. */
function tzOffsetMs(epochMs: number, tz: string): number {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    const p: Record<string, string> = {};
    for (const part of dtf.formatToParts(new Date(epochMs))) if (part.type !== "literal") p[part.type] = part.value;
    const asUTC = Date.UTC(
      Number(p.year), Number(p.month) - 1, Number(p.day),
      p.hour === "24" ? 0 : Number(p.hour), Number(p.minute), Number(p.second),
    );
    return asUTC - epochMs;
  } catch { return 0; }
}

/** LWC hands back seconds; normalise to epoch ms. */
function toEpochMs(time: any): number {
  const n = typeof time === "number" ? time : Number(time);
  if (!Number.isFinite(n)) return Date.now();
  return n < 1e12 ? n * 1000 : n;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

function zonedFields(epochMs: number, tz: string) {
  const shifted = new Date(epochMs + tzOffsetMs(epochMs, tz));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function makeTickFormatter(tz: string) {
  return (time: any, tickMarkType: number) => {
    const f = zonedFields(toEpochMs(time), tz);
    // 0=Year 1=Month 2=DayOfMonth 3=Time 4=TimeWithSeconds
    if (tickMarkType === 0) return String(f.year);
    if (tickMarkType === 1) return MONTHS[f.month - 1];
    if (tickMarkType === 2) return `${f.day} ${MONTHS[f.month - 1]}`;
    return `${pad2(f.hour)}:${pad2(f.minute)}`;
  };
}

function makeTimeFormatter(tz: string) {
  return (time: any) => {
    const f = zonedFields(toEpochMs(time), tz);
    return `${f.day} ${MONTHS[f.month - 1]} ${f.year}  ${pad2(f.hour)}:${pad2(f.minute)}`;
  };
}


export const createLightweightAdapter: ChartAdapterFactory = ({ container, settings, onCrosshair }) => {
  // lightweight-charts' color parser doesn't accept oklch()/color-mix(). Resolve any
  // CSS color to a concrete rgb()/rgba() via a canvas — getComputedStyle keeps
  // oklch() in its serialized form on modern Chromium, but canvas fillStyle
  // always normalises to `rgba(r, g, b, a)` (or `#rrggbb`).
  const resolveColor = (value: string, fallback: string): string => {
    if (typeof document === "undefined") return fallback;
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return fallback;
      ctx.fillStyle = "#000"; // reset baseline
      ctx.fillStyle = value;
      const resolved = ctx.fillStyle as string;
      if (!resolved) return fallback;
      // Some engines still hand back oklch — fall back to painting a pixel
      // and reading it out.
      if (/oklch|oklab|color\(|color-mix/i.test(resolved)) {
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
        return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
      }
      return resolved;
    } catch { return fallback; }
  };

  const readThemeColors = () => {
    const cs = typeof window !== "undefined" ? getComputedStyle(document.documentElement) : null;
    const cssVar = (name: string, fallback: string) => (cs?.getPropertyValue(name).trim() || fallback);
    const textColor = resolveColor(cssVar("--muted-foreground", "#94a3b8"), "#94a3b8");
    const fg = cssVar("--foreground", "#94a3b8");
    const gridColor = resolveColor(`color-mix(in oklab, ${fg} 8%, transparent)`, "rgba(148,163,184,0.08)");
    const borderColor = resolveColor(`color-mix(in oklab, ${fg} 15%, transparent)`, "rgba(148,163,184,0.15)");
    const bgColor = resolveColor(cssVar("--card", "#0f172a"), "#0f172a");
    return { textColor, gridColor, borderColor, bgColor };
  };
  let themeColors = readThemeColors();
  // Axis + crosshair times render in the user's timezone (auto-detected unless
  // the workspace pins one), so session bands line up with local wall clock.
  let displayTz = resolveTimezone(settings.timezone);
  const initialSize = containerSize(container);

  const chart = createChart(container, {
    width: initialSize.width,
    height: initialSize.height,
    layout: {
      background: { type: ColorType.Solid, color: themeColors.bgColor },
      textColor: themeColors.textColor,
      fontFamily: "ui-sans-serif, system-ui",
    },

    grid: {
      vertLines: { color: themeColors.gridColor, visible: settings.showGrid },
      horzLines: { color: themeColors.gridColor, visible: settings.showGrid },
    },
    rightPriceScale: {
      borderColor: themeColors.borderColor,
      mode: priceMode(settings),
      autoScale: settings.autoScale,
      invertScale: settings.priceScale === "inverted",
    },
    localization: { locale: safeLocale(), timeFormatter: makeTimeFormatter(displayTz) },
    timeScale: {
      borderColor: themeColors.borderColor, visible: true, borderVisible: true,
      timeVisible: true, secondsVisible: false,
      tickMarkFormatter: makeTickFormatter(displayTz),
    },
    crosshair: { mode: crosshairMode(settings) },
  });


  let destroyed = false;
  let resizeFrame: number | null = null;
  const resizeToContainer = () => {
    if (destroyed) return;
    const next = containerSize(container);
    chart.resize(next.width, next.height);
  };
  const scheduleResize = () => {
    if (typeof requestAnimationFrame === "undefined") {
      resizeToContainer();
      return;
    }
    if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = null;
      resizeToContainer();
    });
  };
  const resizeObserver = typeof ResizeObserver !== "undefined"
    ? new ResizeObserver(() => scheduleResize())
    : null;
  resizeObserver?.observe(container);
  scheduleResize();
  if (typeof window !== "undefined") window.setTimeout(scheduleResize, 100);

  // React to light/dark theme changes without remounting the chart. The theme
  // provider toggles the `dark` class on <html>; watch it and re-apply layout
  // colors resolved from the new CSS variables.
  const applyThemeColors = () => {
    themeColors = readThemeColors();
    chart.applyOptions({
      layout: { background: { type: ColorType.Solid, color: themeColors.bgColor }, textColor: themeColors.textColor },
      grid: { vertLines: { color: themeColors.gridColor }, horzLines: { color: themeColors.gridColor } },
      rightPriceScale: { borderColor: themeColors.borderColor },
      timeScale: { borderColor: themeColors.borderColor },
    });
  };
  const themeObserver = typeof MutationObserver !== "undefined"
    ? new MutationObserver(() => applyThemeColors())
    : null;
  themeObserver?.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });


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
  // Full-height background bands at 10% opacity (TradingView-style shading).
  const SESSION_FILLS: Record<string, string> = {
    asia: "rgba(167,139,250,0.10)",
    london: "rgba(96,165,250,0.10)",
    ny: "rgba(251,146,60,0.10)",
  };

  const SMC_BOX_COLORS: Record<string, string> = {
    fvg_bull: "rgba(34,197,94,0.9)",
    fvg_bear: "rgba(239,68,68,0.9)",
    ob_bull: "rgba(34,197,94,0.9)",
    ob_bear: "rgba(239,68,68,0.9)",
  };
  let volSeries: ISeriesApi<"Histogram"> | null = null;

  // ── Chart-coordinate machinery ─────────────────────────────────────────
  // Times of the currently loaded bars. Used to turn an arbitrary timestamp
  // into a *fractional logical index*, which the time scale then converts to
  // a pixel. Going through logical indices (instead of timeToCoordinate)
  // keeps drawings anchored even when their timestamp falls between bars or
  // beyond the last bar — exactly how TradingView anchors objects.
  let barTimes: number[] = [];
  let barStep = 60_000;

  const recomputeBars = (candles: Candle[]) => {
    barTimes = candles.map((c) => c.time);
    if (barTimes.length > 1) {
      const diffs: number[] = [];
      for (let i = 1; i < Math.min(barTimes.length, 40); i++) diffs.push(barTimes[i] - barTimes[i - 1]);
      diffs.sort((a, b) => a - b);
      barStep = diffs[Math.floor(diffs.length / 2)] || barStep;
    }
  };

  /** timestamp (ms) → fractional logical index */
  const timeToLogical = (timeMs: number): number | null => {
    if (!barTimes.length) return null;
    const first = barTimes[0];
    const lastIdx = barTimes.length - 1;
    const last = barTimes[lastIdx];
    if (timeMs <= first) return (timeMs - first) / barStep;
    if (timeMs >= last) return lastIdx + (timeMs - last) / barStep;
    let lo = 0, hi = lastIdx;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (barTimes[mid] <= timeMs) lo = mid; else hi = mid;
    }
    const span = barTimes[hi] - barTimes[lo] || barStep;
    return lo + (timeMs - barTimes[lo]) / span;
  };

  /** fractional logical index → timestamp (ms) */
  const logicalToTime = (logical: number): number | null => {
    if (!barTimes.length) return null;
    const lastIdx = barTimes.length - 1;
    if (logical <= 0) return barTimes[0] + logical * barStep;
    if (logical >= lastIdx) return barTimes[lastIdx] + (logical - lastIdx) * barStep;
    const lo = Math.floor(logical);
    const frac = logical - lo;
    const span = (barTimes[lo + 1] ?? barTimes[lo] + barStep) - barTimes[lo];
    return barTimes[lo] + frac * span;
  };

  let priceFormatter: (p: number) => string = (p) => p.toFixed(4);

  const buildCoords = (): ChartCoords | null => {
    const size = containerSize(container);
    const ts = chart.timeScale();
    return {
      width: size.width - (chart.priceScale("right").width?.() ?? 0),
      height: size.height,
      formatPrice: (p: number) => priceFormatter(p),
      x(timeMs: number) {
        const logical = timeToLogical(timeMs);
        if (logical == null) return null;
        const v = ts.logicalToCoordinate(logical as Logical);
        return v == null ? null : v;
      },
      y(price: number) {
        try { return priceSeries.priceToCoordinate(price) ?? null; } catch { return null; }
      },
      timeAt(x: number) {
        const logical = ts.coordinateToLogical(x);
        return logical == null ? null : logicalToTime(Number(logical));
      },
      priceAt(y: number) {
        try {
          const p = priceSeries.coordinateToPrice(y);
          return p == null ? null : Number(p);
        } catch { return null; }
      },
    };
  };

  // ── Drawings primitive: painted inside the chart's own paint cycle ─────
  let drawingsSource: DrawingsSource | null = null;
  let requestPrimitiveUpdate: (() => void) | null = null;

  const drawingsPaneView: IPrimitivePaneView = {
    zOrder: () => "top",
    renderer: () => ({
      draw: (target: any) => {
        const src = drawingsSource;
        if (!src) return;
        target.useMediaCoordinateSpace(({ context, mediaSize }: any) => {
          const coords = buildCoords();
          if (!coords) return;
          coords.width = mediaSize.width;
          coords.height = mediaSize.height;
          context.save();
          try { src.draw(context as CanvasRenderingContext2D, coords); } finally { context.restore(); }
        });
      },
    }),
  };

  const drawingsPrimitive: ISeriesPrimitive<UTCTimestamp> = {
    paneViews: () => [drawingsPaneView],
    attached: (param: any) => { requestPrimitiveUpdate = param.requestUpdate; },
    detached: () => { requestPrimitiveUpdate = null; },
  } as unknown as ISeriesPrimitive<UTCTimestamp>;

  // ── Session shading primitive: 10% bands + range box + name label ──────
  type SessionBand = {
    start: number; end: number; color: string; name: string; label: string;
    stroke: string; high: number | null; low: number | null;
  };
  let sessionBands: SessionBand[] = [];
  let sessionsUpdate: (() => void) | null = null;

  const sessionsPaneView: IPrimitivePaneView = {
    zOrder: () => "bottom",
    renderer: () => ({
      draw: (target: any) => {
        if (!sessionBands.length) return;
        target.useMediaCoordinateSpace(({ context, mediaSize }: any) => {
          const coords = buildCoords();
          if (!coords) return;
          const ctx = context as CanvasRenderingContext2D;
          ctx.save();
          for (const b of sessionBands) {
            const x1 = coords.x(b.start);
            const x2 = coords.x(b.end);
            if (x1 == null || x2 == null) continue;
            const left = Math.max(0, Math.min(x1, x2));
            const right = Math.min(mediaSize.width, Math.max(x1, x2));
            if (right <= 0 || left >= mediaSize.width || right - left < 0.5) continue;
            ctx.fillStyle = b.color;
            ctx.fillRect(left, 0, right - left, mediaSize.height);

            // Session trading range: high/low box over the shaded window.
            let boxTop: number | null = null;
            if (b.high != null && b.low != null) {
              const yHigh = coords.y(b.high);
              const yLow = coords.y(b.low);
              if (yHigh != null && yLow != null) {
                const top = Math.min(yHigh, yLow);
                const height = Math.max(Math.abs(yLow - yHigh), 1);
                boxTop = top;
                ctx.save();
                ctx.setLineDash([4, 3]);
                ctx.lineWidth = 1;
                ctx.strokeStyle = b.stroke;
                ctx.strokeRect(left + 0.5, top + 0.5, Math.max(right - left - 1, 1), height);
                ctx.restore();
              }
            }

            // Session name label, pinned to the top of its range (or pane).
            if (right - left > 34) {
              ctx.save();
              ctx.font = "600 10px Inter, system-ui, sans-serif";
              ctx.textBaseline = "middle";
              const text = b.label;
              const w = ctx.measureText(text).width + 10;
              const lx = Math.min(left + 4, right - w - 2);
              const ly = Math.max((boxTop ?? 0) - 9, 8);
              ctx.fillStyle = b.stroke;
              ctx.globalAlpha = 0.18;
              ctx.fillRect(lx, ly - 7, w, 14);
              ctx.globalAlpha = 1;
              ctx.fillStyle = b.stroke;
              ctx.fillText(text, lx + 5, ly);
              ctx.restore();
            }
          }
          ctx.restore();
        });
      },
    }),
  };

  const sessionsPrimitive: ISeriesPrimitive<UTCTimestamp> = {
    paneViews: () => [sessionsPaneView],
    attached: (param: any) => { sessionsUpdate = param.requestUpdate; },
    detached: () => { sessionsUpdate = null; },
  } as unknown as ISeriesPrimitive<UTCTimestamp>;

  /** Default UTC session windows (non-DST baseline), matching indicators.sessions(). */
  const SESSION_WINDOWS: { name: string; label: string; from: number; to: number }[] = [
    { name: "asia", label: "ASIA", from: 0, to: 9 },
    { name: "london", label: "LONDON", from: 8, to: 17 },
    { name: "ny", label: "NEW YORK", from: 13, to: 22 },
  ];

  const SESSION_STROKES: Record<string, string> = {
    asia: "rgba(167,139,250,0.85)",
    london: "rgba(96,165,250,0.85)",
    ny: "rgba(251,146,60,0.85)",
  };

  /**
   * Session bands are anchored to real UTC market hours; the axis renders in
   * the user's timezone, so a 00:00 UTC Asia open correctly appears at 05:30
   * for IST. Users can still override each window (in UTC hours) from the
   * indicator settings dialog.
   */
  const computeSessionBands = (candles: Candle[], params: Record<string, number> = {}) => {
    const bands: SessionBand[] = [];
    if (!candles.length) return bands;
    const first = candles[0].time;
    const last = candles[candles.length - 1].time + barStep;
    const DAY = 86_400_000;
    // Sessions only make sense on intraday data — a daily bar spans them all.
    if (barStep >= DAY) return bands;
    const windows = SESSION_WINDOWS.map((w) => ({
      name: w.name,
      label: w.label,
      from: Number.isFinite(params[`${w.name}_start`]) ? params[`${w.name}_start`] : w.from,
      to: Number.isFinite(params[`${w.name}_end`]) ? params[`${w.name}_end`] : w.to,
    }));
    for (let day = Math.floor(first / DAY) * DAY; day <= last + DAY; day += DAY) {
      for (const w of windows) {
        // A window whose end wraps past midnight continues into the next day.
        const rawEnd = w.to > w.from ? w.to : w.to + 24;
        const start = Math.max(day + w.from * 3_600_000, first);
        const end = Math.min(day + rawEnd * 3_600_000, last);
        if (end <= start) continue;
        // Trading range of the session = high/low of the bars inside it.
        let high: number | null = null;
        let low: number | null = null;
        // Binary search the first bar in the window — a linear scan per band
        // would be O(days × bars) on 1m history.
        let lo = 0, hi = candles.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (candles[mid].time < start) lo = mid + 1; else hi = mid;
        }
        for (let i = lo; i < candles.length && candles[i].time < end; i++) {
          const c = candles[i];
          high = high == null ? c.high : Math.max(high, c.high);
          low = low == null ? c.low : Math.min(low, c.low);
        }

        bands.push({
          start, end, name: w.name, label: w.label,
          color: SESSION_FILLS[w.name], stroke: SESSION_STROKES[w.name],
          high, low,
        });
      }
    }
    return bands;
  };



  const attachDrawings = () => {
    try { priceSeries.attachPrimitive(drawingsPrimitive as any); } catch { /* unsupported */ }
    try { priceSeries.attachPrimitive(sessionsPrimitive as any); } catch { /* unsupported */ }
  };
  attachDrawings();


  // ── Geometry subscriptions for DOM overlays (position lines, planner) ──
  const geometryListeners = new Set<() => void>();
  let geometryRaf: number | null = null;
  let lastSignature = "";
  const geometryTick = () => {
    geometryRaf = null;
    if (destroyed || !geometryListeners.size) return;
    const range = chart.timeScale().getVisibleLogicalRange();
    const size = containerSize(container);
    let probe: number | null = null;
    try { probe = priceSeries.coordinateToPrice(10) as number | null; } catch { probe = null; }
    const sig = `${range?.from ?? ""}|${range?.to ?? ""}|${size.width}x${size.height}|${probe ?? ""}`;
    if (sig !== lastSignature) {
      lastSignature = sig;
      for (const cb of geometryListeners) cb();
    }
    if (typeof requestAnimationFrame !== "undefined") geometryRaf = requestAnimationFrame(geometryTick);
  };

  if (onCrosshair) {
    chart.subscribeCrosshairMove((param) => {
      const time = param.time ? Number(param.time) * 1000 : null;
      const p = param.seriesData.get(priceSeries) as { close?: number; value?: number } | undefined;
      const price = p ? (p.close ?? p.value ?? null) : null;
      onCrosshair({ price: price ?? null, time });
    });
  }

  let didInitialFit = false;

  return {
    kind: "lightweight-charts",
    setCandles(candles) {
      resizeToContainer();

      // Preserve the visible *time* window across data swaps. Logical indices
      // mean different things on different timeframes, so keeping the raw
      // logical range would scroll the user (and every time-anchored drawing)
      // off screen when the timeframe changes — the drawing is still stored,
      // it just ends up outside the viewport. Translate range → time with the
      // OLD bars, then time → range with the NEW bars.
      const ts = chart.timeScale();
      const prevStep = barStep;
      let keepFrom: number | null = null;
      let keepTo: number | null = null;
      if (barTimes.length) {
        const range = ts.getVisibleLogicalRange();
        if (range) {
          keepFrom = logicalToTime(Number(range.from));
          keepTo = logicalToTime(Number(range.to));
        }
      }

      recomputeBars(candles);
      applyCandles(priceSeries, currentType, candles);

      // Only fit on the very first data push. Later updates must preserve
      // the user's zoom/pan — otherwise every tick or indicator toggle
      // snaps the range back to fit-all.
      if (!didInitialFit && candles.length) {
        chart.timeScale().fitContent();
        didInitialFit = true;
      } else if (candles.length && keepFrom != null && keepTo != null && barStep !== prevStep) {
        // Timeframe changed (bar spacing differs) → restore the same time
        // window so drawings anchored to those timestamps stay in view.
        const first = barTimes[0];
        const last = barTimes[barTimes.length - 1];
        const margin = barStep * 20;
        if (keepTo < first || keepFrom > last) {
          // The previous window doesn't overlap the newly loaded history
          // (e.g. a low timeframe simply can't reach that far back) — show
          // the available data instead of an almost-empty viewport.
          try { ts.fitContent(); } catch { /* ignore */ }
        } else {
          // Clamp to the loaded history (plus a small margin) so a wide window
          // from a higher timeframe can't leave the chart looking empty.
          const clampedFrom = Math.max(keepFrom, first - margin);
          const clampedTo = Math.min(Math.max(keepTo, clampedFrom + barStep * 30), last + margin);
          const from = timeToLogical(clampedFrom);
          const to = timeToLogical(clampedTo);
          if (from != null && to != null && to > from) {
            try { ts.setVisibleLogicalRange({ from: from as Logical, to: to as Logical }); }
            catch { /* range rejected — leave as-is */ }
          }
        }
      }


      // Safety: if the primitive lost its host (series rebuilt), re-attach so
      // saved drawings are repainted against the freshly loaded series.
      if (!requestPrimitiveUpdate) attachDrawings();
      requestPrimitiveUpdate?.();

    },


    updateLastCandle(candle) {
      try { updateLast(priceSeries, currentType, [candle]); } catch { /* series torn down */ }
      if (barTimes.length && candle.time > barTimes[barTimes.length - 1]) barTimes.push(candle.time);
    },
    applySettings(next) {
      displayTz = resolveTimezone(next.timezone);
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
        localization: { timeFormatter: makeTimeFormatter(displayTz) },
        timeScale: { tickMarkFormatter: makeTickFormatter(displayTz) },
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
      attachDrawings();
    },

    syncOverlayIndicators(indicators, candles) {
      if (!candles.length) return;
      const closes = candles.map((c) => c.close);
      const active = new Set<string>();
      const activeSessions = new Set<string>();
      const activeSmcBoxes = new Set<string>();
      let smcHandled = false;
      let sessionsHandled = false;
      indicators
        .filter((i) => i.pane !== "sub" && i.visible !== false)
        .forEach((cfg, idx) => {
          const color = cfg.color ?? INDICATOR_COLORS[idx % INDICATOR_COLORS.length];

          // Sessions render as full-height background bands (Asia / London / NY, UTC).
          if (cfg.key === "sessions") {
            sessionsHandled = true;
            sessionBands = computeSessionBands(candles, cfg.params ?? {});
            sessionsUpdate?.();
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
      if (!sessionsHandled && sessionBands.length) { sessionBands = []; sessionsUpdate?.(); }

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
      // Idempotent in both directions: repeated calls with the same value must
      // never stack a second histogram or throw on an already-removed series.
      if (!visible) {
        if (volSeries) {
          try { chart.removeSeries(volSeries); } catch { /* already detached */ }
          volSeries = null;
          // The dedicated scale keeps reserving margin after the series is
          // gone, which left a blank band where volume used to be.
          try { chart.priceScale("vol").applyOptions({ visible: false, scaleMargins: { top: 0, bottom: 0 } }); } catch { /* no scale */ }
        }
        return;
      }
      if (!volSeries) {
        volSeries = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "vol" });
      }
      try { chart.priceScale("vol").applyOptions({ visible: true, scaleMargins: { top: 0.8, bottom: 0 } }); } catch { /* no scale */ }
      volSeries.setData(candles.map((c) => ({
        time: (c.time / 1000) as UTCTimestamp, value: c.volume,
        color: c.close >= c.open ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)",
      })) as any);
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
    fitContent() { resizeToContainer(); chart.timeScale().fitContent(); },
    getVisibleTimeRange() {
      if (!barTimes.length) return null;
      const range = chart.timeScale().getVisibleLogicalRange();
      if (!range) return null;
      const from = logicalToTime(Number(range.from));
      const to = logicalToTime(Number(range.to));
      if (from == null || to == null || !(to > from)) return null;
      return { from, to };
    },

    resetPriceScale() { chart.priceScale("right").applyOptions({ autoScale: true }); },
    zoomBy(factor: number) {
      try {
        const ts = chart.timeScale();
        const opts: any = (ts as any).options?.() ?? {};
        const current = opts.barSpacing ?? 8;
        const next = Math.max(1, Math.min(60, current * factor));
        ts.applyOptions({ barSpacing: next });
      } catch { /* ignore */ }
    },
    panBy(bars: number) {
      try {
        const ts = chart.timeScale();
        const pos = ts.scrollPosition();
        ts.scrollToPosition(pos + bars, false);
      } catch { /* ignore */ }
    },
    resetTimeScale() {
      try { chart.timeScale().resetTimeScale(); chart.timeScale().fitContent(); } catch { /* ignore */ }
    },

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
    setDrawingsSource(source) {
      drawingsSource = source;
      requestPrimitiveUpdate?.();
    },
    requestDrawingsRepaint() {
      requestPrimitiveUpdate?.();
    },
    getCoords() {
      return buildCoords();
    },
    chartElement() {
      try { return chart.chartElement(); } catch { return container; }
    },
    setPriceFormatter(fn) {
      priceFormatter = fn;
      requestPrimitiveUpdate?.();
    },
    subscribeGeometry(cb) {
      geometryListeners.add(cb);
      if (geometryRaf === null && typeof requestAnimationFrame !== "undefined") {
        geometryRaf = requestAnimationFrame(geometryTick);
      }
      return () => { geometryListeners.delete(cb); };
    },
    destroy() {
      destroyed = true;
      if (resizeFrame !== null && typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(resizeFrame);
      if (geometryRaf !== null && typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(geometryRaf);
      geometryListeners.clear();
      drawingsSource = null;
      resizeObserver?.disconnect();
      themeObserver?.disconnect();
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


import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useReplay } from "./context";
import { createLightweightAdapter } from "@/lib/chart/adapters/lightweight";
import type { ChartAdapter, PriceLineHandle } from "@/lib/chart/adapter";
import type { ChartSettings } from "@/lib/chart/types";
import type { Timeframe } from "@/lib/replay/types";
import { DrawingLayer } from "@/features/replay/drawings/DrawingLayer";
import { useOptionalDrawings } from "@/features/replay/drawings/store";

type Props = {
  onCapture?: (dataUrl: string) => void;
  onAdapterReady?: (adapter: ChartAdapter | null) => void;
  /**
   * Draw native entry/SL/TP price lines for open trades. Turned off when the
   * ChartOrderLayer is mounted so the two don't render the same level twice.
   */
  showPositionLines?: boolean;
  /** Overlays rendered inside the chart box (order layer, HUD chips…). */
  children?: ReactNode;
};

/**
 * Replay chart — renders using the shared lightweight-charts adapter so
 * Replay Studio inherits the same theme tokens, zoom/pan, crosshair with
 * OHLC tooltip, and indicator overlay support as Trading Workspace.
 *
 * Unlike ChartEngine (which subscribes live to MarketDataEngine), this
 * component pushes candles sliced by `cursorIdx` so playback reveals bars
 * exactly at the pace the replay context advances.
 *
 * The chart also hosts an in-canvas OHLC readout that updates via a ref-based
 * DOM write on crosshair-move — no React re-renders for pointer motion — and,
 * when wrapped in a DrawingProvider, an overlay DrawingLayer for trend lines,
 * horizontal rays, rectangles, and Fibonacci retracements.
 */
export function ReplayChart({ onCapture, onAdapterReady, showPositionLines = true, children }: Props) {
  const { session, candles, cursorIdx, openTrades, bookmarks, playing, speed } = useReplay();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const ohlcRef = useRef<HTMLDivElement | null>(null);
  const adapterRef = useRef<ChartAdapter | null>(null);
  const priceLinesRef = useRef<PriceLineHandle[]>([]);
  const didFitRef = useRef(false);
  const [adapter, setAdapter] = useState<ChartAdapter | null>(null);
  const drawingCtx = useOptionalDrawings();

  // Latest candles snapshot for the crosshair callback (avoids adapter remount).
  const candlesRef = useRef(candles);
  candlesRef.current = candles;
  const cursorRef = useRef(cursorIdx);
  cursorRef.current = cursorIdx;

  const settings: ChartSettings = useMemo(
    () => ({
      chartType: "candles",
      timeframe: ((session?.timeframe as Timeframe) ?? "5m"),
      symbol: session?.symbol ?? "",
      market: (session?.market as ChartSettings["market"]) ?? undefined,
      priceScale: "auto",
      crosshair: "normal",
      showGrid: true,
      showVolume: false,
      sessionShading: false,
      autoScale: true,
      timezone: "UTC",
    }),
    [session?.symbol, session?.timeframe, session?.market],
  );

  useEffect(() => {
    if (!hostRef.current) return;
    const a = createLightweightAdapter({
      container: hostRef.current,
      settings,
      onCrosshair: ({ time }) => updateOhlcChip(ohlcRef.current, time, candlesRef.current, cursorRef.current),
    });
    adapterRef.current = a;
    setAdapter(a);
    onAdapterReady?.(a);
    didFitRef.current = false;
    return () => {
      priceLinesRef.current.forEach((l) => l.remove());
      priceLinesRef.current = [];
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
    const revealed = candles.slice(0, cursorIdx + 1);
    a.setCandles(revealed);
    if (!didFitRef.current && revealed.length) {
      a.fitContent();
      didFitRef.current = true;
    }
    // Refresh chip with latest candle when no crosshair active.
    updateOhlcChip(ohlcRef.current, null, candles, cursorIdx);
  }, [candles, cursorIdx]);

  useEffect(() => {
    const a = adapterRef.current;
    if (!a) return;
    priceLinesRef.current.forEach((l) => l.remove());
    const next: PriceLineHandle[] = [];
    if (!showPositionLines) { priceLinesRef.current = next; return; }
    const fmt = (n: number) => {
      const abs = Math.abs(n);
      const digits = abs >= 100 ? 2 : abs >= 1 ? 4 : 5;
      return n.toFixed(digits);
    };
    for (const t of openTrades) {
      next.push(a.addPriceLine({
        price: t.entry_price,
        color: t.direction === "long" ? "var(--success)" : "var(--danger)",
        title: `${t.direction === "long" ? "▲" : "▼"} ${t.direction.toUpperCase()} ${t.lot_size} @ ${fmt(t.entry_price)}`,
        lineStyle: 0, lineWidth: 2,
      }));
      if (t.stop_loss != null) {
        next.push(a.addPriceLine({ price: t.stop_loss, color: "var(--danger)", title: `SL @ ${fmt(t.stop_loss)}`, lineStyle: 2, lineWidth: 1 }));
      }
      if (t.take_profit != null) {
        next.push(a.addPriceLine({ price: t.take_profit, color: "var(--success)", title: `TP @ ${fmt(t.take_profit)}`, lineStyle: 2, lineWidth: 1 }));
      }
    }
    priceLinesRef.current = next;
  }, [openTrades, showPositionLines]);

  useEffect(() => {
    const a = adapterRef.current;
    if (!a) return;
    const revealed = candles.slice(0, cursorIdx + 1);
    if (!revealed.length) { a.setExternalMarkers([]); return; }
    const markers = bookmarks.map((b) => {
      const ts = new Date(b.bookmark_ts).getTime();
      let idx = revealed.findIndex((c) => c.time >= ts);
      if (idx < 0) idx = revealed.length - 1;
      return {
        timeMs: revealed[idx].time,
        position: "belowBar" as const,
        shape: "circle" as const,
        color: b.color ?? "var(--primary)",
        text: b.label ?? undefined,
      };
    });
    a.setExternalMarkers(markers);
  }, [bookmarks, candles, cursorIdx]);

  useEffect(() => {
    if (!onCapture) return;
    const handler = async () => {
      const a = adapterRef.current;
      if (!a) return;
      const blob = await a.screenshot();
      if (!blob) return;
      const reader = new FileReader();
      reader.onloadend = () => onCapture(String(reader.result ?? ""));
      reader.readAsDataURL(blob);
    };
    window.addEventListener("replay-capture", handler);
    return () => window.removeEventListener("replay-capture", handler);
  }, [onCapture]);

  const currentTs = candles[cursorIdx]?.time;
  const dateLabel = currentTs
    ? new Date(currentTs).toLocaleString(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })
    : "—";

  return (
    <div ref={wrapperRef} className="relative h-full w-full overflow-hidden rounded-[3px] border border-border bg-card">
      <div ref={hostRef} className="absolute inset-0" />
      {drawingCtx ? <DrawingLayer adapter={adapter} host={wrapperRef.current} /> : null}
      {children}
      {!candles.length ? (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Loading candles…</div>
      ) : null}
      {/* Chart info + OHLC chip (crosshair updates via DOM ref for perf) */}
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-col gap-1">
        <div className="flex items-center gap-2 rounded-[3px] border border-border/60 bg-background/70 px-2 py-1 text-xs backdrop-blur">
          <span className="font-semibold text-foreground">{session?.symbol ?? "—"}</span>
          <span className="text-muted-foreground">·</span>
          <span className="uppercase text-muted-foreground">{session?.timeframe ?? ""}</span>
          <span className="text-muted-foreground">·</span>
          <span className="tabular-nums font-medium text-primary">{candles[cursorIdx]?.close?.toFixed(4) ?? "—"}</span>
          <span className="text-muted-foreground">·</span>
          <span className="tabular-nums text-muted-foreground">{dateLabel} UTC</span>
        </div>
        <div
          ref={ohlcRef}
          className="hidden items-center gap-2 rounded-[3px] border border-border/60 bg-background/70 px-2 py-1 text-[10px] tabular-nums backdrop-blur"
          aria-live="off"
        />
      </div>
      <div className="pointer-events-none absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-[3px] border border-primary/40 bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-primary backdrop-blur">
        <span className={`h-1.5 w-1.5 rounded-full ${playing ? "bg-success animate-pulse" : "bg-warning"}`} />
        Replay · {speed}x
      </div>
    </div>
  );
}

// ── OHLC crosshair chip — direct DOM write to avoid per-pixel React churn.
function updateOhlcChip(
  el: HTMLDivElement | null,
  crosshairTimeMs: number | null,
  candles: { time: number; open: number; high: number; low: number; close: number }[],
  cursorIdx: number,
) {
  if (!el) return;
  const revealed = candles.slice(0, cursorIdx + 1);
  if (!revealed.length) { el.classList.add("hidden"); return; }
  let bar = revealed[revealed.length - 1];
  if (crosshairTimeMs != null) {
    // nearest bar by time
    let lo = 0, hi = revealed.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (revealed[mid].time < crosshairTimeMs) lo = mid + 1;
      else hi = mid;
    }
    bar = revealed[lo] ?? bar;
  }
  const change = bar.close - bar.open;
  const pct = bar.open ? (change / bar.open) * 100 : 0;
  const dir = change >= 0 ? "text-success" : "text-danger";
  const fmt = (n: number) => {
    const abs = Math.abs(n);
    return n.toFixed(abs >= 100 ? 2 : abs >= 1 ? 4 : 5);
  };
  el.className = `flex items-center gap-2 rounded-[3px] border border-border/60 bg-background/70 px-2 py-1 text-[10px] tabular-nums backdrop-blur ${dir}`;
  el.innerHTML =
    `<span class="text-muted-foreground">O</span><span>${fmt(bar.open)}</span>` +
    `<span class="text-muted-foreground">H</span><span>${fmt(bar.high)}</span>` +
    `<span class="text-muted-foreground">L</span><span>${fmt(bar.low)}</span>` +
    `<span class="text-muted-foreground">C</span><span>${fmt(bar.close)}</span>` +
    `<span>${change >= 0 ? "+" : ""}${fmt(change)}</span>` +
    `<span>(${change >= 0 ? "+" : ""}${pct.toFixed(2)}%)</span>`;
}

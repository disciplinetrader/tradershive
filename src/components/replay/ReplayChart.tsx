import { useEffect, useMemo, useRef } from "react";
import { useReplay } from "./context";
import { createLightweightAdapter } from "@/lib/chart/adapters/lightweight";
import type { ChartAdapter, PriceLineHandle } from "@/lib/chart/adapter";
import type { ChartSettings } from "@/lib/chart/types";
import type { Timeframe } from "@/lib/replay/types";

type Props = { onCapture?: (dataUrl: string) => void };

/**
 * Replay chart — renders using the shared lightweight-charts adapter so
 * Replay Studio inherits the same theme tokens, zoom/pan, crosshair with
 * OHLC tooltip, and indicator overlay support as Trading Workspace.
 *
 * Unlike ChartEngine (which subscribes live to MarketDataEngine), this
 * component pushes candles sliced by `cursorIdx` so playback reveals bars
 * exactly at the pace the replay context advances.
 */
export function ReplayChart({ onCapture }: Props) {
  const { session, candles, cursorIdx, openTrades, bookmarks } = useReplay();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const adapterRef = useRef<ChartAdapter | null>(null);
  const priceLinesRef = useRef<PriceLineHandle[]>([]);
  const didFitRef = useRef(false);
  const currentPriceLineRef = useRef<PriceLineHandle | null>(null);

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

  // Mount the adapter once, tear it down on unmount.
  useEffect(() => {
    if (!hostRef.current) return;
    const a = createLightweightAdapter({ container: hostRef.current, settings });
    adapterRef.current = a;
    didFitRef.current = false;
    return () => {
      priceLinesRef.current.forEach((l) => l.remove());
      priceLinesRef.current = [];
      currentPriceLineRef.current = null;
      a.destroy();
      adapterRef.current = null;
    };
    // Rebuild if the session (symbol/tf) changes — otherwise keep the chart alive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  // Keep colors/grid/crosshair in sync with settings updates.
  useEffect(() => { adapterRef.current?.applySettings(settings); }, [settings]);

  // Push the "revealed so far" candle window on every cursor tick.
  useEffect(() => {
    const a = adapterRef.current;
    if (!a || !candles.length) return;
    const revealed = candles.slice(0, cursorIdx + 1);
    a.setCandles(revealed);
    if (!didFitRef.current && revealed.length) {
      a.fitContent();
      didFitRef.current = true;
    }
  }, [candles, cursorIdx]);

  // Open-trade price lines (entry / SL / TP). Rebuild whenever the set changes.
  useEffect(() => {
    const a = adapterRef.current;
    if (!a) return;
    priceLinesRef.current.forEach((l) => l.remove());
    const next: PriceLineHandle[] = [];
    for (const t of openTrades) {
      next.push(
        a.addPriceLine({
          price: t.entry_price,
          color: "var(--info)",
          title: `${t.direction.toUpperCase()} ${t.lot_size}`,
          lineStyle: 2,
          lineWidth: 1,
        }),
      );
      if (t.stop_loss != null) {
        next.push(
          a.addPriceLine({ price: t.stop_loss, color: "var(--danger)", title: "SL", lineStyle: 2, lineWidth: 1 }),
        );
      }
      if (t.take_profit != null) {
        next.push(
          a.addPriceLine({ price: t.take_profit, color: "var(--success)", title: "TP", lineStyle: 2, lineWidth: 1 }),
        );
      }
    }
    priceLinesRef.current = next;
  }, [openTrades]);

  // Bookmarks → native series markers, positioned on the closest revealed candle.
  useEffect(() => {
    const a = adapterRef.current;
    if (!a) return;
    const revealed = candles.slice(0, cursorIdx + 1);
    if (!revealed.length) { a.setExternalMarkers([]); return; }
    const markers = bookmarks
      .map((b) => {
        const ts = new Date(b.bookmark_ts).getTime();
        // Snap to the nearest revealed candle so the marker stays visible.
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

  // Screenshot bridge — reuse adapter.screenshot() (Blob) → data URL.
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

  return (
    <div className="relative h-full w-full overflow-hidden rounded-[3px] border border-border bg-card">
      <div ref={hostRef} className="absolute inset-0" />
      {!candles.length ? (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          Loading candles…
        </div>
      ) : null}
      <div className="pointer-events-none absolute left-3 top-3 rounded-[3px] border border-border/60 bg-background/70 px-2 py-1 text-xs font-medium text-foreground backdrop-blur">
        {session?.symbol ?? "—"} · {session?.timeframe ?? ""} · {candles[cursorIdx]?.close?.toFixed(4) ?? "—"}
      </div>
    </div>
  );
}

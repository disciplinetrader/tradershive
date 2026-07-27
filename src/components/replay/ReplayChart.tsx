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
  const { session, candles, cursorIdx, openTrades, bookmarks, playing, speed } = useReplay();
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

  // Mount the adapter once; keep it alive for the lifetime of the component
  // and just push new candles / settings when the session changes. Re-creating
  // on session id lost the reference before the candle-push effect could re-run.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


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
  // The entry line is drawn solid + thick and includes the numeric entry price
  // in its title so it cannot be visually confused with the SL/TP lines that
  // sit above/below it (a common source of "wrong entry price" reports).
  useEffect(() => {
    const a = adapterRef.current;
    if (!a) return;
    priceLinesRef.current.forEach((l) => l.remove());
    const next: PriceLineHandle[] = [];
    const fmt = (n: number) => {
      const abs = Math.abs(n);
      const digits = abs >= 100 ? 2 : abs >= 1 ? 4 : 5;
      return n.toFixed(digits);
    };
    for (const t of openTrades) {
      next.push(
        a.addPriceLine({
          price: t.entry_price,
          color: t.direction === "long" ? "var(--success)" : "var(--danger)",
          title: `${t.direction === "long" ? "▲" : "▼"} ${t.direction.toUpperCase()} ${t.lot_size} @ ${fmt(t.entry_price)}`,
          lineStyle: 0, // solid — distinct from dashed SL/TP
          lineWidth: 2,
        }),
      );
      if (t.stop_loss != null) {
        next.push(
          a.addPriceLine({
            price: t.stop_loss,
            color: "var(--danger)",
            title: `SL @ ${fmt(t.stop_loss)}`,
            lineStyle: 2,
            lineWidth: 1,
          }),
        );
      }
      if (t.take_profit != null) {
        next.push(
          a.addPriceLine({
            price: t.take_profit,
            color: "var(--success)",
            title: `TP @ ${fmt(t.take_profit)}`,
            lineStyle: 2,
            lineWidth: 1,
          }),
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

  const currentTs = candles[cursorIdx]?.time;
  const dateLabel = currentTs
    ? new Date(currentTs).toLocaleString(undefined, {
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
      })
    : "—";

  return (
    <div className="relative h-full w-full overflow-hidden rounded-[3px] border border-border bg-card">
      <div ref={hostRef} className="absolute inset-0" />
      {!candles.length ? (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          Loading candles…
        </div>
      ) : null}
      {/* Chart info chip — symbol / timeframe / price / date */}
      <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-[3px] border border-border/60 bg-background/70 px-2 py-1 text-xs backdrop-blur">
        <span className="font-semibold text-foreground">{session?.symbol ?? "—"}</span>
        <span className="text-muted-foreground">·</span>
        <span className="uppercase text-muted-foreground">{session?.timeframe ?? ""}</span>
        <span className="text-muted-foreground">·</span>
        <span className="tabular-nums font-medium text-primary">
          {candles[cursorIdx]?.close?.toFixed(4) ?? "—"}
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="tabular-nums text-muted-foreground">{dateLabel} UTC</span>
      </div>
      {/* Replay mode badge — pulses while playing so the state is unmistakable */}
      <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-1.5 rounded-[3px] border border-primary/40 bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-primary backdrop-blur">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            playing ? "bg-success animate-pulse" : "bg-warning"
          }`}
        />
        Replay · {speed}x
      </div>
    </div>
  );
}


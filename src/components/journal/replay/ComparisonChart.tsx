/**
 * JOURNAL X — PHASE 4 · comparison chart.
 *
 * One chart instance, three views (Original / Replay / Overlay). Rendering two
 * heavy ChartEngine instances side by side doubles the market-data work and
 * the canvas cost for no analytical gain, so the sides share a single engine
 * and swap their annotation sets. Ultrawide screens get the overlay view,
 * which draws both level sets at once with distinct colours.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChartEngine } from "@/components/chart/ChartEngine";
import { DEFAULT_CHART_SETTINGS } from "@/lib/chart/constants";
import type { ChartAdapter, PriceLineHandle } from "@/lib/chart/adapter";
import type { ChartSettings } from "@/lib/chart/types";
import type { Candle, MarketKind, Timeframe } from "@/lib/market-data/types";
import type { Side } from "@/lib/journal/replay-compare";
import { cn } from "@/lib/utils";

const TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "1H", "4H", "1D"];

export type ChartView = "original" | "replay" | "overlay";

const COLORS = {
  original: { entry: "#60a5fa", exit: "#a78bfa", stop: "#f87171", target: "#4ade80" },
  replay: { entry: "#38bdf8", exit: "#c084fc", stop: "#fb7185", target: "#34d399" },
};

export function ComparisonChart({
  symbol,
  market,
  original,
  replay,
  defaultTimeframe = "5m",
  onCandles,
}: {
  symbol: string;
  market: string | null;
  original: Side;
  replay: Side;
  defaultTimeframe?: Timeframe;
  onCandles?: (c: Candle[]) => void;
}) {
  const [timeframe, setTimeframe] = useState<Timeframe>(defaultTimeframe);
  const [view, setView] = useState<ChartView>(() =>
    typeof window !== "undefined" && window.innerWidth >= 1600 ? "overlay" : "original",
  );
  const [adapter, setAdapter] = useState<ChartAdapter | null>(null);
  const linesRef = useRef<PriceLineHandle[]>([]);

  const settings: ChartSettings = useMemo(
    () => ({
      ...DEFAULT_CHART_SETTINGS,
      symbol: symbol || DEFAULT_CHART_SETTINGS.symbol,
      market: (market as MarketKind | null) ?? undefined,
      timeframe,
    }),
    [symbol, market, timeframe],
  );

  const sides = useMemo(
    () => (view === "overlay" ? ([original, replay] as const) : view === "replay" ? ([replay] as const) : ([original] as const)),
    [view, original, replay],
  );

  useEffect(() => {
    if (!adapter) return;
    linesRef.current.forEach((l) => l.remove());
    linesRef.current = [];
    for (const s of sides) {
      const c = COLORS[s.kind];
      const add = (price: number | null, color: string, title: string, style = 0) => {
        if (price == null) return;
        try {
          linesRef.current.push(adapter.addPriceLine({ price, color, title, lineStyle: style, lineWidth: 1, axisLabelVisible: true }));
        } catch {
          /* renderer swapped mid-flight */
        }
      };
      const tag = view === "overlay" ? (s.kind === "original" ? "O " : "R ") : "";
      add(s.entryPrice, c.entry, `${tag}Entry`);
      add(s.exitPrice, c.exit, `${tag}Exit`);
      add(s.stop, c.stop, `${tag}Stop`, 2);
      add(s.target, c.target, `${tag}Target`, 2);
    }
    return () => {
      linesRef.current.forEach((l) => l.remove());
      linesRef.current = [];
    };
  }, [adapter, sides, view]);

  // Execution markers for the visible side(s) — the synced time cursor.
  useEffect(() => {
    if (!adapter) return;
    const markers: Parameters<ChartAdapter["setExternalMarkers"]>[0] = [];
    for (const s of sides) {
      const long = s.direction !== "short";
      const label = view === "overlay" ? (s.kind === "original" ? "O" : "R") : s.kind === "original" ? "Original" : "Replay";
      if (s.openedAt) {
        markers.push({
          timeMs: Date.parse(s.openedAt),
          position: long ? "belowBar" : "aboveBar",
          shape: long ? "arrowUp" : "arrowDown",
          color: s.kind === "original" ? "#22c55e" : "#38bdf8",
          text: `${label} entry`,
        });
      }
      if (s.closedAt) {
        markers.push({
          timeMs: Date.parse(s.closedAt),
          position: long ? "aboveBar" : "belowBar",
          shape: long ? "arrowDown" : "arrowUp",
          color: s.kind === "original" ? "#a78bfa" : "#c084fc",
          text: `${label} exit`,
        });
      }
    }
    adapter.setExternalMarkers(markers);
  }, [adapter, sides, view]);

  return (
    <div className="rounded-[4px] border border-border/60 bg-card/30">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border/50 px-2 py-1.5">
        <span className="mr-1 text-[11px] font-semibold tabular-nums">{symbol || "—"}</span>
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            type="button"
            onClick={() => setTimeframe(tf)}
            className={cn(
              "rounded px-1.5 py-0.5 text-[11px] tabular-nums transition",
              tf === timeframe ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
            )}
          >
            {tf}
          </button>
        ))}
        <div className="mx-1 h-4 w-px bg-border/60" />
        {(["original", "replay", "overlay"] as ChartView[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            aria-pressed={view === v}
            className={cn(
              "rounded border px-1.5 py-0.5 text-[10px] capitalize transition",
              view === v ? "border-primary/30 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:text-foreground",
            )}
          >
            {v}
          </button>
        ))}
      </div>
      <div className="relative h-[320px] w-full lg:h-[420px]">
        <ChartEngine settings={settings} indicators={[]} onAdapter={setAdapter} onCandles={(c) => onCandles?.(c)} />
      </div>
    </div>
  );
}

/**
 * Trade Story chart — the evidence panel.
 *
 * Reuses the existing ChartEngine / ChartAdapter stack (no second chart
 * system). It only adds trade-specific annotations: entry, exit, stop,
 * target and the excursion extremes measured from the loaded candles.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { ChartEngine } from "@/components/chart/ChartEngine";
import { DEFAULT_CHART_SETTINGS } from "@/lib/chart/constants";
import type { ChartAdapter, PriceLineHandle } from "@/lib/chart/adapter";
import type { ChartSettings } from "@/lib/chart/types";
import type { Candle, MarketKind, Timeframe } from "@/lib/market-data/types";
import type { JournalEntry } from "@/lib/journal/api";
import { excursions, num } from "@/lib/journal/story";
import { cn } from "@/lib/utils";

const TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "1H", "4H", "1D"];

type Toggles = { executions: boolean; levels: boolean; excursion: boolean; volume: boolean };

export function TradeStoryChart({
  entry,
  onCandles,
  focusTime,
}: {
  entry: JournalEntry;
  onCandles: (c: Candle[]) => void;
  focusTime: number | null;
}) {
  const [timeframe, setTimeframe] = useState<Timeframe>(defaultTimeframe(entry));
  const [full, setFull] = useState(false);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [adapter, setAdapter] = useState<ChartAdapter | null>(null);
  const [toggles, setToggles] = useState<Toggles>({ executions: true, levels: true, excursion: true, volume: false });
  const linesRef = useRef<PriceLineHandle[]>([]);

  const settings: ChartSettings = useMemo(
    () => ({
      ...DEFAULT_CHART_SETTINGS,
      symbol: entry.symbol ?? DEFAULT_CHART_SETTINGS.symbol,
      market: (entry.market as MarketKind | null) ?? undefined,
      timeframe,
      showVolume: toggles.volume,
    }),
    [entry.symbol, entry.market, timeframe, toggles.volume],
  );

  const handleCandles = useCallback(
    (rows: Candle[]) => {
      setCandles(rows);
      onCandles(rows);
    },
    [onCandles],
  );

  const ex = useMemo(() => excursions(entry, candles), [entry, candles]);

  // Price levels (entry / exit / stop / target / excursion extremes).
  useEffect(() => {
    if (!adapter) return;
    linesRef.current.forEach((l) => l.remove());
    linesRef.current = [];
    const add = (price: number | null, color: string, title: string, style = 0) => {
      if (price == null) return;
      try {
        linesRef.current.push(adapter.addPriceLine({ price, color, title, lineStyle: style, lineWidth: 1, axisLabelVisible: true }));
      } catch { /* renderer swapped mid-flight */ }
    };
    if (toggles.levels) {
      add(num(entry.entry_price), "#60a5fa", "Entry");
      add(num(entry.exit_price), "#a78bfa", "Exit");
      add(num(entry.stop_loss), "#f87171", "Stop", 2);
      add(num(entry.take_profit), "#4ade80", "Target", 2);
    }
    if (toggles.excursion) {
      add(ex.best, "#22c55e", "MFE", 4);
      add(ex.worst, "#ef4444", "MAE", 4);
    }
    return () => {
      linesRef.current.forEach((l) => l.remove());
      linesRef.current = [];
    };
  }, [adapter, entry, toggles.levels, toggles.excursion, ex.best, ex.worst]);

  // Execution markers.
  useEffect(() => {
    if (!adapter) return;
    if (!toggles.executions) {
      adapter.setExternalMarkers([]);
      return;
    }
    const long = entry.direction !== "short";
    const markers = [] as Parameters<ChartAdapter["setExternalMarkers"]>[0];
    if (entry.opened_at) {
      markers.push({
        timeMs: Date.parse(entry.opened_at),
        position: long ? "belowBar" : "aboveBar",
        shape: long ? "arrowUp" : "arrowDown",
        color: long ? "#22c55e" : "#ef4444",
        text: "Entry",
      });
    }
    if (entry.closed_at) {
      markers.push({
        timeMs: Date.parse(entry.closed_at),
        position: long ? "aboveBar" : "belowBar",
        shape: long ? "arrowDown" : "arrowUp",
        color: "#a78bfa",
        text: "Exit",
      });
    }
    adapter.setExternalMarkers(markers);
  }, [adapter, entry, toggles.executions]);

  const focusLabel = focusTime ? new Date(focusTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <div
      className={cn(
        "rounded-lg border border-border/60 bg-card/30",
        full && "fixed inset-3 z-50 bg-background shadow-2xl",
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border/50 px-2 py-1.5">
        <span className="mr-1 text-[11px] font-semibold tabular-nums text-foreground">{entry.symbol ?? "—"}</span>
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
        <Toggle label="Executions" on={toggles.executions} onClick={() => setToggles((t) => ({ ...t, executions: !t.executions }))} />
        <Toggle label="Levels" on={toggles.levels} onClick={() => setToggles((t) => ({ ...t, levels: !t.levels }))} />
        <Toggle label="MFE/MAE" on={toggles.excursion} onClick={() => setToggles((t) => ({ ...t, excursion: !t.excursion }))} />
        <Toggle label="Volume" on={toggles.volume} onClick={() => setToggles((t) => ({ ...t, volume: !t.volume }))} />
        <div className="flex-1" />
        {focusLabel ? (
          <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">Focused {focusLabel}</span>
        ) : null}
        <button
          type="button"
          onClick={() => setFull((v) => !v)}
          aria-label={full ? "Exit full screen" : "Full screen chart"}
          className="rounded p-1 text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
        >
          {full ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>
      </div>

      <div className={cn("relative w-full", full ? "h-[calc(100%-2.25rem)]" : "h-[420px] xl:h-[520px]")}>
        <ChartEngine settings={settings} indicators={[]} onAdapter={setAdapter} onCandles={handleCandles} />
      </div>
    </div>
  );
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "rounded border px-1.5 py-0.5 text-[10px] transition",
        on ? "border-primary/30 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function defaultTimeframe(entry: JournalEntry): Timeframe {
  const secs = entry.duration_seconds ?? 0;
  if (!secs) return "1H";
  if (secs < 3600) return "1m";
  if (secs < 6 * 3600) return "5m";
  if (secs < 48 * 3600) return "1H";
  return "1D";
}

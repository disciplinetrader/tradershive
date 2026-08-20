/**
 * Phase 2 · item 1A — multi-pane replay.
 *
 * One symbol, one dataset, one checksum, one cursor — and N views of it. Every
 * pane is a FOLD of the bars the clock has already consumed
 * (`aggregateCandles`), never a second fetch, so no pane can show a bar the
 * session has not reached and the panes cannot disagree about what happened.
 *
 * That is the whole reason this is cheap: it changes nothing below the chart.
 * Multi-SYMBOL replay is a different feature entirely and is parked (MSYM-1) —
 * the execution engine takes one price stream with no symbol on it, so a second
 * instrument's ticks would fill the first instrument's orders.
 *
 * Two things are deliberately NOT per-pane:
 *
 *   · the drawing store, because it persists per scope and two stores on one
 *     session would race to overwrite each other's annotations;
 *   · the focused-chart controls — indicators, drawing rail, risk and the
 *     Buy/Sell buttons — because there is one account and one position behind
 *     all four panes. Four Buy buttons are four ways to ask one question.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Columns2, Grid2x2, Square } from "lucide-react";
import { DrawingStore } from "@/lib/chart/drawings/store";
import { defaultPaneLadder, PANE_COUNTS, type PaneCount } from "@/lib/replay/aggregate";
import type { Timeframe } from "@/lib/market-data/types";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { StudioChart } from "./StudioChart";
import { useReplayStudio } from "./context";
import { symbolsByMarket, findSymbol, type PaperMarket } from "@/lib/paper-trading/symbols";

const LAYOUT_ICON = { 1: Square, 2: Columns2, 4: Grid2x2 } as const;
const LAYOUT_LABEL = { 1: "Single chart", 2: "Two charts", 4: "Four charts" } as const;

const storageKey = (sessionId: string) => `thive.replay.panes.${sessionId}`;

function readCount(sessionId: string): PaneCount | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = Number(window.localStorage.getItem(storageKey(sessionId)));
    return (PANE_COUNTS as readonly number[]).includes(raw) ? (raw as PaneCount) : null;
  } catch {
    return null;
  }
}

const symbolKey = (sessionId: string) => `thive.replay.panes.symbols.${sessionId}`;

function readSymbols(sessionId: string): (string | null)[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(symbolKey(sessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    // Pane 0 is always the session's own instrument, whatever was stored.
    const next = Array.from({ length: 4 }, (_, i) =>
      typeof parsed[i] === "string" ? (parsed[i] as string) : null,
    );
    next[0] = null;
    return next;
  } catch {
    return null;
  }
}

export function StudioPanes() {
  const { view, sessionId, symbol: sessionSymbol, market: sessionMarket } = useReplayStudio();
  const baseTf = (view?.dataset.timeframe ?? "5m") as Timeframe;

  const [count, setCount] = useState<PaneCount>(1);
  // Read after mount, not during render: the server has no localStorage, and a
  // layout that differs between the SSR pass and the client is a hydration
  // mismatch rather than a restored preference.
  useEffect(() => {
    const stored = readCount(sessionId);
    if (stored) setCount(stored);
  }, [sessionId]);

  const applyCount = useCallback(
    (next: PaneCount) => {
      setCount(next);
      try {
        window.localStorage.setItem(storageKey(sessionId), String(next));
      } catch {
        /* quota — the layout simply does not persist */
      }
    },
    [sessionId],
  );

  /**
   * Per-pane folds. Seeded from the ladder and then owned by the trader: once
   * a pane's timeframe has been changed by hand, changing the pane COUNT must
   * not silently reset it.
   */
  const [timeframes, setTimeframes] = useState<Timeframe[]>(() => defaultPaneLadder(baseTf, 4));
  useEffect(() => { setTimeframes(defaultPaneLadder(baseTf, 4)); }, [baseTf]);

  // One store for every pane. See the header note — this is a correctness
  // requirement, not a memory optimisation.
  const storeRef = useRef<DrawingStore | null>(null);
  if (!storeRef.current) storeRef.current = new DrawingStore();

  /**
   * MSYM-1 · per-pane instrument. `null` means the session's own symbol.
   *
   * Pane 0 is never reassignable: it is the focused chart that owns trading,
   * and the execution engine fills on price with no symbol on the tick, so the
   * pane that can place orders must be the pane showing the instrument those
   * orders execute against.
   */
  const [symbols, setSymbols] = useState<(string | null)[]>(() => [null, null, null, null]);
  useEffect(() => {
    const stored = readSymbols(sessionId);
    if (stored) setSymbols(stored);
  }, [sessionId]);

  const assignSymbol = useCallback(
    (index: number, symbol: string | null) => {
      if (index === 0) return;
      setSymbols((prev) => {
        const next = [...prev];
        next[index] = symbol;
        try {
          window.localStorage.setItem(symbolKey(sessionId), JSON.stringify(next));
        } catch {
          /* quota — the assignment simply does not persist */
        }
        return next;
      });
    },
    [sessionId],
  );

  /** Instruments offerable to a secondary pane, minus the session's own. */
  const options = useMemo(() => {
    const market = (sessionMarket ?? findSymbol(sessionSymbol ?? "")?.market ?? "forex") as PaperMarket;
    const own = (sessionSymbol ?? "").toUpperCase();
    return symbolsByMarket(market).filter((m) => m.symbol.toUpperCase() !== own);
  }, [sessionMarket, sessionSymbol]);

  const panes = useMemo(
    () => Array.from({ length: count }, (_, i) => ({
      key: i, tf: timeframes[i] ?? baseTf, symbol: i === 0 ? null : (symbols[i] ?? null),
    })),
    [count, timeframes, baseTf, symbols],
  );

  return (
    <div className="absolute inset-0 flex flex-col">
      <div
        className="flex h-8 shrink-0 items-center gap-1 border-b border-border/60 bg-card/40 px-2"
        data-testid="pane-layout-bar"
      >
        <span className="pr-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Layout
        </span>
        {PANE_COUNTS.map((n) => {
          const Icon = LAYOUT_ICON[n];
          return (
            <Tooltip key={n}>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant={count === n ? "secondary" : "ghost"}
                  className="h-6 w-7 shrink-0 px-0"
                  aria-pressed={count === n}
                  data-testid={`pane-layout-${n}`}
                  onClick={() => applyCount(n)}
                >
                  <Icon className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{LAYOUT_LABEL[n]}</TooltipContent>
            </Tooltip>
          );
        })}
        {count > 1 ? (
          <span className="pl-2 text-[10px] text-muted-foreground">
            {panes.some((p) => p.symbol)
              /* The old copy claimed one tape, which stops being true the
                 moment a pane shows another instrument. The guarantee that
                 survives is the clock one, so say only that. */
              ? `One clock — no pane can run ahead of it. Only ${sessionSymbol ?? "the session symbol"} can be traded.`
              : `Folded from the same ${baseTf} tape — no pane can run ahead of the clock.`}
          </span>
        ) : null}
      </div>

      <div
        className={cn(
          "grid min-h-0 flex-1 gap-px bg-border/60",
          count === 1 && "grid-cols-1",
          count === 2 && "grid-cols-1 lg:grid-cols-2",
          count === 4 && "grid-cols-1 grid-rows-4 lg:grid-cols-2 lg:grid-rows-2",
        )}
        data-testid="studio-panes"
        data-pane-count={count}
      >
        {panes.map((pane, i) => (
          <div key={pane.key} className="relative min-h-0 min-w-0 bg-background">
            <StudioChart
              drawingStore={storeRef.current!}
              initialTimeframe={pane.tf}
              // Pane 1 is the focused chart: it keeps the drawing rail, the
              // indicator menu and the trading controls. The rest are views.
              compact={i > 0}
              secondarySymbol={pane.symbol}
            />
            {i > 0 ? (
              <select
                className="absolute right-2 top-1.5 z-30 h-6 rounded border border-border/60 bg-background/95 px-1 text-[10px] text-foreground shadow-sm"
                value={pane.symbol ?? ""}
                aria-label={`Instrument for pane ${i + 1}`}
                data-testid={`pane-symbol-${i}`}
                onChange={(e) => assignSymbol(i, e.target.value || null)}
              >
                <option value="">{sessionSymbol ?? "Session symbol"} (fold)</option>
                {options.map((m) => (
                  <option key={m.symbol} value={m.symbol}>{m.symbol}</option>
                ))}
              </select>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

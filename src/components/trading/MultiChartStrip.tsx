import { useState } from "react";
import { ChevronDown, X, Plus } from "lucide-react";
import { useActiveArena } from "@/components/battle-arena/useActiveArena";
import { ChartEngine } from "@/components/chart/ChartEngine";
import { DEFAULT_CHART_SETTINGS } from "@/lib/chart/constants";
import type { ChartSettings, ChartType } from "@/lib/chart/types";
import type { Timeframe } from "@/lib/market-data/types";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { findSymbol } from "@/lib/paper-trading/symbols";
import { cn } from "@/lib/utils";

export interface MultiChartPane {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  chartType: ChartType;
}

const TF_OPTIONS: Timeframe[] = ["1m", "5m", "15m", "30m", "1H", "4H", "1D"];
const TYPE_OPTIONS: { key: ChartType; label: string }[] = [
  { key: "candles", label: "Candles" },
  { key: "line", label: "Line" },
  { key: "area", label: "Area" },
  { key: "heikin_ashi", label: "Heikin Ashi" },
];

/**
 * Read-only companion strip that renders 1–4 side-by-side mini-charts for
 * multi-timeframe / multi-symbol analysis. Each pane owns its own symbol,
 * timeframe and chart type; the primary trading chart above stays the one
 * wired into Paper Trading (SL/TP handles, planner, order lines).
 *
 * Deliberately independent from the ChartAdapter's sub-pane oscillators —
 * this is about seeing more markets, not stacking more studies.
 */
export function MultiChartStrip({
  panes,
  onChange,
  primarySymbol,
  arenaMode = false,
}: {
  panes: MultiChartPane[];
  onChange: (next: MultiChartPane[]) => void;
  primarySymbol: string;
  arenaMode?: boolean;
}) {
  const { data: arenaData } = useActiveArena(null); // Passing null as we don't have accountId here, but hook requires it
  const activeArena = arenaMode || !!arenaData;
  if (activeArena) return null;
  const addPane = () => {
    if (panes.length >= 4) return;
    onChange([
      ...panes,
      {
        id: `p-${Date.now()}`,
        symbol: primarySymbol,
        timeframe: panes.length === 0 ? "15m" : panes.length === 1 ? "1H" : "4H",
        chartType: "candles",
      },
    ]);
  };

  if (panes.length === 0) {
    return (
      <GlassCard className="flex items-center justify-between gap-3 p-3">
        <div className="text-xs text-muted-foreground">
          Multi-timeframe analysis — add up to 4 companion charts to watch other timeframes or symbols side-by-side.
        </div>
        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-[11px]" onClick={addPane}>
          <Plus className="h-3.5 w-3.5" /> Add companion chart
        </Button>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Multi-Timeframe Panels ({panes.length}/4)
        </div>
        <Button
          size="sm" variant="ghost" className="h-6 gap-1 px-2 text-[11px]"
          onClick={addPane} disabled={panes.length >= 4}
        >
          <Plus className="h-3 w-3" /> Add
        </Button>
      </div>
      <div
        className={cn(
          "grid gap-2",
          panes.length === 1 && "grid-cols-1",
          panes.length === 2 && "grid-cols-2",
          panes.length === 3 && "grid-cols-3",
          panes.length === 4 && "grid-cols-2 xl:grid-cols-4",
        )}
      >
        {panes.map((p) => (
          <MiniPane
            key={p.id}
            pane={p}
            onChange={(next) => onChange(panes.map((x) => (x.id === p.id ? next : x)))}
            onRemove={() => onChange(panes.filter((x) => x.id !== p.id))}
          />
        ))}
      </div>
    </GlassCard>
  );
}

function MiniPane({
  pane,
  onChange,
  onRemove,
}: {
  pane: MultiChartPane;
  onChange: (next: MultiChartPane) => void;
  onRemove: () => void;
}) {
  const [symbolInput, setSymbolInput] = useState(pane.symbol);
  const meta = findSymbol(pane.symbol);

  const settings: ChartSettings = {
    ...DEFAULT_CHART_SETTINGS,
    symbol: pane.symbol,
    market: meta?.market,
    timeframe: pane.timeframe,
    chartType: pane.chartType,
    showVolume: false,
    showGrid: false,
  };

  return (
    <div className="flex h-[240px] flex-col overflow-hidden rounded-md border border-border/50 bg-background/40">
      <div className="flex items-center gap-1 border-b border-border/50 px-2 py-1 text-[10px]">
        <input
          value={symbolInput}
          onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
          onBlur={() => { if (symbolInput && symbolInput !== pane.symbol) onChange({ ...pane, symbol: symbolInput }); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          className="w-20 bg-transparent font-mono text-[11px] font-bold outline-none focus:text-primary"
        />
        {meta && <span className="truncate text-[10px] text-muted-foreground">{meta.name}</span>}
        <div className="ml-auto flex items-center gap-0.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold hover:bg-muted">
                {pane.timeframe}<ChevronDown className="h-2.5 w-2.5 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-24">
              {TF_OPTIONS.map((tf) => (
                <DropdownMenuItem key={tf} onSelect={() => onChange({ ...pane, timeframe: tf })} className="text-xs">
                  {tf}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] hover:bg-muted">
                {pane.chartType === "candles" ? "▮" : pane.chartType === "line" ? "∿" : pane.chartType === "area" ? "◢" : "H"}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-32">
              {TYPE_OPTIONS.map((t) => (
                <DropdownMenuItem key={t.key} onSelect={() => onChange({ ...pane, chartType: t.key })} className="text-xs">
                  {t.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            onClick={onRemove}
            className="grid h-5 w-5 place-items-center rounded text-muted-foreground hover:bg-danger/10 hover:text-danger"
            aria-label="Remove chart"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        <ChartEngine settings={settings} indicators={[]} className="absolute inset-0" />
      </div>
    </div>
  );
}

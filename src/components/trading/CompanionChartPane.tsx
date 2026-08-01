import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Link2, Link2Off, Maximize2, LineChart as LineChartIcon } from "lucide-react";
import { ChartEngine } from "@/components/chart/ChartEngine";
import { DEFAULT_CHART_SETTINGS } from "@/lib/chart/constants";
import type { ChartSettings, ChartType, IndicatorConfig } from "@/lib/chart/types";
import type { Timeframe } from "@/lib/market-data/types";
import { INDICATOR_TOGGLES } from "@/lib/chart/indicator-registry";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { findSymbol } from "@/lib/paper-trading/symbols";
import { useLiveQuote } from "@/lib/market-data/hooks";
import { cn } from "@/lib/utils";
import type { ChartPane } from "@/lib/chart/multi-chart";


const TF_OPTIONS: Timeframe[] = ["1m", "5m", "15m", "30m", "1H", "4H", "1D", "1W"];
const TYPE_OPTIONS: { key: ChartType; label: string }[] = [
  { key: "candles", label: "Candles" },
  { key: "hollow_candles", label: "Hollow candles" },
  { key: "heikin_ashi", label: "Heikin Ashi" },
  { key: "bars", label: "Bars" },
  { key: "line", label: "Line" },
  { key: "area", label: "Area" },
];

/**
 * A companion chart inside the multi-chart grid. Read-only by design — the
 * primary pane keeps ownership of drawings, orders and the trade planner, so
 * there is exactly one place where a click can put money at risk.
 */
export function CompanionChartPane({
  pane,
  primarySymbol,
  active,
  onFocus,
  onChange,
  onPromote,
}: {
  pane: ChartPane;
  primarySymbol: string;
  active: boolean;
  onFocus: () => void;
  onChange: (patch: Partial<ChartPane>) => void;
  onPromote: () => void;
}) {
  const symbol = pane.syncSymbol ? primarySymbol : pane.symbol;
  const meta = findSymbol(symbol);
  const [draft, setDraft] = useState(symbol);
  useEffect(() => setDraft(symbol), [symbol]);

  const quote = useLiveQuote(symbol, meta?.market);
  const change = quote?.changePct ?? 0;

  const settings: ChartSettings = {
    ...DEFAULT_CHART_SETTINGS,
    symbol,
    market: meta?.market,
    timeframe: pane.timeframe,
    chartType: pane.chartType,
    showVolume: false,
    showGrid: false,
  };

  const commitSymbol = () => {
    const next = draft.trim().toUpperCase();
    if (!next || next === symbol) {
      setDraft(symbol);
      return;
    }
    onChange({ symbol: next, syncSymbol: false });
  };

  return (
    <section
      onPointerDownCapture={onFocus}
      aria-label={`${symbol} ${pane.timeframe} chart`}
      className={cn(
        "relative flex min-h-0 min-w-0 flex-col overflow-hidden border border-transparent bg-background/30 transition-colors",
        active ? "border-primary/50 ring-1 ring-inset ring-primary/30" : "border-border/40",
      )}
    >
      <header className="flex shrink-0 items-center gap-1 border-b border-border/40 bg-background/50 px-2 py-1">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value.toUpperCase())}
          onBlur={commitSymbol}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setDraft(symbol);
          }}
          aria-label="Pane symbol"
          className="w-[8ch] shrink-0 bg-transparent font-mono text-[11px] font-bold outline-none focus:text-primary"
        />
        {quote?.last != null && (
          <span className="hidden shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground sm:inline">
            {quote.last.toFixed(meta?.decimals ?? 2)}
          </span>
        )}
        <span
          className={cn(
            "hidden shrink-0 font-mono text-[10px] tabular-nums lg:inline",
            change >= 0 ? "text-success" : "text-danger",
          )}
        >
          {quote ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}%` : ""}
        </span>

        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold hover:bg-muted">
                {pane.timeframe}
                <ChevronDown className="h-2.5 w-2.5 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-24">
              {TF_OPTIONS.map((tf) => (
                <DropdownMenuItem key={tf} onSelect={() => onChange({ timeframe: tf })} className="text-xs">
                  {tf}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="rounded px-1.5 py-0.5 text-[10px] hover:bg-muted"
                aria-label="Chart type"
              >
                {pane.chartType === "line" ? "∿" : pane.chartType === "area" ? "◢" : pane.chartType === "heikin_ashi" ? "HA" : "▮"}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              {TYPE_OPTIONS.map((t) => (
                <DropdownMenuItem key={t.key} onSelect={() => onChange({ chartType: t.key })} className="text-xs">
                  {t.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => onChange({ syncSymbol: !pane.syncSymbol, symbol: pane.syncSymbol ? primarySymbol : pane.symbol })}
                aria-pressed={pane.syncSymbol}
                className={cn(
                  "grid h-5 w-5 place-items-center rounded transition",
                  pane.syncSymbol ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {pane.syncSymbol ? <Link2 className="h-3 w-3" /> : <Link2Off className="h-3 w-3" />}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {pane.syncSymbol ? "Following the main chart's symbol" : "Independent symbol"}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onPromote}
                className="grid h-5 w-5 place-items-center rounded text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label="Swap into the main trading chart"
              >
                <Maximize2 className="h-3 w-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Swap into the main trading chart</TooltipContent>
          </Tooltip>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <ChartEngine settings={settings} indicators={[]} className="absolute inset-0" />
      </div>
    </section>
  );
}

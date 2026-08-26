/**
 * Closed Trades — the completed-trade tape for the Trading Workspace.
 *
 * Deliberately separate from the open-positions list: an active position is
 * working state, a closed trade is an immutable historical record. Nothing
 * here shows live P/L — every number is realized.
 */

import { useState } from "react";
import { Archive, BookOpen, ChevronDown, Crosshair, FilePlus2, MoreHorizontal, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCurrency } from "@/lib/paper-trading/calculations";
import { fmtPrice } from "@/lib/trading/plan-math";
import { cn } from "@/lib/utils";
import {
  CLOSE_REASON_LABEL, formatDuration, tradeDuration, tradeResult,
  type ClosedTrade, type TradeFilter,
} from "@/lib/chart/orders/closed-trade";

/**
 * Outcome filters stay inline — they are the ones actually reached for.
 * Everything else moved behind "More", because eight chips wrapped to two rows
 * and pushed the trades themselves below the fold in a panel that is often
 * only a few hundred pixels tall.
 */
const PRIMARY_FILTERS: { id: TradeFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "profit", label: "Profit" },
  { id: "loss", label: "Loss" },
];

const MORE_FILTERS: { id: TradeFilter; label: string }[] = [
  { id: "breakeven", label: "Break-even" },
  { id: "manual", label: "Manual" },
  { id: "stop_loss", label: "Stop loss" },
  { id: "take_profit", label: "Take profit" },
  { id: "archived", label: "Archived" },
];

/** `+1.46R` as one token — see the same note in OpenPositionsPanel. */
/**
 * An absent measurement prints an em-dash, never a zero.
 *
 * "0.00R" and "$0.00" are real readings — a flat trade. A position with no stop
 * has no risk to measure against at all, and the two must not look the same on
 * screen. Same call Stage A' made for the position label.
 */
function signedR(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}R`;
}

interface Props {
  trades: ClosedTrade[];
  filter: TradeFilter;
  onFilterChange: (filter: TradeFilter) => void;
  onViewOnChart?: (trade: ClosedTrade) => void;
  onAddToJournal?: (trade: ClosedTrade) => void;
  onOpenJournal?: (trade: ClosedTrade) => void;
  onArchive?: (trade: ClosedTrade, archived: boolean) => void;
}

export function ClosedTradesPanel({
  trades, filter, onFilterChange,
  onViewOnChart, onAddToJournal, onOpenJournal, onArchive,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      {/* One row, and it stays one row: the chips never wrap and "More" carries
          the long tail, so narrowing the panel does not push the trades down. */}
      <div className="flex items-center gap-1 overflow-hidden">
        {PRIMARY_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onFilterChange(f.id)}
            className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors",
              filter === f.id
                ? "border-primary/60 bg-primary/15 text-primary"
                : "border-border/50 text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "ml-auto flex shrink-0 items-center gap-0.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors",
                MORE_FILTERS.some((f) => f.id === filter)
                  ? "border-primary/60 bg-primary/15 text-primary"
                  : "border-border/50 text-muted-foreground hover:text-foreground",
              )}
            >
              {MORE_FILTERS.find((f) => f.id === filter)?.label ?? "More"}
              <ChevronDown className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            {MORE_FILTERS.map((f) => (
              <DropdownMenuItem key={f.id} className="cursor-pointer text-xs" onSelect={() => onFilterChange(f.id)}>
                {f.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {trades.length === 0 ? (
        <p className="rounded-md border border-border/40 bg-background/30 px-3 py-4 text-center text-[11px] text-muted-foreground">
          No closed trades in this view yet. Close a chart position and it lands here with its realized result.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {trades.map((t) => {
            const outcome = tradeResult(t);
            const tone =
              outcome === "win" ? "text-emerald-400"
                : outcome === "loss" ? "text-red-400"
                  : "text-muted-foreground";
            return (
              <li key={t.id} className="rounded-md border border-border/40 bg-background/40 px-2 py-1.5">
                {/* Identity shrinks, the result never does. `min-w-0` on the left
                    and `shrink-0` on the right is what stops a narrow panel
                    clipping the R off the end of the number. */}
                <div className="flex items-baseline gap-2">
                  <div className="flex min-w-0 items-baseline gap-1.5">
                    <span className="truncate text-xs font-semibold">{t.symbol}</span>
                    <span className={cn(
                      "shrink-0 text-[9px] font-semibold uppercase",
                      t.direction === "buy" ? "text-success" : "text-danger",
                    )}>
                      {t.direction === "buy" ? "Long" : "Short"}
                    </span>
                    {t.archivedAt ? (
                      <Badge variant="outline" className="h-4 shrink-0 px-1 text-[9px]">Archived</Badge>
                    ) : null}
                  </div>
                  <div className={cn("ml-auto shrink-0 whitespace-nowrap text-right text-xs font-semibold tabular-nums", tone)}>
                    {t.netPnl > 0 ? "+" : ""}{formatCurrency(t.netPnl)}
                    <span className="ml-1.5 text-[10px] font-medium opacity-80">{signedR(t.realizedR)}</span>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon" variant="ghost"
                        className="h-5 w-5 shrink-0 text-muted-foreground hover:text-foreground"
                        aria-label={`Actions for ${t.symbol}`}
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem className="cursor-pointer text-xs" onSelect={() => onViewOnChart?.(t)}>
                        <Crosshair className="mr-2 h-3 w-3" /> View on chart
                      </DropdownMenuItem>
                      {t.journalStatus === "linked" ? (
                        <DropdownMenuItem className="cursor-pointer text-xs" onSelect={() => onOpenJournal?.(t)}>
                          <BookOpen className="mr-2 h-3 w-3" /> Open journal
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          className="cursor-pointer text-xs"
                          disabled={busy === t.id}
                          onSelect={async () => { setBusy(t.id); try { await onAddToJournal?.(t); } finally { setBusy(null); } }}
                        >
                          <FilePlus2 className="mr-2 h-3 w-3" /> Add to journal
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem className="cursor-pointer text-xs" onSelect={() => onArchive?.(t, !t.archivedAt)}>
                        {t.archivedAt
                          ? <><RotateCcw className="mr-2 h-3 w-3" /> Restore</>
                          : <><Archive className="mr-2 h-3 w-3" /> Archive</>}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* One line instead of a four-cell grid. Close reason moved here
                    from a badge, and the wall-clock close time was dropped —
                    duration answers "how long" better than a timestamp does. */}
                <div className="mt-0.5 flex items-baseline gap-1.5 overflow-hidden text-[10px] text-muted-foreground">
                  <span className="shrink-0 tabular-nums text-foreground/80">
                    {fmtPrice(t.symbol, t.fillPrice)} → {fmtPrice(t.symbol, t.exitPrice)}
                  </span>
                  <span className="shrink-0 opacity-60">·</span>
                  <span className="shrink-0">{formatDuration(tradeDuration(t))}</span>
                  <span className="truncate opacity-70">· {CLOSE_REASON_LABEL[t.closeReason]}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

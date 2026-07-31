/**
 * Closed Trades — the completed-trade tape for the Trading Workspace.
 *
 * Deliberately separate from the open-positions list: an active position is
 * working state, a closed trade is an immutable historical record. Nothing
 * here shows live P/L — every number is realized.
 */

import { useMemo, useState } from "react";
import { Archive, BookOpen, Crosshair, FilePlus2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  CLOSE_REASON_LABEL, formatDuration, tradeDuration, tradeResult,
  type ClosedTrade, type TradeFilter,
} from "@/lib/chart/orders/closed-trade";

const FILTERS: { id: TradeFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "profit", label: "Profit" },
  { id: "loss", label: "Loss" },
  { id: "breakeven", label: "Break-even" },
  { id: "manual", label: "Manual" },
  { id: "stop_loss", label: "Stop loss" },
  { id: "take_profit", label: "Take profit" },
  { id: "archived", label: "Archived" },
];

interface Props {
  trades: ClosedTrade[];
  filter: TradeFilter;
  onFilterChange: (filter: TradeFilter) => void;
  decimals?: number;
  onViewOnChart?: (trade: ClosedTrade) => void;
  onAddToJournal?: (trade: ClosedTrade) => void;
  onOpenJournal?: (trade: ClosedTrade) => void;
  onArchive?: (trade: ClosedTrade, archived: boolean) => void;
}

export function ClosedTradesPanel({
  trades, filter, onFilterChange, decimals = 2,
  onViewOnChart, onAddToJournal, onOpenJournal, onArchive,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const fmt = useMemo(
    () => (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
    [decimals],
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onFilterChange(f.id)}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors",
              filter === f.id
                ? "border-primary/60 bg-primary/15 text-primary"
                : "border-border/50 text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
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
              <li key={t.id} className="rounded-md border border-border/40 bg-background/40 p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold">{t.symbol}</span>
                    <Badge variant="outline" className="h-4 px-1 text-[9px] uppercase">
                      {t.direction === "buy" ? "Long" : "Short"}
                    </Badge>
                    <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                      {CLOSE_REASON_LABEL[t.closeReason]}
                    </Badge>
                    {t.archivedAt ? (
                      <Badge variant="outline" className="h-4 px-1 text-[9px]">Archived</Badge>
                    ) : null}
                  </div>
                  <div className={cn("text-right text-xs font-semibold tabular-nums", tone)}>
                    {t.netPnl > 0 ? "+" : ""}{fmt(t.netPnl)}
                    <span className="ml-1.5 text-[10px] font-medium opacity-80">
                      {t.realizedR >= 0 ? "+" : ""}{t.realizedR.toFixed(2)}R
                    </span>
                  </div>
                </div>

                <dl className="mt-1 grid grid-cols-4 gap-1 text-[10px] text-muted-foreground">
                  <div><dt className="opacity-70">Entry</dt><dd className="tabular-nums text-foreground">{fmt(t.fillPrice)}</dd></div>
                  <div><dt className="opacity-70">Exit</dt><dd className="tabular-nums text-foreground">{fmt(t.exitPrice)}</dd></div>
                  <div><dt className="opacity-70">Duration</dt><dd className="text-foreground">{formatDuration(tradeDuration(t))}</dd></div>
                  <div><dt className="opacity-70">Closed</dt><dd className="text-foreground">{new Date(t.closedAt).toLocaleTimeString()}</dd></div>
                </dl>

                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  <Button size="sm" variant="ghost" className="h-6 gap-1 px-1.5 text-[10px]" onClick={() => onViewOnChart?.(t)}>
                    <Crosshair className="h-3 w-3" /> View on chart
                  </Button>
                  {t.journalStatus === "linked" ? (
                    <Button size="sm" variant="ghost" className="h-6 gap-1 px-1.5 text-[10px]" onClick={() => onOpenJournal?.(t)}>
                      <BookOpen className="h-3 w-3" /> Open journal
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 gap-1 px-1.5 text-[10px]"
                      disabled={busy === t.id}
                      onClick={async () => { setBusy(t.id); try { await onAddToJournal?.(t); } finally { setBusy(null); } }}
                    >
                      <FilePlus2 className="h-3 w-3" /> Add to journal
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 gap-1 px-1.5 text-[10px]"
                    onClick={() => onArchive?.(t, !t.archivedAt)}
                  >
                    {t.archivedAt ? <><RotateCcw className="h-3 w-3" /> Restore</> : <><Archive className="h-3 w-3" /> Archive</>}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

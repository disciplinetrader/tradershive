/**
 * MAE / MFE and the running P&L curve for one trade.
 *
 * Shows the two things a closed P&L cannot: how close the trade came to being
 * wrong, and how good it looked before you closed it. Both are computed from
 * real stored candles or not at all — when the tape is missing the panel says
 * so plainly rather than drawing a flat line, which would read as "the trade
 * never moved".
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CurveChart } from "@/components/analytics/portfolio/charts";
import type { SeriesPoint } from "@/lib/analytics/selectors";
import { computeEntryExcursion, type ExcursionOutcome } from "@/lib/journal/excursions.functions";
import { journalKeys, type JournalEntry } from "@/lib/journal/api";
import type { ExcursionPoint } from "@/lib/journal/excursions";
import { formatCurrency } from "@/lib/journal/format";
import { cn } from "@/lib/utils";

function readPath(entry: JournalEntry): ExcursionPoint[] {
  const raw = entry.excursion_path;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (p): p is ExcursionPoint =>
      !!p && typeof p === "object" && typeof (p as ExcursionPoint).t === "number",
  );
}

export function ExcursionPanel({ entry }: { entry: JournalEntry }) {
  const qc = useQueryClient();
  const compute = useServerFn(computeEntryExcursion);

  const run = useMutation({
    mutationFn: () => compute({ data: { entryId: entry.id } }) as unknown as Promise<ExcursionOutcome>,
    onSuccess: (r) => {
      if (r.ok) {
        toast.success(`Measured from ${r.points} ${r.timeframe} candles (${r.source})`);
        qc.invalidateQueries({ queryKey: journalKeys.entry(entry.id) });
      } else {
        // A refusal is information, not a failure to hide.
        toast.message("Not measured", { description: r.reason });
      }
    },
    onError: (e: unknown) => toast.error((e as Error).message || "Could not compute"),
  });

  const path = readPath(entry);
  const points: SeriesPoint[] = path.map((p, i) => ({
    x: p.t,
    label: new Date(p.t).toISOString().slice(11, 16),
    value: p.pnl,
  }));
  const measured = entry.excursion_computed_at != null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {measured ? (
            <>
              Measured from real {entry.excursion_timeframe} candles
              {entry.excursion_source ? ` (${entry.excursion_source})` : ""}.
            </>
          ) : (
            <>Not measured yet. Excursions are read from stored candles — never synthetic ones.</>
          )}
        </p>
        <Button variant="outline" size="sm" onClick={() => run.mutate()} disabled={run.isPending}>
          <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", run.isPending && "animate-spin")} />
          {measured ? "Recompute" : "Measure"}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Cell
          label="MAE"
          value={entry.mae_r != null ? `${entry.mae_r.toFixed(2)}R` : "—"}
          sub={entry.mae_price != null ? `at ${entry.mae_price}` : "not measured"}
          tone="down"
        />
        <Cell
          label="MFE"
          value={entry.mfe_r != null ? `${entry.mfe_r.toFixed(2)}R` : "—"}
          sub={entry.mfe_price != null ? `at ${entry.mfe_price}` : "not measured"}
          tone="up"
        />
        <Cell
          label="Closed at"
          value={entry.rr != null ? `${Number(entry.rr).toFixed(2)}R` : "—"}
          sub={entry.pnl != null ? formatCurrency(Number(entry.pnl)) : "—"}
        />
        <Cell
          label="Left on table"
          value={
            entry.mfe_r != null && entry.rr != null
              ? `${Math.max(0, entry.mfe_r - Number(entry.rr)).toFixed(2)}R`
              : "—"
          }
          sub={entry.mfe_r != null && entry.rr != null ? "MFE minus result" : "needs both"}
        />
      </div>

      {measured ? (
        <CurveChart points={points} empty="No running P&L recorded for this trade." />
      ) : (
        <div className="flex min-h-24 items-center justify-center rounded-xl border border-dashed border-border/60 p-4">
          <p className="max-w-[80%] text-center text-xs text-muted-foreground">
            Press <span className="font-medium">Measure</span> to read this trade against the
            historical tape. If only fabricated data exists for the symbol, it will refuse and say
            so — a plausible MAE from invented candles is worse than no MAE.
          </p>
        </div>
      )}
    </div>
  );
}

function Cell({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "up" | "down";
}) {
  return (
    <div className="rounded-lg border border-border/60 p-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-sm font-semibold tabular-nums",
          tone === "up" && "text-success",
          tone === "down" && "text-danger",
        )}
      >
        {value}
      </p>
      <p className="text-[10px] text-muted-foreground">{sub}</p>
    </div>
  );
}

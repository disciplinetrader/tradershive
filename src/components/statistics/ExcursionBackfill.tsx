/**
 * Measure ideal outcomes across a trade history.
 *
 * WHY THIS IS A USER ACTION AND NOT A SCRIPT
 *
 * It reads and writes only the caller's own rows under RLS, and it spends the
 * caller's market-data budget. The person who wants the metric is the one who
 * should decide that cost is worth paying — an admin-only backfill does not
 * scale past us, and a one-off script cannot be re-run by the person whose data
 * it is.
 *
 * WHY IT IS SLOW, DELIBERATELY
 *
 * Each unmeasured trade needs its own historical range, and a cache miss hits
 * the provider against the budget documented in MD-1. Calls are spaced and
 * strictly serial: parallelism is precisely what turns a rate budget into a
 * burst. The estimate is shown up front rather than discovered — a progress bar
 * that silently takes twelve minutes is worse than a slow one that said so.
 *
 * WHY PROGRESS IS NOT A JOB RECORD
 *
 * An entry leaves the queue by acquiring a measurement or a terminal status, so
 * the queue IS the data. Stop it, close the tab, come back tomorrow — it
 * resumes exactly where it stopped, because finished rows no longer match. A
 * job table would be a second source of truth that can disagree with the rows
 * it claims to describe.
 */
import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, AlertCircle, Loader2, Square } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { backfillExcursions, excursionCoverage } from "@/lib/journal/excursions.functions";

/** Matches PROVIDER_GAP_MS in excursions.functions.ts. */
const GAP_MS = 8_000;
const BATCH = 10;

function eta(pending: number): string {
  const secs = Math.round((pending * GAP_MS) / 1000);
  if (secs < 90) return `about ${secs}s`;
  const mins = Math.round(secs / 60);
  return `about ${mins} min`;
}

export function ExcursionBackfill() {
  const qc = useQueryClient();
  const coverageFn = useServerFn(excursionCoverage);
  const backfillFn = useServerFn(backfillExcursions);

  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const stopRef = useRef(false);

  const coverage = useQuery({
    queryKey: ["excursions", "coverage"],
    queryFn: () => coverageFn(),
    staleTime: 30_000,
  });

  const run = useMutation({
    mutationFn: async () => {
      stopRef.current = false;
      setRunning(true);
      setDone(0);
      let guard = 0;
      // Bounded so a server that always reports work left cannot spin forever.
      while (!stopRef.current && guard < 500) {
        guard += 1;
        const res = await backfillFn({ data: { limit: BATCH } });
        setDone((d) => d + res.ok + res.terminal);

        if (res.rateLimited) {
          // Transient by definition: the rows stay eligible and nothing was
          // marked terminal, so resuming later picks them up unchanged.
          toast.warning("Paused — market-data limit reached", {
            description: "Nothing was lost. Press Measure again in a minute to continue.",
          });
          break;
        }
        if (res.remaining === 0 || res.processed === 0) break;
      }
      setRunning(false);
      await qc.invalidateQueries({ queryKey: ["excursions", "coverage"] });
      await qc.invalidateQueries({ queryKey: ["statistics", "dataset"] });
    },
    onError: (e) => {
      setRunning(false);
      toast.error("Could not finish measuring", { description: (e as Error).message });
    },
  });

  const stop = useCallback(() => {
    stopRef.current = true;
    toast.message("Stopping after this batch", {
      description: "Everything measured so far is saved.",
    });
  }, []);

  // A failed coverage query must NOT render nothing. An absent panel is
  // indistinguishable from "there is nothing here to measure", so a broken
  // query presents as a missing feature and the person looking for it has no
  // thread to pull. That is PAT-1 in the UI layer: the failure and the happy
  // empty state produce byte-identical output.
  if (coverage.isError) {
    return (
      <GlassCard className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex min-w-0 items-start gap-2 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <div className="min-w-0">
            <div className="font-semibold">Could not check ideal-outcome coverage</div>
            <p className="mt-0.5 break-words text-xs text-muted-foreground">
              {(coverage.error as Error | null)?.message ?? "The coverage query failed."}
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => void coverage.refetch()}>
          Retry
        </Button>
      </GlassCard>
    );
  }

  const c = coverage.data;
  // Still loading, or genuinely no closed trades to measure. Both are honestly
  // silent — unlike the error above, neither hides a fault.
  if (!c || c.total === 0) return null;

  const pct = c.total ? Math.round((c.measured / c.total) * 100) : 0;

  return (
    <GlassCard className="p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Activity className="h-4 w-4 text-primary" />
            Ideal outcomes
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Measures each closed trade against the real candles it ran through, so
            the analytics can show what was actually available.
          </p>
        </div>

        {c.pending > 0 ? (
          running ? (
            <Button size="sm" variant="outline" onClick={stop}>
              <Square className="mr-1.5 h-3.5 w-3.5" /> Stop
            </Button>
          ) : (
            <Button size="sm" onClick={() => run.mutate()} disabled={run.isPending}>
              {run.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Measure {c.pending} trade{c.pending === 1 ? "" : "s"}
            </Button>
          )
        ) : null}
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span data-testid="excursion-measured">
          <span className="font-semibold text-foreground">{c.measured}</span> of {c.total} measured
        </span>
        {c.terminal > 0 ? (
          /* Terminal rows are NOT pending. Counting them as outstanding work is
             how a backfill runs forever against rows that can never fill. */
          <span title="No stop, or no usable fill data — these can never be measured">
            {c.terminal} not measurable
          </span>
        ) : null}
        {c.pending > 0 ? (
          <span>
            {running
              ? `measuring… ${done} done this run`
              : `${c.pending} to go — ${eta(c.pending)}, limited by the market-data budget`}
          </span>
        ) : (
          <span className="text-success">Everything measurable is measured.</span>
        )}
      </div>
    </GlassCard>
  );
}

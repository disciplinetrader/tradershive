/**
 * JOURNAL X — PHASE 4 · attempt history on the Trade Story.
 *
 * Lists every replay attempt made against this trade with its process delta,
 * outcome, mistake counts and readiness verdict, plus a small trend strip.
 * Sample size is always visible — two attempts is not a trend.
 */
import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Award, MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MissingData } from "@/components/journal/story/primitives";
import { attemptKeys, deleteAttemptLink, listAttempts, markBestAttempt, type Attempt } from "@/lib/journal/replay-attempts";
import { fmtDelta, READINESS_LABEL, type Readiness } from "@/lib/journal/replay-compare";
import { formatDate, formatNumber } from "@/lib/journal/format";
import { cn } from "@/lib/utils";

const VERDICT_TONE: Record<Readiness, string> = {
  skill_corrected: "border-emerald-500/40 text-emerald-400",
  improved_inconsistent: "border-amber-500/40 text-amber-400",
  repeat_drill: "border-rose-500/40 text-rose-400",
  needs_evidence: "border-border/60 text-muted-foreground",
};

type Summary = { corrected: number; repeated: number };

function summaryOf(a: Attempt): Summary {
  const b = (a.breakdown ?? {}) as { mistakes?: { correctedCount?: number; repeatedCount?: number } };
  return { corrected: b.mistakes?.correctedCount ?? 0, repeated: b.mistakes?.repeatedCount ?? 0 };
}

export function AttemptHistory({ entryId, onPractiseAgain }: { entryId: string; onPractiseAgain: () => void }) {
  const qc = useQueryClient();
  const { data: attempts = [], isLoading } = useQuery({
    queryKey: attemptKeys.forEntry(entryId),
    queryFn: () => listAttempts(entryId),
  });

  const best = useMutation({
    mutationFn: (id: string) => markBestAttempt(entryId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: attemptKeys.forEntry(entryId) });
      toast.success("Marked as best attempt.");
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteAttemptLink(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: attemptKeys.forEntry(entryId) });
      toast.success("Attempt link removed. The replay session was kept.");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const completed = useMemo(() => attempts.filter((a) => a.status === "completed"), [attempts]);

  if (isLoading) return <div className="h-16 animate-pulse rounded-[3px] bg-muted/30" />;

  if (!attempts.length) {
    return (
      <MissingData
        label="No replay practice attempts yet. Replay this trade to build a before/after comparison."
        action={
          <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={onPractiseAgain}>
            Replay this trade
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/50 text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="py-1.5 pr-2 text-left font-normal">#</th>
              <th className="py-1.5 pr-2 text-left font-normal">Date</th>
              <th className="py-1.5 pr-2 text-left font-normal">Mode</th>
              <th className="py-1.5 pr-2 text-right font-normal">Process Δ</th>
              <th className="py-1.5 pr-2 text-right font-normal">Outcome Δ</th>
              <th className="py-1.5 pr-2 text-right font-normal">Fixed / Repeat</th>
              <th className="py-1.5 pr-2 text-left font-normal">Verdict</th>
              <th className="py-1.5 text-right font-normal">Actions</th>
            </tr>
          </thead>
          <tbody>
            {attempts.map((a) => {
              const s = summaryOf(a);
              const pd = a.process_delta == null ? null : Number(a.process_delta);
              const od = a.outcome_delta == null ? null : Number(a.outcome_delta);
              return (
                <tr key={a.id} className="border-b border-border/30 last:border-0">
                  <td className="py-1.5 pr-2 tabular-nums">
                    {a.attempt_number}
                    {a.is_best && <Award className="ml-1 inline h-3 w-3 text-amber-400" aria-label="Best attempt" />}
                  </td>
                  <td className="py-1.5 pr-2 text-muted-foreground">{formatDate(a.completed_at ?? a.created_at)}</td>
                  <td className="py-1.5 pr-2 capitalize text-muted-foreground">{a.mode.replace(/_/g, " ")}</td>
                  <td className={cn("py-1.5 pr-2 text-right tabular-nums", tone(pd))}>{fmtDelta(pd)}</td>
                  <td className={cn("py-1.5 pr-2 text-right tabular-nums", tone(od))}>{od == null ? "—" : formatNumber(od, 2)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-muted-foreground">
                    {a.status === "completed" ? `${s.corrected} / ${s.repeated}` : "—"}
                  </td>
                  <td className="py-1.5 pr-2">
                    {a.status !== "completed" ? (
                      <Badge variant="outline" className="h-4 rounded-[2px] px-1 text-[10px] capitalize">
                        {a.status.replace(/_/g, " ")}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className={cn("h-4 rounded-[2px] px-1 text-[10px]", VERDICT_TONE[(a.verdict as Readiness) ?? "needs_evidence"])}>
                        {READINESS_LABEL[(a.verdict as Readiness) ?? "needs_evidence"]}
                      </Badge>
                    )}
                  </td>
                  <td className="py-1.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {a.status === "completed" ? (
                        <Button asChild size="sm" variant="ghost" className="h-6 px-2 text-[11px]">
                          <Link to="/journal/replay/$attemptId" params={{ attemptId: a.id }}>Compare</Link>
                        </Button>
                      ) : (
                        <Button asChild size="sm" variant="ghost" className="h-6 px-2 text-[11px]">
                          <Link to="/replay/studio" search={{ id: a.session_id ?? undefined } as never}>Resume</Link>
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" aria-label="Attempt actions">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={onPractiseAgain}>Replay again</DropdownMenuItem>
                          <DropdownMenuItem disabled={a.status !== "completed"} onClick={() => best.mutate(a.id)}>
                            Mark best attempt
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => remove.mutate(a.id)}>
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove link
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ImprovementTrend attempts={completed} />
    </div>
  );
}

/** Sparkline-style strip. Deliberately refuses to draw a trend under 3 points. */
export function ImprovementTrend({ attempts }: { attempts: Attempt[] }) {
  const points = attempts
    .filter((a) => a.process_delta != null)
    .map((a) => ({ n: a.attempt_number, v: Number(a.process_delta) }));

  if (!points.length) return null;

  const max = Math.max(20, ...points.map((p) => Math.abs(p.v)));

  return (
    <div className="rounded-[3px] border border-border/50 bg-muted/10 p-2">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Process delta by attempt</span>
        <span className="text-[10px] text-muted-foreground">
          n = {points.length}
          {points.length < 3 && " · too few attempts to read a trend"}
        </span>
      </div>
      <div className="flex items-end gap-1" style={{ height: 44 }}>
        {points.map((p) => {
          const h = Math.max(2, (Math.abs(p.v) / max) * 40);
          return (
            <div key={p.n} className="flex flex-1 flex-col items-center justify-end gap-0.5" title={`Attempt ${p.n}: ${fmtDelta(p.v)}`}>
              <div className={cn("w-full rounded-[1px]", p.v >= 0 ? "bg-emerald-500/60" : "bg-rose-500/60")} style={{ height: h }} />
              <span className="text-[9px] tabular-nums text-muted-foreground">{p.n}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function tone(v: number | null) {
  if (v == null) return "text-muted-foreground";
  return v > 0 ? "text-emerald-400" : v < 0 ? "text-rose-400" : "text-muted-foreground";
}

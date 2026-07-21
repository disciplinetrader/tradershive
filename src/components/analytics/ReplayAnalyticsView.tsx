import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Award, Brain, Clock, ListChecks, Sparkles, Target } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { getReplayAnalytics } from "@/lib/analytics.functions";
import { fmtNumber } from "@/lib/statistics/format";

/**
 * Aggregated replay analytics — sessions completed, average scores across the
 * six coach dimensions, top mistakes and homework compliance.
 */
export function ReplayAnalyticsView() {
  const getFn = useServerFn(getReplayAnalytics);
  const q = useQuery({ queryKey: ["analytics", "replay"], queryFn: () => getFn(), staleTime: 30_000 });
  const d = q.data;

  const scoreRows = useMemo(
    () =>
      d
        ? [
            { label: "Overall", value: d.avgScore, icon: Award },
            { label: "Discipline", value: d.avgDiscipline, icon: Target },
            { label: "Risk", value: d.avgRisk, icon: Target },
            { label: "Execution", value: d.avgExecution, icon: Sparkles },
            { label: "Patience", value: d.avgPatience, icon: Clock },
            { label: "Consistency", value: d.avgConsistency, icon: Brain },
          ]
        : [],
    [d],
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Replay sessions" value={d ? String(d.totalSessions) : "—"} sub={d ? `${d.completed} completed` : ""} />
        <Kpi label="Replay minutes" value={d ? String(d.replayMinutes) : "—"} sub="cumulative practice time" />
        <Kpi label="Mistakes logged" value={d ? String(d.totalMistakes) : "—"} sub="deterministic detections" />
        <Kpi
          label="Homework"
          value={d ? `${d.homeworkPct}%` : "—"}
          sub={d ? `${d.homeworkDone}/${d.homeworkTotal} completed` : ""}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <GlassCard className="p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Coach score averages
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {scoreRows.map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-xl border border-border/40 bg-background/40 p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <Icon className="h-3 w-3" /> {label}
                </div>
                <div className="mt-1 text-lg font-bold tabular-nums">{fmtNumber(value)}</div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard className="p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            <ListChecks className="h-3.5 w-3.5" /> Top mistake patterns
          </div>
          {!d || d.topMistakes.length === 0 ? (
            <div className="grid h-32 place-items-center text-xs text-muted-foreground">
              No mistakes logged yet — run a replay session.
            </div>
          ) : (
            <div className="space-y-1.5">
              {d.topMistakes.map((m: { type: string; count: number }) => (
                <div key={m.type} className="flex items-center justify-between rounded-lg border border-border/40 bg-background/40 p-2 text-xs">
                  <span className="capitalize">{m.type.replaceAll("_", " ")}</span>
                  <span className="rounded-md bg-danger/10 px-2 py-0.5 font-semibold text-danger">{m.count}×</span>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <GlassCard className="p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>
    </GlassCard>
  );
}

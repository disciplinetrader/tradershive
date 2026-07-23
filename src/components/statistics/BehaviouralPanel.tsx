import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { useStatistics } from "./context";
import { computeBehaviourFlags, type BehaviourFlag } from "@/lib/statistics/advanced";

const TONE: Record<BehaviourFlag["severity"], string> = {
  info:   "border-border/40 bg-background/40 text-muted-foreground",
  warn:   "border-warning/40 bg-warning/10 text-warning",
  danger: "border-danger/40 bg-danger/10 text-danger",
};

function IconFor({ f }: { f: BehaviourFlag }) {
  if (!f.measurable) return <Info className="h-4 w-4 text-muted-foreground" />;
  if (f.severity === "danger" || f.severity === "warn") return <AlertTriangle className="h-4 w-4" />;
  return <CheckCircle2 className="h-4 w-4 text-success" />;
}

/**
 * Behavioural Analytics panel.
 * Detects overtrading, cutting winners, holding losers, early/late exits,
 * revenge trading, off-session and risk-cap breaches from the existing dataset.
 * Serves as the data foundation for the AI Trading Coach (Phase 8+).
 */
export function BehaviouralPanel() {
  const { filtered, loading } = useStatistics();
  const flags = useMemo(() => computeBehaviourFlags(filtered), [filtered]);

  if (loading && filtered.length === 0) {
    return (
      <GlassCard className="p-4 space-y-3">
        <Skeleton className="h-4 w-40" />
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      </GlassCard>
    );
  }

  const measurable = flags.filter((f) => f.measurable);
  const healthy = measurable.filter((f) => f.severity === "info").length;
  const total = measurable.length || 1;
  const healthScore = Math.round((healthy / total) * 100);

  return (
    <GlassCard className="p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Behavioural analytics</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Detects impulse patterns from trade history. Feeds the AI Trading Coach.
          </div>
        </div>
        <Badge variant="outline" className={healthScore >= 75 ? "border-success/40 bg-success/10 text-success" : healthScore >= 50 ? "border-warning/40 bg-warning/10 text-warning" : "border-danger/40 bg-danger/10 text-danger"}>
          Discipline {healthScore}%
        </Badge>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {flags.map((f) => (
          <div key={f.key} className={`rounded-2xl border p-3 ${TONE[f.measurable ? f.severity : "info"]}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <IconFor f={f} />
                {f.label}
              </div>
              <div className="text-right">
                <div className="text-lg font-bold tabular-nums text-foreground">
                  {f.measurable ? f.count : "—"}
                </div>
                {f.measurable && f.rate > 0 ? (
                  <div className="text-[10px] text-muted-foreground">{f.rate.toFixed(1)}%</div>
                ) : null}
              </div>
            </div>
            <div className="mt-1.5 text-[11px] text-muted-foreground leading-snug">
              {f.description}
            </div>
            {!f.measurable ? (
              <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">Not yet measurable</div>
            ) : null}
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

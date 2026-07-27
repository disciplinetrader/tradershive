import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, ShieldAlert, Sparkles } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { RULES } from "@/lib/mistakes/engine";
import { getMistakeAnalysis } from "@/lib/mistakes.functions";

/** Dashboard widget: "Top Current Habit — estimated monthly impact". */
export function TopMistakeWidget() {
  const fn = useServerFn(getMistakeAnalysis);
  const q = useQuery({
    queryKey: ["mistake-analysis", 30],
    queryFn: () => fn({ data: { rangeDays: 30 } }),
    staleTime: 5 * 60_000,
  });

  if (q.isPending) {
    return <GlassCard className="h-40 animate-pulse" />;
  }

  const top = (q.data?.detected ?? []).find((d) => !d.resolved);
  const improving = q.data?.totals.improving_count ?? 0;
  const totalImpact = q.data?.totals.total_impact_r ?? 0;

  return (
    <GlassCard className="relative overflow-hidden p-5">
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-destructive/10 blur-2xl" />
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-destructive/10 text-destructive">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Top current habit</div>
            <Badge variant="outline" className="text-[10px]">Last 30d</Badge>
          </div>
          {top ? (
            <>
              <div className="mt-1 truncate text-lg font-semibold">{top.title}</div>
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{RULES[top.kind].fix}</p>

              <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Est. monthly impact</span>
                <span className={cn("font-mono text-xl font-bold tabular-nums", top.impact_r < 0 ? "text-destructive" : "text-success")}>
                  {top.impact_r > 0 ? "+" : ""}{top.impact_r.toFixed(1)}R
                </span>
                <span className="text-[11px] text-muted-foreground">across {top.frequency} trades</span>
              </div>
            </>
          ) : (
            <>
              <div className="mt-1 text-lg font-semibold text-success">No costly habits detected</div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Keep journalling — the engine watches every trade for recurring patterns.
              </p>
            </>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-3">
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span>
            <span className={cn("font-mono font-semibold tabular-nums", totalImpact < 0 ? "text-destructive" : "text-success")}>
              {totalImpact > 0 ? "+" : ""}{totalImpact.toFixed(1)}R
            </span> total
          </span>
          {improving > 0 && (
            <span className="inline-flex items-center gap-1 text-success">
              <Sparkles className="h-3 w-3" /> {improving} improving
            </span>
          )}
        </div>
        <Link to="/mistakes" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          Review <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </GlassCard>
  );
}

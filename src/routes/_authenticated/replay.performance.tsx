import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  Clock,
  Film,
  Percent,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { getReplayPerformanceOverview } from "@/lib/replay-performance.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/replay/performance")({
  head: () => ({
    meta: [
      { title: "Replay Performance — TradersHIVE Arena" },
      {
        name: "description",
        content:
          "Aggregate performance across every replay session: hours practiced, trades reviewed, win rate, profit factor, best sessions and improvement over time.",
      },
    ],
  }),
  component: ReplayPerformancePage,
});

function ReplayPerformancePage() {
  const fetchOverview = useServerFn(getReplayPerformanceOverview);
  const q = useQuery({
    queryKey: ["replay", "performance"],
    queryFn: () => fetchOverview(),
  });

  const d = q.data;

  const tiles: {
    label: string;
    value: string | number;
    icon: React.ComponentType<{ className?: string }>;
    tone?: "success" | "danger" | "info" | "warning";
  }[] = [
    { label: "Total Replays", value: d?.totals.sessions ?? 0, icon: Film },
    { label: "Practice Hours", value: (d?.totals.hours ?? 0).toFixed(1), icon: Clock },
    { label: "Trades Reviewed", value: d?.totals.trades ?? 0, icon: Activity },
    { label: "Win Rate", value: `${d?.performance.winRate ?? 0}%`, icon: Percent, tone: "success" },
    { label: "Avg RR", value: (d?.performance.avgRR ?? 0).toFixed(2), icon: Target, tone: "info" },
    { label: "Profit Factor", value: (d?.performance.profitFactor ?? 0).toFixed(2), icon: TrendingUp, tone: "info" },
    { label: "Net PnL", value: (d?.performance.netPnl ?? 0).toFixed(2), icon: TrendingUp, tone: (d?.performance.netPnl ?? 0) >= 0 ? "success" : "danger" },
    { label: "Avg Replay Score", value: d?.performance.avgScore ?? 0, icon: Sparkles, tone: "warning" },
  ];

  const week = d?.weeklyScore ?? [];
  const maxAvg = Math.max(1, ...week.map((w) => w.avg));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Replay Performance"
        description="Track improvement across every replay session and instrument."
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/replay/library">
                <Film className="mr-2 h-3.5 w-3.5" />
                Library
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/replay">
                <Sparkles className="mr-2 h-3.5 w-3.5" />
                Start Practice
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <GlassCard key={t.label} className="p-4">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "rounded-[3px] p-2",
                    t.tone === "success" && "bg-success/10 text-success",
                    t.tone === "danger" && "bg-danger/10 text-danger",
                    t.tone === "info" && "bg-info/10 text-info",
                    t.tone === "warning" && "bg-warning/10 text-warning",
                    !t.tone && "bg-primary/10 text-primary",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {t.label}
                  </div>
                  <div className="truncate text-lg font-bold tabular-nums">
                    {q.isPending ? "…" : t.value}
                  </div>
                </div>
              </div>
            </GlassCard>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <GlassCard className="lg:col-span-2 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Improvement Over Time
            </h3>
            <span className="text-[10px] text-muted-foreground">Avg score · last 8 weeks</span>
          </div>
          {week.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted-foreground">
              Finish a replay session to start seeing your improvement curve.
            </div>
          ) : (
            <div className="flex h-40 items-end gap-2">
              {week.map((w) => (
                <div key={w.week} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t-[3px] bg-primary/70"
                    style={{ height: `${Math.max(4, (w.avg / maxAvg) * 100)}%` }}
                    title={`${w.week} · ${Math.round(w.avg)}`}
                  />
                  <div className="text-[9px] tabular-nums text-muted-foreground">
                    {w.week.slice(-3)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>

        <GlassCard className="p-4 space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Most Practiced
          </h3>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between">
              <span className="text-muted-foreground">Instrument</span>
              <span className="font-semibold">{d?.preferences.mostPracticedSymbol ?? "—"}</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-muted-foreground">Market</span>
              <span className="font-semibold capitalize">{d?.preferences.mostPracticedMarket ?? "—"}</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-muted-foreground">Strategy</span>
              <span className="font-mono text-xs">
                {d?.preferences.mostPracticedStrategy?.slice(0, 8) ?? "—"}
              </span>
            </li>
          </ul>

          <div className="mt-4 rounded-[3px] border border-border/60 bg-background/60 p-3">
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-warning">
              <Trophy className="h-3.5 w-3.5" /> Best Session
            </div>
            <div className="text-2xl font-bold tabular-nums">
              {d?.performance.bestScore ?? 0}
            </div>
            {d?.performance.bestSessionId ? (
              <Button asChild variant="link" size="sm" className="h-6 px-0">
                <Link
                  to="/replay/studio"
                  search={{ id: d.performance.bestSessionId } as never}
                >
                  <Star className="mr-1 h-3 w-3" />
                  Open best replay
                </Link>
              </Button>
            ) : null}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, LineChart, Sparkles, Target, TrendingDown, TrendingUp } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ManualEntryDialog } from "@/components/journal/ManualEntryDialog";
import { fetchEntries, journalKeys } from "@/lib/journal/api";
import { formatCurrency } from "@/lib/journal/format";
import { detectInsights, hiveScore, scoreBand, summarize } from "@/lib/journal/metrics";
import { cn } from "@/lib/utils";
import { useImprovement } from "@/lib/journal/use-improvement";
import { IntelligencePanel } from "@/components/journal/improvement/IntelligencePanel";

export const Route = createFileRoute("/_authenticated/journal/")({
  head: () => ({
    meta: [
      { title: "Journal Overview — TradersHIVE" },
      { name: "description", content: "Your Hive Score, journal health and the fixes that will move your numbers." },
      { property: "og:title", content: "Journal Overview — TradersHIVE" },
      { property: "og:description", content: "Your Hive Score, journal health and the fixes that move your numbers." },
    ],
  }),
  component: JournalOverview,
});

function JournalOverview() {
  const entriesQuery = useQuery({ queryKey: journalKeys.list(), queryFn: fetchEntries, staleTime: 30_000 });
  const entries = entriesQuery.data ?? [];
  // Phase 5: same roll-up the Analytics area renders, so the two never disagree.
  const improvement = useImprovement();

  const score = useMemo(() => hiveScore(entries), [entries]);
  const stats = useMemo(() => summarize(entries.filter((e) => e.status !== "draft")), [entries]);
  const insights = useMemo(() => detectInsights(entries), [entries]);
  const recent = useMemo(() => entries.slice(0, 5), [entries]);

  if (entriesQuery.isLoading) {
    return (
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full rounded-3xl" />
        ))}
      </div>
    );
  }

  if (!entries.length) {
    return (
      <GlassCard className="p-8">
        <EmptyState
          icon={LineChart}
          title="Your journal starts with one trade"
          description="Log a trade and TradersHIVE will build your Hive Score, spot your patterns and turn mistakes into drills."
        />
        <div className="mt-4 grid place-items-center">
          <ManualEntryDialog trigger={<Button className="gradient-primary text-primary-foreground">Log your first trade</Button>} />
        </div>
      </GlassCard>
    );
  }

  const band = scoreBand(score.total);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-3">
        <GlassCard className="p-5 lg:col-span-1">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Hive Score</p>
              <p className="mt-1 text-4xl font-semibold tabular-nums">{score.total}</p>
              <p
                className={cn(
                  "mt-1 text-xs font-medium",
                  band.tone === "up" ? "text-success" : band.tone === "down" ? "text-danger" : "text-muted-foreground",
                )}
              >
                {band.label} · {score.sample} scored trade{score.sample === 1 ? "" : "s"}
              </p>
            </div>
            <Target className="h-5 w-5 text-primary" />
          </div>
          <div className="mt-4 space-y-2">
            {[
              { label: "Discipline", value: score.discipline },
              { label: "Risk", value: score.risk },
              { label: "Execution", value: score.execution },
              { label: "Consistency", value: score.consistency },
              { label: "Journaling", value: score.journaling },
            ].map((d) => (
              <div key={d.label}>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{d.label}</span>
                  <span className="tabular-nums text-foreground">{d.value}</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${d.value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </GlassCard>

        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
          <Kpi label="Net P&L" value={formatCurrency(stats.netPnl)} tone={stats.netPnl >= 0 ? "up" : "down"} />
          <Kpi label="Win rate" value={`${stats.winRate.toFixed(1)}%`} tone="flat" />
          <Kpi
            label="Profit factor"
            value={Number.isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : "∞"}
            tone={stats.profitFactor >= 1 ? "up" : "down"}
          />
          <Kpi label="Avg R:R" value={stats.avgRR.toFixed(2)} tone="flat" />
          <Kpi label="Expectancy / trade" value={formatCurrency(stats.expectancy)} tone={stats.expectancy >= 0 ? "up" : "down"} />
          <Kpi label="Trades journaled" value={`${Math.round(stats.journaledPct)}%`} tone="flat" />
        </div>
      </div>

      <IntelligencePanel rollup={improvement.rollup} entries={improvement.entries} />

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-primary" /> What to fix next
            </h2>
            <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
              <Link to="/journal/coach">AI Coach <ArrowRight className="ml-1 h-3 w-3" /></Link>
            </Button>
          </div>
          {insights.length === 0 ? (
            <p className="text-xs text-muted-foreground">Log a few more trades and patterns will show up here.</p>
          ) : (
            <ul className="space-y-2">
              {insights.map((i) => (
                <li key={i.id} className="rounded-xl border border-border/60 p-3">
                  <p className="text-sm font-medium">{i.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{i.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>

        <GlassCard className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Recent trades</h2>
            <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
              <Link to="/journal/trades">All trades <ArrowRight className="ml-1 h-3 w-3" /></Link>
            </Button>
          </div>
          <ul className="divide-y divide-border/60">
            {recent.map((e) => (
              <li key={e.id}>
                <Link
                  to="/journal/$entryId"
                  params={{ entryId: e.id }}
                  className="flex items-center justify-between gap-3 py-2 text-sm hover:text-primary"
                >
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{e.symbol ?? "Untitled"}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{e.setup ?? e.strategy ?? "No setup"}</span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 tabular-nums text-xs",
                      Number(e.pnl ?? 0) >= 0 ? "text-success" : "text-danger",
                    )}
                  >
                    {formatCurrency(Number(e.pnl ?? 0))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </GlassCard>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: "up" | "down" | "flat" }) {
  const Icon = tone === "up" ? TrendingUp : tone === "down" ? TrendingDown : LineChart;
  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{label}</p>
        <Icon
          className={cn(
            "h-4 w-4",
            tone === "up" ? "text-success" : tone === "down" ? "text-danger" : "text-muted-foreground",
          )}
        />
      </div>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </GlassCard>
  );
}

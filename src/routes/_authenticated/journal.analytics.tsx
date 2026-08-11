import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useJournalEntries } from "@/lib/journal/source-filter";
import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { fetchEntries, journalKeys } from "@/lib/journal/api";
import { formatCurrency } from "@/lib/journal/format";
import {
  countsTowardAnalytics,
  detectInsights,
  sessionBreakdown,
  setupBreakdown,
  summarize,
  symbolBreakdown,
  type FrequencyRow,
} from "@/lib/journal/metrics";
import { cn } from "@/lib/utils";
import { useImprovement } from "@/lib/journal/use-improvement";
import { AnalyticsRollup } from "@/components/journal/improvement/AnalyticsRollup";

export const Route = createFileRoute("/_authenticated/journal/analytics")({
  head: () => ({
    meta: [
      { title: "Journal Analytics — TradersHIVE" },
      { name: "description", content: "Setup, session and symbol performance with AI-style pattern detection." },
      { property: "og:title", content: "Journal Analytics — TradersHIVE" },
      { property: "og:description", content: "Setup, session and symbol performance with pattern detection." },
    ],
  }),
  component: JournalAnalytics,
});

function JournalAnalytics() {
  const entriesQuery = useJournalEntries();
  const entries = useMemo(
    () => (entriesQuery.data ?? []).filter(countsTowardAnalytics),
    [entriesQuery.data],
  );

  const stats = useMemo(() => summarize(entries), [entries]);
  const setups = useMemo(() => setupBreakdown(entries).slice(0, 8), [entries]);
  const sessions = useMemo(() => sessionBreakdown(entries), [entries]);
  const symbols = useMemo(() => symbolBreakdown(entries).slice(0, 8), [entries]);
  const insights = useMemo(() => detectInsights(entries), [entries]);
  const improvement = useImprovement();

  if (!entriesQuery.isLoading && entries.length === 0) {
    return (
      <GlassCard className="p-8">
        <EmptyState
          icon={BarChart3}
          title="Nothing to analyse yet"
          description="Publish a few journal entries and TradersHIVE will break down your edge by setup, session and symbol."
          action={{ label: "Log a trade", href: "/journal/trades" }}
        />
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Net P&L" value={formatCurrency(stats.netPnl)} tone={stats.netPnl >= 0 ? "up" : "down"} />
        <Metric label="Profit factor" value={Number.isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : "∞"} tone={stats.profitFactor >= 1 ? "up" : "down"} />
        <Metric label="Avg win / loss" value={`${formatCurrency(stats.avgWin)} / ${formatCurrency(-stats.avgLoss)}`} tone="flat" />
        <Metric label="Best / worst" value={`${formatCurrency(stats.bestTrade)} / ${formatCurrency(stats.worstTrade)}`} tone="flat" />
      </div>

      {insights.length ? (
        <GlassCard className="p-5">
          <h2 className="mb-3 text-sm font-semibold">Detected patterns</h2>
          <ul className="grid gap-2 md:grid-cols-2">
            {insights.map((i) => (
              <li key={i.id} className="rounded-xl border border-border/60 p-3">
                <p className="text-sm font-medium">{i.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{i.detail}</p>
              </li>
            ))}
          </ul>
        </GlassCard>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <BreakdownCard title="By setup" rows={setups} emptyHint="Tag your trades with a setup to unlock this." />
        <BreakdownCard title="By session" rows={sessions} emptyHint="Sessions are auto-detected on new trades." />
        <BreakdownCard title="By symbol" rows={symbols} emptyHint="Add a symbol to your entries." />
      </div>

      <AnalyticsRollup rollup={improvement.rollup} entries={improvement.entries} homework={improvement.homework} />

      <GlassCard className="flex flex-wrap items-center justify-between gap-2 p-4">
        <p className="text-xs text-muted-foreground">Need deeper equity, risk and drawdown analytics?</p>
        <Button asChild variant="outline" size="sm">
          <Link to="/analytics">Open full Analytics</Link>
        </Button>
      </GlassCard>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: "up" | "down" | "flat" }) {
  return (
    <GlassCard className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-lg font-semibold tabular-nums", tone === "up" && "text-success", tone === "down" && "text-danger")}>
        {value}
      </p>
    </GlassCard>
  );
}

function BreakdownCard({ title, rows, emptyHint }: { title: string; rows: FrequencyRow[]; emptyHint: string }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.pnl)));
  return (
    <GlassCard className="p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyHint}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.key}>
              <div className="flex items-center justify-between text-xs">
                <span className="truncate">{r.key}</span>
                <span className={cn("tabular-nums", r.pnl >= 0 ? "text-success" : "text-danger")}>{formatCurrency(r.pnl)}</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full", r.pnl >= 0 ? "bg-success" : "bg-danger")}
                  style={{ width: `${(Math.abs(r.pnl) / max) * 100}%` }}
                />
              </div>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {r.count} trades · {Math.round(r.winRate)}% win
              </p>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}

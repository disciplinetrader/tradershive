import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useJournalEntries } from "@/lib/journal/source-filter";
import { useQuery } from "@tanstack/react-query";
import { BookOpen } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { fetchEntries, journalKeys } from "@/lib/journal/api";
import { formatCurrency } from "@/lib/journal/format";
import { countsTowardAnalytics, setupBreakdown } from "@/lib/journal/metrics";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/journal/playbooks")({
  head: () => ({
    meta: [
      { title: "Journal Playbooks — TradersHIVE" },
      { name: "description", content: "See which of your setups actually make money and which ones to retire." },
      { property: "og:title", content: "Journal Playbooks — TradersHIVE" },
      { property: "og:description", content: "See which setups make money and which to retire." },
    ],
  }),
  component: JournalPlaybooks,
});

function JournalPlaybooks() {
  const entriesQuery = useJournalEntries();
  const entries = useMemo(
    () => (entriesQuery.data ?? []).filter(countsTowardAnalytics),
    [entriesQuery.data],
  );
  const rows = useMemo(() => setupBreakdown(entries), [entries]);

  if (!entriesQuery.isLoading && rows.length === 0) {
    return (
      <GlassCard className="p-8">
        <EmptyState
          icon={BookOpen}
          title="No playbooks matched yet"
          description="Tag your journal entries with a setup and TradersHIVE will score each playbook by expectancy and win rate."
          action={{ label: "Tag your trades", href: "/journal/trades" }}
          secondaryAction={{ label: "Build a playbook", href: "/ai/playbooks" }}
        />
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => {
          const expectancy = r.count ? r.pnl / r.count : 0;
          const verdict = expectancy > 0 ? "Scale it" : expectancy < 0 ? "Retire or rework" : "Neutral";
          return (
            <GlassCard key={r.key} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="truncate text-sm font-semibold">{r.key}</h3>
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-2 py-0.5 text-[10px]",
                    expectancy > 0
                      ? "border-success/40 text-success"
                      : expectancy < 0
                        ? "border-danger/40 text-danger"
                        : "border-border text-muted-foreground",
                  )}
                >
                  {verdict}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <Cell label="Trades" value={String(r.count)} />
                <Cell label="Win rate" value={`${Math.round(r.winRate)}%`} />
                <Cell label="Net" value={formatCurrency(r.pnl)} tone={r.pnl >= 0 ? "up" : "down"} />
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Expectancy {formatCurrency(expectancy)} per trade.
              </p>
            </GlassCard>
          );
        })}
      </div>

      <GlassCard className="flex flex-wrap items-center justify-between gap-2 p-4">
        <p className="text-xs text-muted-foreground">Turn a winning setup into a documented, rule-based playbook.</p>
        <Button asChild variant="outline" size="sm">
          <Link to="/ai/playbooks">Open Playbook builder</Link>
        </Button>
      </GlassCard>
    </div>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="rounded-lg border border-border/60 p-2">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={cn("text-sm font-semibold tabular-nums", tone === "up" && "text-success", tone === "down" && "text-danger")}>
        {value}
      </p>
    </div>
  );
}

import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useJournalEntries } from "@/lib/journal/source-filter";
import { useQuery } from "@tanstack/react-query";
import { Brain } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { fetchEntries, journalKeys } from "@/lib/journal/api";
import { formatCurrency } from "@/lib/journal/format";
import { emotionBreakdown, mistakeBreakdown } from "@/lib/journal/metrics";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/journal/psychology")({
  head: () => ({
    meta: [
      { title: "Journal Psychology — TradersHIVE" },
      { name: "description", content: "Correlate the emotions you traded with against the money you actually made." },
      { property: "og:title", content: "Journal Psychology — TradersHIVE" },
      { property: "og:description", content: "Correlate emotions with real trading results." },
    ],
  }),
  component: JournalPsychology,
});

function JournalPsychology() {
  const entriesQuery = useJournalEntries();
  const entries = useMemo(() => (entriesQuery.data ?? []).filter((e) => e.status !== "draft"), [entriesQuery.data]);
  const emotions = useMemo(() => emotionBreakdown(entries), [entries]);
  const mistakes = useMemo(() => mistakeBreakdown(entries), [entries]);

  if (!entriesQuery.isLoading && emotions.length === 0 && mistakes.length === 0) {
    return (
      <GlassCard className="p-8">
        <EmptyState
          icon={Brain}
          title="No psychology data yet"
          description="Log how you felt before and after a trade — it takes ten seconds and it is the fastest way to find your leaks."
          action={{ label: "Add emotions to a trade", href: "/journal/trades" }}
          secondaryAction={{ label: "Open AI Psychology", href: "/ai/psychology" }}
        />
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard className="p-4">
          <h2 className="mb-3 text-sm font-semibold">Emotion vs performance</h2>
          {emotions.length === 0 ? (
            <p className="text-xs text-muted-foreground">Tag emotions on your entries to build this view.</p>
          ) : (
            <ul className="space-y-2">
              {emotions.map((r) => (
                <li key={r.key} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm capitalize">{r.key}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {r.count} trades · {Math.round(r.winRate)}% win
                    </p>
                  </div>
                  <span className={cn("tabular-nums text-sm", r.pnl >= 0 ? "text-success" : "text-danger")}>
                    {formatCurrency(r.pnl)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>

        <GlassCard className="p-4">
          <h2 className="mb-3 text-sm font-semibold">Mistake taxonomy</h2>
          {mistakes.length === 0 ? (
            <p className="text-xs text-muted-foreground">No mistakes logged. Keep it that way.</p>
          ) : (
            <ul className="space-y-2">
              {mistakes.map((r) => (
                <li key={r.key} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{r.key}</p>
                    <p className="text-[10px] text-muted-foreground">{r.count} occurrences</p>
                  </div>
                  <span className={cn("tabular-nums text-sm", r.pnl >= 0 ? "text-success" : "text-danger")}>
                    {formatCurrency(r.pnl)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      </div>

      <GlassCard className="flex flex-wrap items-center justify-between gap-2 p-4">
        <p className="text-xs text-muted-foreground">Want a deeper psychological profile and drills?</p>
        <Button asChild variant="outline" size="sm">
          <Link to="/ai/psychology">Open AI Psychology</Link>
        </Button>
      </GlassCard>
    </div>
  );
}

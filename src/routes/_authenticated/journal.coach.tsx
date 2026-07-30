import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Sparkles } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { fetchEntries, journalKeys } from "@/lib/journal/api";
import { detectInsights, hiveScore, scoreBand } from "@/lib/journal/metrics";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/journal/coach")({
  head: () => ({
    meta: [
      { title: "Journal AI Coach — TradersHIVE" },
      { name: "description", content: "Your journal turned into concrete drills, fixes and next actions." },
      { property: "og:title", content: "Journal AI Coach — TradersHIVE" },
      { property: "og:description", content: "Your journal turned into drills, fixes and next actions." },
    ],
  }),
  component: JournalCoach,
});

function JournalCoach() {
  const entriesQuery = useQuery({ queryKey: journalKeys.list(), queryFn: fetchEntries, staleTime: 30_000 });
  const entries = entriesQuery.data ?? [];
  const insights = useMemo(() => detectInsights(entries), [entries]);
  const score = useMemo(() => hiveScore(entries), [entries]);
  const band = scoreBand(score.total);
  const weakest = useMemo(
    () =>
      [
        { k: "Discipline", v: score.discipline },
        { k: "Risk", v: score.risk },
        { k: "Execution", v: score.execution },
        { k: "Consistency", v: score.consistency },
        { k: "Journaling", v: score.journaling },
      ].sort((a, b) => a.v - b.v)[0].k,
    [score],
  );

  if (!entriesQuery.isLoading && entries.length === 0) {
    return (
      <GlassCard className="p-8">
        <EmptyState
          icon={Sparkles}
          title="The coach needs trades to coach"
          description="Log at least three trades with notes and the coach will start returning concrete fixes and drills."
          action={{ label: "Log a trade", href: "/journal/trades" }}
          secondaryAction={{ label: "Open AI Coach", href: "/ai/coach" }}
        />
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      <GlassCard className="p-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Coach read on your journal</p>
        <p className="mt-1 text-lg font-semibold">
          Hive Score {score.total} —{" "}
          <span
            className={cn(
              band.tone === "up" ? "text-success" : band.tone === "down" ? "text-danger" : "text-muted-foreground",
            )}
          >
            {band.label}
          </span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Weakest driver: {weakest}. Fix that first — it carries the most weight in your score.
        </p>
      </GlassCard>

      <GlassCard className="p-5">
        <h2 className="mb-3 text-sm font-semibold">This week&apos;s fixes</h2>
        {insights.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Not enough signal yet. Publish a few more entries with notes, emotions and mistakes.
          </p>
        ) : (
          <ol className="space-y-2">
            {insights.map((i, idx) => (
              <li key={i.id} className="flex gap-3 rounded-xl border border-border/60 p-3">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                  {idx + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{i.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{i.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </GlassCard>

      <div className="grid gap-3 sm:grid-cols-2">
        <GlassCard className="flex items-center justify-between gap-2 p-4">
          <p className="text-xs text-muted-foreground">Practice the fix in a controlled replay session.</p>
          <Button asChild size="sm" variant="outline">
            <Link to="/replay">
              Practice <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        </GlassCard>
        <GlassCard className="flex items-center justify-between gap-2 p-4">
          <p className="text-xs text-muted-foreground">Get a full AI review with homework and evolution tracking.</p>
          <Button asChild size="sm" variant="outline">
            <Link to="/ai/coach">
              AI Coach <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        </GlassCard>
      </div>
    </div>
  );
}

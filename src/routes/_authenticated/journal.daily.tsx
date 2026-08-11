/**
 * DAILY JOURNAL — /journal/daily?day=yyyy-mm-dd
 *
 * The day as the unit. Two authored texts (pre-market plan, end-of-day recap)
 * and everything else derived from that day's entries, so the totals here can
 * never disagree with the calendar or the reports.
 *
 * Navigation steps between days that actually have trades rather than empty
 * calendar days — the same reasoning as the calendar opening on the newest
 * month with data: stepping through six blank days to find one is not
 * navigation.
 */
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, NotebookPen } from "lucide-react";
import { toast } from "sonner";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import { useJournalEntries } from "@/lib/journal/source-filter";
import { formatCurrency } from "@/lib/journal/format";
import { summarize } from "@/lib/journal/metrics";
import { detectTimezone, dayKey } from "@/lib/analytics/periods";
import {
  adjacentTradedDays,
  dayKeys,
  entriesForDay,
  fetchDay,
  saveDay,
  tradedDays,
} from "@/lib/journal/days";
import { useAuth } from "@/hooks/use-auth";
import { routeBoundaries } from "@/lib/route-boundaries";
import { cn } from "@/lib/utils";

type Search = { day?: string };

export const Route = createFileRoute("/_authenticated/journal/daily")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    day: typeof s.day === "string" ? s.day : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Daily Journal — TradersHIVE" },
      { name: "description", content: "One trading day: the plan you wrote before it, the trades you took, and the recap you wrote after." },
    ],
  }),
  component: DailyJournal,
  ...routeBoundaries({
    label: "Daily journal",
    boundary: "journal_daily_route",
    backHref: "/journal",
    backLabel: "Back to Journal",
  }),
});

function DailyJournal() {
  const { day: dayParam } = useSearch({ from: Route.id });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, profile } = useAuth();
  const tz = profile?.timezone || detectTimezone();

  const entriesQuery = useJournalEntries();
  const entries = entriesQuery.data ?? [];

  const days = useMemo(() => tradedDays(entries, tz), [entries, tz]);
  // Default to the most recent day WITH trades, not today — same reason the
  // calendar opens on the newest month with data.
  const day = dayParam ?? days[0] ?? dayKey(Date.now(), tz);

  const dayEntries = useMemo(() => entriesForDay(entries, day, tz), [entries, day, tz]);
  const stats = useMemo(() => summarize(dayEntries), [dayEntries]);
  const { prev, next } = useMemo(() => adjacentTradedDays(days, day), [days, day]);

  const dayQuery = useQuery({ queryKey: dayKeys.one(day), queryFn: () => fetchDay(day) });

  const [plan, setPlan] = useState("");
  const [recap, setRecap] = useState("");
  useEffect(() => {
    setPlan(dayQuery.data?.plan_text ?? "");
    setRecap(dayQuery.data?.recap_text ?? "");
  }, [dayQuery.data, day]);

  const save = useMutation({
    mutationFn: () => {
      if (!user) throw new Error("Not signed in");
      return saveDay({ userId: user.id, day, plan_text: plan || null, recap_text: recap || null });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dayKeys.one(day) });
      toast.success("Day saved");
    },
    onError: (e: unknown) => toast.error((e as Error).message || "Could not save"),
  });

  const go = (d: string | null) => d && navigate({ to: "/journal/daily", search: { day: d } });
  const label = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className="space-y-4">
      <GlassCard className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h2 className="text-sm font-semibold">{label}</h2>
          <p className="text-xs text-muted-foreground">
            {stats.trades} trade{stats.trades === 1 ? "" : "s"} ·{" "}
            <span className={stats.netPnl >= 0 ? "text-success" : "text-danger"}>
              {formatCurrency(stats.netPnl)}
            </span>
            {stats.winRateMeasurable ? ` · ${stats.winRate.toFixed(0)}% win` : " · win rate not measurable"}
            {" · times in "}
            {tz}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!prev} onClick={() => go(prev)} aria-label="Previous trading day">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => go(days[0] ?? null)}>
            Latest
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!next} onClick={() => go(next)} aria-label="Next trading day">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </GlassCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard className="p-4">
          <h3 className="text-sm font-semibold">Pre-market plan</h3>
          <p className="mb-2 text-xs text-muted-foreground">What you intended, written before the day.</p>
          <Textarea
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            placeholder="Bias, levels, what would make you stand aside…"
            className="min-h-40"
          />
        </GlassCard>
        <GlassCard className="p-4">
          <h3 className="text-sm font-semibold">End-of-day recap</h3>
          <p className="mb-2 text-xs text-muted-foreground">What actually happened, and what you would repeat.</p>
          <Textarea
            value={recap}
            onChange={(e) => setRecap(e.target.value)}
            placeholder="Did you follow the plan? What would you do again?"
            className="min-h-40"
          />
        </GlassCard>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending} className="gradient-primary text-primary-foreground">
          {save.isPending ? "Saving…" : "Save day"}
        </Button>
      </div>

      <GlassCard className="p-4">
        <h3 className="mb-3 text-sm font-semibold">Trades on this day</h3>
        {dayEntries.length === 0 ? (
          <EmptyState
            icon={NotebookPen}
            title="No trades on this day"
            description="Pick another day, or log a trade to start the record."
            action={{ label: "Go to trades", href: "/journal/trades" }}
          />
        ) : (
          <ul className="divide-y divide-border/60">
            {dayEntries.map((e) => (
              <li key={e.id}>
                <Link
                  to="/journal/$entryId"
                  params={{ entryId: e.id }}
                  className="flex items-center justify-between gap-3 py-2 text-sm hover:text-primary"
                >
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{e.symbol ?? "Untitled"}</span>
                    <span className="ml-2 text-xs capitalize text-muted-foreground">{e.direction ?? ""}</span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 font-mono tabular-nums",
                      Number(e.pnl ?? 0) > 0 && "text-success",
                      Number(e.pnl ?? 0) < 0 && "text-danger",
                    )}
                  >
                    {e.pnl != null ? formatCurrency(Number(e.pnl)) : "—"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </div>
  );
}

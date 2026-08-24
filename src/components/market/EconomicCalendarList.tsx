/**
 * Economic calendar — the reading surface for `economic_events`.
 *
 * ── Why this does NOT reuse StudioChart's two filters ──────────────────────
 *
 * `StudioChart` is the only other consumer of `useEconomicEvents`, and it
 * applies two constraints that look like they should be shared. They must not
 * be. Someone will eventually notice the divergence and try to unify it, so
 * both reasons are recorded here rather than in a commit nobody reads.
 *
 * 1 · THE REPLAY CLOCK GATE — `e.timeMs <= marketTime`
 *     (`StudioChart.tsx:274`). That is the replay anti-lookahead rule: a
 *     replay session must never show a trader an event the simulated clock has
 *     not reached, because knowing Friday's payrolls while trading Wednesday's
 *     bar invalidates the exercise. It is a correctness rule THERE and would be
 *     a bug HERE — applied to a live calendar it hides every upcoming event,
 *     which is the entire purpose of this page. This page deliberately shows
 *     the future. Do not add that gate.
 *
 * 2 · THE IMPACT FILTER — `["high", "medium"]` hardcoded
 *     (`StudioChart.tsx:268`). That is a chart-legibility constraint: markers
 *     sit above bars in a fixed strip, and ~48 low-impact events a week would
 *     paper over the price action. Here the same two values are merely the
 *     DEFAULT of a user-adjustable preference — a trader looking for a quiet
 *     window has a legitimate reason to show low and holiday. Same values
 *     today, different reasons, and they should be free to diverge without
 *     anyone treating one as the source of truth for the other.
 *
 * ── Timezone ──────────────────────────────────────────────────────────────
 *
 * The query window is UTC and day grouping happens in the VIEWER's zone via
 * `dayKey`. Those are not the same thing and the difference is visible: a
 * 00:30 UTC release is the previous evening in New York, and bucketing it by
 * UTC date would file it under a day the reader never traded.
 */
import { useMemo, useState } from "react";
import { CalendarClock, Filter } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useEconomicEvents } from "@/lib/economic-calendar/api";
import { type EconomicEvent, type NewsImpact, IMPACT_ORDER } from "@/lib/economic-calendar/types";
import {
  formatDayHeading, formatEventClock, formatValue, timezoneAbbrev,
} from "@/lib/economic-calendar/format";
import { detectTimezone, dayKey } from "@/lib/analytics/periods";
import { cn } from "@/lib/utils";

/** How far either side of now the page reads. */
const DAYS_BACK = 7;
const DAYS_FORWARD = 30;

/**
 * Default matches StudioChart's pair by coincidence, not by dependency — see
 * the header. High and medium are what most traders plan around; low is mostly
 * noise at ~48 events a week and holiday is a market-closed notice.
 */
const DEFAULT_IMPACTS: NewsImpact[] = ["high", "medium"];

const ALL_IMPACTS: { id: NewsImpact; label: string }[] = [
  { id: "high", label: "High" },
  { id: "medium", label: "Medium" },
  { id: "low", label: "Low" },
  { id: "holiday", label: "Holiday" },
];

/**
 * Impact as visual weight, not a word.
 *
 * A filled/half/hollow ramp rather than three red circles: it survives
 * greyscale and colour-vision deficiency, where a red-count would not. The
 * colours stay in StudioChart's vocabulary — high is `destructive`, the same
 * token its high-impact markers use — so the two surfaces agree on what
 * "high" looks like even though they agree on nothing else.
 */
function ImpactDots({ impact }: { impact: NewsImpact }) {
  const filled = impact === "high" ? 3 : impact === "medium" ? 2 : impact === "low" ? 1 : 0;
  const tone =
    impact === "high" ? "bg-destructive" :
    impact === "medium" ? "bg-warning" :
    impact === "low" ? "bg-muted-foreground" : "bg-primary";
  return (
    <span className="inline-flex items-center gap-0.5" title={`${impact} impact`} aria-label={`${impact} impact`}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            i < filled ? tone : "bg-border",
          )}
        />
      ))}
    </span>
  );
}

/** One published figure. Always rendered, em-dash when absent. */
function Figure({ label, value }: { label: string; value: string | null }) {
  const shown = formatValue(value);
  return (
    <span className="whitespace-nowrap">
      <span className="text-muted-foreground">{label}: </span>
      <span className={cn("font-mono", shown === "—" ? "text-muted-foreground/60" : "text-foreground/90")}>
        {shown}
      </span>
    </span>
  );
}

function EventRow({ event, timezone }: { event: EconomicEvent; timezone: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border border-border/60 bg-card/40 px-3 py-2">
      <span className="w-[4.5rem] shrink-0 font-mono text-sm tabular-nums text-foreground/90">
        {formatEventClock(event.timeMs, timezone)}
      </span>
      <span className="shrink-0 rounded-sm bg-background/60 px-1.5 py-0.5 font-mono text-[11px] font-semibold">
        {event.currency}
      </span>
      <ImpactDots impact={event.impact} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium" title={event.title}>
        {event.title}
      </span>
      <span className="flex flex-wrap items-baseline gap-x-3 text-xs">
        <Figure label="Prev" value={event.previous} />
        <Figure label="Fcst" value={event.forecast} />
        <Figure label="Actual" value={event.actual} />
      </span>
      {/* Quiet by design: the duplicate US rows are an accepted consequence of
          running two sources without dedup, and the tag is what makes them
          legible as a decision rather than a bug. */}
      <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground/70">
        {event.source}
      </span>
    </div>
  );
}

export function EconomicCalendarList() {
  const timezone = useMemo(() => detectTimezone(), []);
  const [impacts, setImpacts] = useState<NewsImpact[]>(DEFAULT_IMPACTS);

  const { fromMs, toMs } = useMemo(() => {
    const now = Date.now();
    return { fromMs: now - DAYS_BACK * 86_400_000, toMs: now + DAYS_FORWARD * 86_400_000 };
  }, []);

  // Fetched WITHOUT an impact filter and narrowed below, so toggling a chip is
  // instant and costs no round trip. The window holds a few hundred rows at
  // most against the query's 1000 cap.
  const { data, isLoading, error } = useEconomicEvents({ fromMs, toMs });

  const todayKey = useMemo(() => dayKey(Date.now(), timezone), [timezone]);

  const days = useMemo(() => {
    const visible = (data ?? []).filter((e) => impacts.includes(e.impact));
    const buckets = new Map<string, EconomicEvent[]>();
    for (const e of visible) {
      const k = dayKey(e.timeMs, timezone);
      const list = buckets.get(k);
      if (list) list.push(e);
      else buckets.set(k, [e]);
    }
    for (const list of buckets.values()) {
      // Chronological within a day, most impactful first on a tie — two
      // releases at 08:30 are common and the high-impact one should lead.
      list.sort((a, b) => a.timeMs - b.timeMs || IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact]);
    }
    // Today first, then forward in time, then past days most-recent first.
    // Past stays visible on purpose: those are the rows that carry `actual`,
    // which is the whole reason the second source exists.
    const keys = [...buckets.keys()];
    const future = keys.filter((k) => k >= todayKey).sort();
    const past = keys.filter((k) => k < todayKey).sort().reverse();
    return [...future, ...past].map((k) => ({ key: k, events: buckets.get(k)! }));
  }, [data, impacts, timezone, todayKey]);

  const toggle = (id: NewsImpact) =>
    setImpacts((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  return (
    <div className="space-y-4">
      <GlassCard className="flex flex-wrap items-center gap-2 p-3">
        <Filter className="h-4 w-4 text-muted-foreground" />
        {ALL_IMPACTS.map((i) => (
          <Button
            key={i.id}
            size="sm"
            variant={impacts.includes(i.id) ? "default" : "outline"}
            className="h-7 px-2.5 text-xs"
            onClick={() => toggle(i.id)}
          >
            <ImpactDots impact={i.id} />
            <span className="ml-1.5">{i.label}</span>
          </Button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
          Times in {timezone.replace(/_/g, " ")}
          {timezoneAbbrev(timezone) ? ` · ${timezoneAbbrev(timezone)}` : ""}
        </span>
      </GlassCard>

      {isLoading ? (
        <GlassCard className="space-y-2 p-4">
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
        </GlassCard>
      ) : error ? (
        <GlassCard className="p-4">
          <EmptyState
            icon={CalendarClock}
            tone="danger"
            title="Could not load the calendar"
            description={error instanceof Error ? error.message : "Unknown error."}
          />
        </GlassCard>
      ) : days.length === 0 ? (
        <GlassCard className="p-4">
          <EmptyState
            icon={CalendarClock}
            title="No events in this window"
            description={
              impacts.length === 0
                ? "Every impact level is switched off — turn one back on above."
                : "Nothing scheduled at these impact levels for the next 30 days."
            }
          />
        </GlassCard>
      ) : (
        days.map(({ key, events }) => (
          <GlassCard key={key} className="space-y-2 p-4">
            <div className="flex items-baseline gap-2">
              <h2 className="text-sm font-semibold">
                {key === todayKey ? "Today" : formatDayHeading(events[0].timeMs, timezone)}
              </h2>
              {key === todayKey ? (
                <span className="text-xs text-muted-foreground">
                  {formatDayHeading(events[0].timeMs, timezone)}
                </span>
              ) : null}
              <span className="ml-auto text-xs text-muted-foreground">
                {events.length} event{events.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="space-y-1.5">
              {events.map((e) => <EventRow key={e.id} event={e} timezone={timezone} />)}
            </div>
          </GlassCard>
        ))
      )}
    </div>
  );
}

import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useJournalEntries } from "@/lib/journal/source-filter";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { fetchEntries, journalKeys } from "@/lib/journal/api";
import { formatCurrency } from "@/lib/journal/format";
import { bucketByDay, dayKey, summarize } from "@/lib/journal/metrics";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/journal/calendar")({
  head: () => ({
    meta: [
      { title: "Journal Calendar — TradersHIVE" },
      { name: "description", content: "A behavioural heatmap of your trading days: P&L, discipline and AI grade." },
      { property: "og:title", content: "Journal Calendar — TradersHIVE" },
      { property: "og:description", content: "A behavioural heatmap of your trading days." },
    ],
  }),
  component: JournalCalendar,
});

function JournalCalendar() {
  const entriesQuery = useJournalEntries();
  const entries = entriesQuery.data ?? [];
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState<string | null>(null);

  const buckets = useMemo(() => bucketByDay(entries), [entries]);
  const monthLabel = cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const startPad = new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay();
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();

  const monthDays = useMemo(() => {
    const out: { key: string; date: Date }[] = [];
    for (let d = 1; d <= daysInMonth; d += 1) {
      const date = new Date(cursor.getFullYear(), cursor.getMonth(), d);
      out.push({ key: dayKey(date), date });
    }
    return out;
  }, [cursor, daysInMonth]);

  const monthEntries = useMemo(
    () => monthDays.flatMap((d) => buckets.get(d.key)?.ids ?? []).map((id) => entries.find((e) => e.id === id)!).filter(Boolean),
    [monthDays, buckets, entries],
  );
  const monthStats = useMemo(() => summarize(monthEntries), [monthEntries]);

  const maxAbs = useMemo(() => {
    let m = 0;
    monthDays.forEach((d) => {
      const b = buckets.get(d.key);
      if (b) m = Math.max(m, Math.abs(b.pnl));
    });
    return m || 1;
  }, [monthDays, buckets]);

  const selectedBucket = selected ? buckets.get(selected) : null;

  if (!entriesQuery.isLoading && entries.length === 0) {
    return (
      <GlassCard className="p-8">
        <EmptyState
          icon={CalendarDays}
          title="No trading days yet"
          description="Once you log trades, this calendar shows P&L, discipline and grade for every day you traded."
          action={{ label: "Go to trades", href: "/journal/trades" }}
        />
      </GlassCard>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <GlassCard className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">{monthLabel}</h2>
            <p className="text-xs text-muted-foreground">
              {monthStats.trades} trades · {formatCurrency(monthStats.netPnl)} · {monthStats.winRate.toFixed(0)}% win
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}>
              Today
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase text-muted-foreground">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="py-1">{d}</div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {Array.from({ length: startPad }).map((_, i) => <div key={`pad-${i}`} />)}
          {monthDays.map(({ key, date }) => {
            const b = buckets.get(key);
            const intensity = b ? Math.min(Math.abs(b.pnl) / maxAbs, 1) : 0;
            const positive = (b?.pnl ?? 0) >= 0;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelected(b ? key : null)}
                className={cn(
                  "min-h-16 rounded-lg border border-border/60 p-1.5 text-left transition-colors",
                  selected === key && "ring-1 ring-primary",
                  !b && "opacity-50",
                )}
                style={
                  b
                    ? {
                        backgroundColor: `color-mix(in oklab, var(--${positive ? "success" : "danger"}) ${Math.round(
                          10 + intensity * 40,
                        )}%, transparent)`,
                      }
                    : undefined
                }
              >
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{date.getDate()}</span>
                  {b?.grade ? <span className="font-semibold text-foreground">{b.grade}</span> : null}
                </div>
                {b ? (
                  <>
                    <p className="mt-1 text-[11px] font-semibold tabular-nums">{formatCurrency(b.pnl)}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {b.ids.length}t · {b.discipline != null ? `D${b.discipline.toFixed(0)}` : "—"}
                    </p>
                  </>
                ) : null}
              </button>
            );
          })}
        </div>
      </GlassCard>

      <GlassCard className="p-4">
        <h3 className="text-sm font-semibold">{selectedBucket ? new Date(selectedBucket.date).toDateString() : "Select a day"}</h3>
        {!selectedBucket ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Click any coloured day to review the trades, discipline rating and grade for that session.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Stat label="Net P&L" value={formatCurrency(selectedBucket.pnl)} />
              <Stat label="Trades" value={String(selectedBucket.ids.length)} />
              <Stat label="W / L" value={`${selectedBucket.wins} / ${selectedBucket.losses}`} />
              <Stat label="Discipline" value={selectedBucket.discipline != null ? selectedBucket.discipline.toFixed(1) : "—"} />
            </div>
            <ul className="divide-y divide-border/60">
              {selectedBucket.ids.map((id) => {
                const e = entries.find((x) => x.id === id);
                if (!e) return null;
                return (
                  <li key={id}>
                    <Link
                      to="/journal/$entryId"
                      params={{ entryId: id }}
                      className="flex items-center justify-between gap-2 py-2 text-xs hover:text-primary"
                    >
                      <span className="truncate">{e.symbol ?? "Untitled"}</span>
                      <span className={cn("tabular-nums", Number(e.pnl ?? 0) >= 0 ? "text-success" : "text-danger")}>
                        {formatCurrency(Number(e.pnl ?? 0))}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </GlassCard>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 p-2">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import type { JournalEntry } from "@/lib/journal/api";
import { formatCurrency, tradeResult } from "@/lib/journal/format";
import { cn } from "@/lib/utils";

export function CalendarView({
  entries,
  onDayClick,
}: {
  entries: JournalEntry[];
  onDayClick: (dateKey: string, ids: string[]) => void;
}) {
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  const byDay = useMemo(() => {
    const map = new Map<string, { ids: string[]; pnl: number; wins: number; losses: number; be: number }>();
    entries.forEach((e) => {
      const iso = e.closed_at ?? e.created_at;
      if (!iso) return;
      const d = new Date(iso);
      const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
      const bucket = map.get(key) ?? { ids: [], pnl: 0, wins: 0, losses: 0, be: 0 };
      bucket.ids.push(e.id);
      const pnl = Number(e.pnl ?? 0);
      bucket.pnl += pnl;
      const r = tradeResult(pnl);
      if (r === "win") bucket.wins += 1;
      else if (r === "loss") bucket.losses += 1;
      else bucket.be += 1;
      map.set(key, bucket);
    });
    return map;
  }, [entries]);

  const monthLabel = cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();

  const maxAbs = useMemo(() => {
    let m = 0;
    byDay.forEach((v) => (m = Math.max(m, Math.abs(v.pnl))));
    return m || 1;
  }, [byDay]);

  const goto = (delta: number) => {
    const d = new Date(cursor);
    d.setMonth(d.getMonth() + delta);
    setCursor(d);
  };

  return (
    <GlassCard className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{monthLabel}</h3>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => goto(-1)} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8" onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}>
            Today
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => goto(1)} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="py-1">{d}</div>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1.5">
        {Array.from({ length: startPad }).map((_, i) => (
          <div key={`pad-${i}`} className="aspect-square rounded-lg bg-transparent" />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const key = `${cursor.getFullYear()}-${cursor.getMonth() + 1}-${day}`;
          const bucket = byDay.get(key);
          const isToday = day === today.getDate() && cursor.getMonth() === today.getMonth() && cursor.getFullYear() === today.getFullYear();
          const intensity = bucket ? Math.min(1, Math.abs(bucket.pnl) / maxAbs) : 0;
          const win = bucket && bucket.pnl > 0;
          const loss = bucket && bucket.pnl < 0;
          return (
            <button
              key={day}
              onClick={() => bucket && onDayClick(key, bucket.ids)}
              className={cn(
                "group relative aspect-square rounded-lg border border-border/60 p-1.5 text-left text-xs transition",
                "hover:border-primary/50",
                isToday && "ring-1 ring-primary",
              )}
              style={{
                background: bucket
                  ? win
                    ? `rgba(16,185,129,${0.08 + intensity * 0.4})`
                    : loss
                      ? `rgba(244,63,94,${0.08 + intensity * 0.4})`
                      : "rgba(148,163,184,0.06)"
                  : undefined,
              }}
              aria-label={`Day ${day}${bucket ? `, ${bucket.ids.length} trade${bucket.ids.length === 1 ? "" : "s"}` : ""}`}
              disabled={!bucket}
            >
              <span className={cn("text-[11px] font-semibold", bucket ? "text-foreground" : "text-muted-foreground")}>{day}</span>
              {bucket ? (
                <div className="mt-1 space-y-0.5">
                  <p className={cn("truncate font-mono text-[10px] tabular-nums", win ? "text-success" : loss ? "text-danger" : "text-muted-foreground")}>
                    {formatCurrency(bucket.pnl)}
                  </p>
                  <p className="truncate text-[9px] text-muted-foreground">
                    {bucket.wins}W · {bucket.losses}L
                  </p>
                </div>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-success/60" /> Winning day</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-danger/60" /> Losing day</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-muted-foreground/40" /> Break even</span>
      </div>
    </GlassCard>
  );
}

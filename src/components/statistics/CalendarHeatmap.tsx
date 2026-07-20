import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useStatistics } from "./context";
import { calendarByDay } from "@/lib/statistics/calculations";
import { fmtCurrency } from "@/lib/statistics/format";
import { cn } from "@/lib/utils";

export function CalendarHeatmap() {
  const { filtered } = useStatistics();
  const [cursor, setCursor] = useState(() => {
    const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d;
  });

  const map = useMemo(() => calendarByDay(filtered), [filtered]);
  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const firstDay = new Date(cursor);
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const startOffset = (firstDay.getDay() + 6) % 7; // Monday start
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
  while (cells.length % 7 !== 0) cells.push(null);

  const days = ["Mo","Tu","We","Th","Fr","Sa","Su"];
  const monthKey = (d: Date) => d.toISOString().slice(0,10);

  const maxAbs = useMemo(() => {
    let m = 0;
    for (const c of cells) {
      if (!c) continue;
      const v = map.get(monthKey(c))?.pnl ?? 0;
      if (Math.abs(v) > m) m = Math.abs(v);
    }
    return m || 1;
  }, [cells, map]);

  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Trading calendar</div>
          <div className="text-lg font-bold">{monthLabel}</div>
        </div>
        <div className="flex gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Previous month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" className="h-8" onClick={() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); setCursor(d); }}>Today</Button>
          <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Next month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {days.map((d) => <div key={d} className="text-[10px] uppercase text-center text-muted-foreground">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c, i) => {
          if (!c) return <div key={i} className="aspect-square" />;
          const entry = map.get(monthKey(c));
          const pnl = entry?.pnl ?? 0;
          const intensity = Math.min(1, Math.abs(pnl) / maxAbs);
          const bg = !entry
            ? "bg-muted/20"
            : pnl > 0
              ? `bg-emerald-500/[${Math.max(0.15, intensity).toFixed(2)}]`
              : pnl < 0
                ? `bg-rose-500/[${Math.max(0.15, intensity).toFixed(2)}]`
                : "bg-muted/30";
          const inline = entry
            ? { backgroundColor: pnl > 0 ? `rgba(16, 185, 129, ${0.15 + intensity * 0.55})` : pnl < 0 ? `rgba(244, 63, 94, ${0.15 + intensity * 0.55})` : undefined }
            : {};
          return (
            <Popover key={i}>
              <PopoverTrigger asChild>
                <button
                  style={inline}
                  className={cn(
                    "aspect-square rounded-lg text-[10px] font-medium relative group border border-border/30 transition hover:scale-105",
                    !entry && bg,
                    entry && pnl === 0 && "bg-muted/30",
                  )}
                >
                  <span className="absolute top-1 left-1 text-muted-foreground">{c.getDate()}</span>
                  {entry ? (
                    <span className={cn("absolute bottom-1 right-1 tabular-nums text-[9px]", pnl > 0 ? "text-emerald-200" : pnl < 0 ? "text-rose-200" : "")}>
                      {pnl >= 0 ? "+" : ""}{Math.round(pnl)}
                    </span>
                  ) : null}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-56 pointer-events-auto">
                <div className="text-xs font-semibold">{c.toLocaleDateString(undefined, { dateStyle: "medium" })}</div>
                {entry ? (
                  <div className="mt-2 space-y-1 text-xs">
                    <Row k="Net P&L" v={fmtCurrency(entry.pnl)} tone={entry.pnl >= 0 ? "up" : "down"} />
                    <Row k="Trades" v={String(entry.trades)} />
                    <Row k="Wins" v={String(entry.wins)} />
                    <Row k="Losses" v={String(entry.losses)} />
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-muted-foreground">No trades this day.</div>
                )}
              </PopoverContent>
            </Popover>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-emerald-500/60" /> Winning day</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-rose-500/60" /> Losing day</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-muted/40 border border-border/40" /> No trades</span>
      </div>
    </GlassCard>
  );
}

function Row({ k, v, tone }: { k: string; v: string; tone?: "up" | "down" }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{k}</span>
      <span className={cn("font-semibold tabular-nums", tone === "up" && "text-emerald-400", tone === "down" && "text-rose-400")}>{v}</span>
    </div>
  );
}

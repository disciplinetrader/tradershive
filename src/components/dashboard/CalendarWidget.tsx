import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Deterministic demo dataset — will be replaced with real activity later
const TRADED_DAYS = new Set([3, 4, 5, 8, 10, 11, 12, 15, 16, 17, 18, 22, 25, 26]);
const CHALLENGE_DAYS = new Set([2, 6, 9, 13, 20, 23]);
const COMPLETED_DAYS = new Set([3, 5, 8, 10, 15, 17, 22]);

export function CalendarWidget() {
  const [cursor, setCursor] = useState(() => new Date());
  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const today = new Date();

  const { days, start } = useMemo(() => {
    const first = new Date(y, m, 1);
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const start = (first.getDay() + 6) % 7; // Monday-first
    return { days: Array.from({ length: daysInMonth }, (_, i) => i + 1), start };
  }, [y, m]);

  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-medium">{monthLabel}</div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setCursor(new Date(y, m - 1, 1))} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setCursor(new Date(y, m + 1, 1))} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground">
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
          <div key={d} className="py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: start }).map((_, i) => (
          <div key={`sp-${i}`} />
        ))}
        {days.map((d) => {
          const isToday = today.getFullYear() === y && today.getMonth() === m && today.getDate() === d;
          const traded = TRADED_DAYS.has(d);
          const challenge = CHALLENGE_DAYS.has(d);
          const completed = COMPLETED_DAYS.has(d);
          return (
            <div
              key={d}
              className={cn(
                "relative grid h-9 place-items-center rounded-lg text-xs font-medium",
                isToday && "bg-primary text-primary-foreground",
                !isToday && traded && "bg-primary/10 text-primary",
                !isToday && !traded && "text-muted-foreground",
              )}
              aria-label={`Day ${d}${traded ? " traded" : ""}${challenge ? " challenge" : ""}`}
            >
              {d}
              {(challenge || completed) && !isToday ? (
                <span className="pointer-events-none absolute bottom-1 flex items-center gap-0.5">
                  {challenge ? <span className="h-1 w-1 rounded-full bg-info" /> : null}
                  {completed ? <span className="h-1 w-1 rounded-full bg-warning" /> : null}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary/60" /> Traded</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-info" /> Challenge</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-warning" /> Completed</span>
      </div>
    </div>
  );
}

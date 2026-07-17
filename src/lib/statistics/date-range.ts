import type { DatePreset } from "./types";

export interface DateRange {
  from: Date | null;
  to: Date | null;
  label: string;
}

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d: Date) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function startOfWeek(d: Date) {
  const x = startOfDay(d);
  const day = x.getDay(); // 0..6 Sun..Sat
  const diff = (day + 6) % 7; // Monday as start
  x.setDate(x.getDate() - diff);
  return x;
}
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

export function resolveDateRange(preset: DatePreset, from?: string | null, to?: string | null): DateRange {
  const now = new Date();
  switch (preset) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now), label: "Today" };
    case "yesterday": {
      const y = addDays(now, -1);
      return { from: startOfDay(y), to: endOfDay(y), label: "Yesterday" };
    }
    case "this_week":
      return { from: startOfWeek(now), to: endOfDay(now), label: "This week" };
    case "last_week": {
      const s = addDays(startOfWeek(now), -7);
      return { from: s, to: endOfDay(addDays(s, 6)), label: "Last week" };
    }
    case "this_month":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfDay(now), label: "This month" };
    case "last_month": {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { from: s, to: e, label: "Last month" };
    }
    case "this_year":
      return { from: new Date(now.getFullYear(), 0, 1), to: endOfDay(now), label: "This year" };
    case "last_year":
      return {
        from: new Date(now.getFullYear() - 1, 0, 1),
        to: new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999),
        label: "Last year",
      };
    case "custom":
      return {
        from: from ? new Date(from) : null,
        to: to ? new Date(to) : null,
        label: "Custom",
      };
    case "all_time":
    default:
      return { from: null, to: null, label: "All time" };
  }
}

export function previousPeriodRange(range: DateRange): DateRange | null {
  if (!range.from || !range.to) return null;
  const span = range.to.getTime() - range.from.getTime();
  const prevTo = new Date(range.from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - span);
  return { from: prevFrom, to: prevTo, label: "Previous period" };
}

export const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This week" },
  { value: "last_week", label: "Last week" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "this_year", label: "This year" },
  { value: "last_year", label: "Last year" },
  { value: "all_time", label: "All time" },
  { value: "custom", label: "Custom range" },
];

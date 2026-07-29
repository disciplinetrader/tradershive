import { TIMEZONES } from "./constants";

export type TimezoneOption = {
  value: string;
  label: string;
  offsetMinutes: number;
  offsetLabel: string;
  search: string;
};

function offsetForZone(tz: string, now = new Date()): number {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const parts = dtf.formatToParts(now).reduce<Record<string, string>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});
    const asUTC = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour === "24" ? "0" : parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    return Math.round((asUTC - now.getTime()) / 60000);
  } catch {
    return 0;
  }
}

function formatOffset(minutes: number): string {
  const sign = minutes >= 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m === 0 ? `UTC${sign}${h}` : `UTC${sign}${h}:${String(m).padStart(2, "0")}`;
}

let cache: TimezoneOption[] | null = null;

export function getTimezoneOptions(): TimezoneOption[] {
  if (cache) return cache;
  const now = new Date();
  cache = TIMEZONES.map((tz) => {
    const off = offsetForZone(tz, now);
    const offsetLabel = formatOffset(off);
    const city = tz.split("/").slice(1).join(" / ").replace(/_/g, " ");
    return {
      value: tz,
      label: `${tz.replace(/_/g, " ")} (${offsetLabel})`,
      offsetMinutes: off,
      offsetLabel,
      search: `${tz} ${city} ${offsetLabel}`.toLowerCase(),
    };
  }).sort((a, b) => a.offsetMinutes - b.offsetMinutes || a.value.localeCompare(b.value));
  return cache;
}

export function detectTimezone(): string {
  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if ((TIMEZONES as readonly string[]).includes(detected)) return detected;
  } catch {
    /* ignore */
  }
  return "UTC";
}

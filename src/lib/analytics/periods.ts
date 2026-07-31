/**
 * Timezone-aware period + session classification.
 *
 * Every bucket boundary in analytics is computed here, in the user's
 * configured IANA timezone — never with browser-local time (§11).
 */

export type Resolution = "trade" | "daily" | "weekly" | "monthly";

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;   // 1-31
  hour: number;  // 0-23
  minute: number;
  /** 0 = Sunday … 6 = Saturday, in the target timezone. */
  weekday: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timezone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    });
    formatterCache.set(timezone, f);
  }
  return f;
}

/** Decompose an epoch-ms instant into calendar parts inside `timezone`. */
export function zonedParts(epochMs: number, timezone: string): ZonedParts {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = formatterFor(timezone).formatToParts(new Date(epochMs));
  } catch {
    parts = formatterFor("UTC").formatToParts(new Date(epochMs));
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = Number(get("hour"));
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    // Intl emits "24" for midnight in hour12:false on some engines.
    hour: hour === 24 ? 0 : hour,
    minute: Number(get("minute")),
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 0,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** `YYYY-MM-DD` in the target timezone. */
export function dayKey(epochMs: number, timezone: string): string {
  const p = zonedParts(epochMs, timezone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** `YYYY-MM` in the target timezone. */
export function monthKey(epochMs: number, timezone: string): string {
  const p = zonedParts(epochMs, timezone);
  return `${p.year}-${pad(p.month)}`;
}

/** Quarter key `YYYY-Qn`. */
export function quarterKey(epochMs: number, timezone: string): string {
  const p = zonedParts(epochMs, timezone);
  return `${p.year}-Q${Math.floor((p.month - 1) / 3) + 1}`;
}

/**
 * ISO-ish week key anchored on Monday, computed from the zoned civil date so
 * the boundary follows the user's timezone rather than UTC.
 */
export function weekKey(epochMs: number, timezone: string): string {
  const p = zonedParts(epochMs, timezone);
  // Treat the civil date as a UTC instant purely for weekday arithmetic.
  const civil = Date.UTC(p.year, p.month - 1, p.day);
  const dow = (p.weekday + 6) % 7; // Monday = 0
  const monday = new Date(civil - dow * 86_400_000);
  return `${monday.getUTCFullYear()}-${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}`;
}

export function periodKey(epochMs: number, timezone: string, resolution: Resolution): string {
  switch (resolution) {
    case "daily": return dayKey(epochMs, timezone);
    case "weekly": return weekKey(epochMs, timezone);
    case "monthly": return monthKey(epochMs, timezone);
    default: return String(epochMs);
  }
}

export const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export function weekdayLabel(epochMs: number, timezone: string): string {
  return WEEKDAY_LABELS[zonedParts(epochMs, timezone).weekday];
}

// ── Sessions ────────────────────────────────────────────────────────────────

export interface SessionWindow {
  id: string;
  label: string;
  /** Inclusive start hour, exclusive end hour, expressed in UTC. */
  startUtcHour: number;
  endUtcHour: number;
}

/** Default FX session map, expressed in UTC so DST in the user tz cannot skew it. */
export const DEFAULT_SESSIONS: SessionWindow[] = [
  { id: "asia", label: "Asia", startUtcHour: 0, endUtcHour: 8 },
  { id: "london", label: "London", startUtcHour: 8, endUtcHour: 13 },
  { id: "newyork", label: "New York", startUtcHour: 13, endUtcHour: 21 },
  { id: "sydney", label: "Sydney", startUtcHour: 21, endUtcHour: 24 },
];

function utcHour(epochMs: number): number {
  return new Date(epochMs).getUTCHours();
}

/**
 * Classify an instant into a session window. Windows are UTC-anchored; a
 * wrapping window (start > end) is handled explicitly.
 */
export function classifySession(
  epochMs: number,
  windows: SessionWindow[] = DEFAULT_SESSIONS,
): SessionWindow | null {
  const h = utcHour(epochMs);
  for (const w of windows) {
    if (w.startUtcHour <= w.endUtcHour) {
      if (h >= w.startUtcHour && h < w.endUtcHour) return w;
    } else if (h >= w.startUtcHour || h < w.endUtcHour) {
      return w;
    }
  }
  return null;
}

/** Hour of day (0–23) in the user's timezone — used by the time heatmap. */
export function hourOfDay(epochMs: number, timezone: string): number {
  return zonedParts(epochMs, timezone).hour;
}

/** The browser's timezone, falling back to UTC on locked-down runtimes. */
export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

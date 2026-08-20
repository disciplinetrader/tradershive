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

// ── Time bands ──────────────────────────────────────────────────────────────
//
// NOT market sessions. Renamed from `SessionWindow` / `DEFAULT_SESSIONS` /
// `classifySession` on 2026-08-20 (MS-2).
//
// ── What these are, and why they stay UTC-anchored ─────────────────────────
//
// A time band is a fixed slice of the UTC day. The set below partitions the
// day completely: every instant lands in exactly one band, there is no null,
// no overlap and no "closed". That is the point — a band is an analytical
// bucket for comparing like with like over time, and a boundary that moved
// twice a year would make year-over-year comparison meaningless.
//
// A market SESSION is a different thing: it is when a trading centre is
// actually open, which moves against UTC with that centre's own DST and does
// not exist at all on weekends. That lives in `@/lib/market-sessions` and is
// the only thing allowed to answer "which session was this trade in".
//
// ── Why the rename, specifically ───────────────────────────────────────────
//
// These two were both called "session", shared the shape `{ id, label }`, and
// two of their four ids happened to collide (`london`, `sydney`) while two did
// not (`asia` vs `tokyo`, `newyork` vs `new_york`). Analytics fell back from
// one to the other inside a single `groupBy` and a single `includes`, so the
// same session appeared twice in a cohort table and in the filter dropdown —
// and picking one option silently excluded the trades spelled the other way.
//
// The ids below are now deliberately unmistakable. `utc_13_21` cannot be
// confused with `new_york` by a reader or by a string comparison, which is the
// property that makes the old bug impossible rather than merely absent.
//
// **Nothing consumes time bands today.** They were only ever reached as the
// session fallback, and that fallback is gone. Kept deliberately: the model is
// sound for its own purpose, and deleting it would re-open a settled question
// the next time someone wants time-of-day cohorts.

export type TimeBandId = "utc_0_8" | "utc_8_13" | "utc_13_21" | "utc_21_24";

export interface TimeBand {
  id: TimeBandId;
  label: string;
  /** Inclusive start hour, exclusive end hour, expressed in UTC. */
  startUtcHour: number;
  endUtcHour: number;
}

/**
 * The default UTC day partition.
 *
 * Labels name the region whose activity dominates each band. They are
 * descriptive, NOT session hours — `utc_8_13` is "the band London dominates",
 * not "London's session", which on any given date starts at 07:00 or 08:00 UTC
 * depending on British Summer Time.
 */
export const DEFAULT_TIME_BANDS: TimeBand[] = [
  { id: "utc_0_8", label: "Asia hours (00–08 UTC)", startUtcHour: 0, endUtcHour: 8 },
  { id: "utc_8_13", label: "London hours (08–13 UTC)", startUtcHour: 8, endUtcHour: 13 },
  { id: "utc_13_21", label: "New York hours (13–21 UTC)", startUtcHour: 13, endUtcHour: 21 },
  { id: "utc_21_24", label: "Sydney hours (21–24 UTC)", startUtcHour: 21, endUtcHour: 24 },
];

function utcHour(epochMs: number): number {
  return new Date(epochMs).getUTCHours();
}

/**
 * Classify an instant into a time band. Bands are UTC-anchored; a wrapping
 * band (start > end) is handled explicitly.
 *
 * This does NOT answer "which market session was open" — ask
 * `sessionAt` from `@/lib/market-sessions` for that.
 */
export function classifyTimeBand(
  epochMs: number,
  windows: TimeBand[] = DEFAULT_TIME_BANDS,
): TimeBand | null {
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

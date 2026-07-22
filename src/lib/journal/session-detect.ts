/**
 * Journal V2 — Trading session detector.
 *
 * Given a UTC timestamp we determine which major FX session was active.
 * Sessions are defined in UTC and mapped to the enum values used by the
 * `journal_session` DB type.
 */

export type SessionValue =
  | "sydney"
  | "tokyo"
  | "asia"
  | "london"
  | "london_ny_overlap"
  | "new_york"
  | "custom";

type Window = { value: SessionValue; startHourUtc: number; endHourUtc: number };

// End is exclusive. Overnight ranges wrap.
const WINDOWS: Window[] = [
  { value: "sydney", startHourUtc: 22, endHourUtc: 7 },
  { value: "tokyo", startHourUtc: 0, endHourUtc: 9 },
  { value: "asia", startHourUtc: 0, endHourUtc: 8 },
  { value: "london", startHourUtc: 7, endHourUtc: 16 },
  { value: "london_ny_overlap", startHourUtc: 12, endHourUtc: 16 },
  { value: "new_york", startHourUtc: 12, endHourUtc: 21 },
];

function inWindow(hour: number, w: Window): boolean {
  if (w.startHourUtc < w.endHourUtc) return hour >= w.startHourUtc && hour < w.endHourUtc;
  return hour >= w.startHourUtc || hour < w.endHourUtc;
}

/**
 * Pick the most specific session for a given open time. Overlap wins over
 * London/NY individually because it is the highest-liquidity window.
 */
export function detectSession(openedAt: Date | string | null | undefined): SessionValue | null {
  if (!openedAt) return null;
  const date = typeof openedAt === "string" ? new Date(openedAt) : openedAt;
  if (Number.isNaN(date.getTime())) return null;
  const h = date.getUTCHours();

  // Priority: overlap > NY > London > Tokyo > Asia > Sydney.
  const priority: SessionValue[] = ["london_ny_overlap", "new_york", "london", "tokyo", "asia", "sydney"];
  for (const value of priority) {
    const w = WINDOWS.find((x) => x.value === value)!;
    if (inWindow(h, w)) return value;
  }
  return null;
}

/** Guess the browser's IANA timezone; falls back to UTC when unavailable. */
export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

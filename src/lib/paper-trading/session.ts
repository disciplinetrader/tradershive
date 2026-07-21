/**
 * FX/global session detection. Identifies which major session(s) are
 * active at a given instant using primary UTC hour windows and detects
 * overlaps (London/NY is by far the most-traded overlap).
 */

export type SessionKey = "sydney" | "tokyo" | "london" | "new_york";

const WINDOWS: Record<SessionKey, [number, number]> = {
  sydney:   [21, 6],   // 21:00 → 06:00 UTC (wraps midnight)
  tokyo:    [0,  9],
  london:   [7,  16],
  new_york: [12, 21],
};

const LABELS: Record<SessionKey, string> = {
  sydney: "Sydney",
  tokyo: "Tokyo",
  london: "London",
  new_york: "New York",
};

function inWindow(h: number, [start, end]: [number, number]): boolean {
  if (start <= end) return h >= start && h < end;
  return h >= start || h < end; // wraps midnight
}

export function activeSessions(date: Date | string | number = new Date()): SessionKey[] {
  const d = typeof date === "object" ? date : new Date(date);
  const h = d.getUTCHours();
  return (Object.entries(WINDOWS) as [SessionKey, [number, number]][])
    .filter(([, w]) => inWindow(h, w))
    .map(([k]) => k);
}

export type SessionInfo = {
  primary: SessionKey | "off_hours";
  active: SessionKey[];
  overlap: boolean;
  label: string;
};

export function detectSession(date: Date | string | number = new Date()): SessionInfo {
  const active = activeSessions(date);
  if (active.length === 0) {
    return { primary: "off_hours", active, overlap: false, label: "Off-hours" };
  }
  // Prefer New York, then London, then Tokyo, then Sydney as "primary".
  const priority: SessionKey[] = ["new_york", "london", "tokyo", "sydney"];
  const primary = priority.find((k) => active.includes(k)) ?? active[0];
  const overlap = active.length >= 2;
  const label = overlap
    ? `${active.map((k) => LABELS[k]).join(" × ")} overlap`
    : LABELS[primary];
  return { primary, active, overlap, label };
}

export const SESSION_LABEL = LABELS;

/**
 * Trading sessions — Phase 2.
 *
 * Configurable session windows in UTC. Instruments advertise which sessions
 * they trade in; the engine consults `isMarketOpen()` before opening
 * positions unless the broker profile allows extended-hours execution.
 *
 * This module has no external dependencies and is safe to run in tests.
 */

import type { SessionId } from "./instruments";

export type SessionWindow = {
  id: SessionId;
  label: string;
  /** UTC hour (0-23) when the session opens on each active day. */
  openHourUTC: number;
  /** UTC hour when the session closes; if <= open, wraps past midnight. */
  closeHourUTC: number;
  /** ISO day-of-week active list (0 = Sunday .. 6 = Saturday). */
  activeDays: number[];
  /** True if this session runs continuously (crypto). */
  is247?: boolean;
};

export const SESSIONS: Record<SessionId, SessionWindow> = {
  sydney:      { id: "sydney",     label: "Sydney",     openHourUTC: 21, closeHourUTC:  6, activeDays: [0,1,2,3,4] },
  tokyo:       { id: "tokyo",      label: "Tokyo",      openHourUTC:  0, closeHourUTC:  9, activeDays: [1,2,3,4,5] },
  london:      { id: "london",     label: "London",     openHourUTC:  7, closeHourUTC: 16, activeDays: [1,2,3,4,5] },
  new_york:    { id: "new_york",   label: "New York",   openHourUTC: 12, closeHourUTC: 21, activeDays: [1,2,3,4,5] },
  us_equities: { id: "us_equities",label: "US Equities",openHourUTC: 13, closeHourUTC: 20, activeDays: [1,2,3,4,5] },
  eu_equities: { id: "eu_equities",label: "EU Equities",openHourUTC:  7, closeHourUTC: 15, activeDays: [1,2,3,4,5] },
  asia_equities:{ id:"asia_equities",label:"Asia Equities",openHourUTC:0,closeHourUTC:  6, activeDays: [1,2,3,4,5] },
  cme_globex:  { id: "cme_globex", label: "CME Globex", openHourUTC: 22, closeHourUTC: 21, activeDays: [0,1,2,3,4] },
  ice:         { id: "ice",        label: "ICE",        openHourUTC: 22, closeHourUTC: 21, activeDays: [0,1,2,3,4] },
  lme:         { id: "lme",        label: "LME",        openHourUTC:  1, closeHourUTC: 19, activeDays: [1,2,3,4,5] },
  crypto_247:  { id: "crypto_247", label: "24/7",       openHourUTC:  0, closeHourUTC: 24, activeDays: [0,1,2,3,4,5,6], is247: true },
};

/** Broker/exchange holidays. Keyed by exchange or market id → ISO dates. */
export const HOLIDAYS: Record<string, string[]> = {
  NASDAQ:  ["2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25"],
  NYSE:    ["2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25"],
  CME:     ["2026-01-01", "2026-12-25"],
  OTC:     [],
  Crypto:  [],
  CFD:     ["2026-01-01", "2026-12-25"],
};

function inWindow(window: SessionWindow, at: Date): boolean {
  if (window.is247) return true;
  const day = at.getUTCDay();
  const hour = at.getUTCHours() + at.getUTCMinutes() / 60;
  const wrap = window.closeHourUTC <= window.openHourUTC;
  const dayMatch = window.activeDays.includes(day);
  const prevDayMatch = window.activeDays.includes((day + 6) % 7);
  if (wrap) {
    if (dayMatch && hour >= window.openHourUTC) return true;
    if (prevDayMatch && hour < window.closeHourUTC) return true;
    return false;
  }
  return dayMatch && hour >= window.openHourUTC && hour < window.closeHourUTC;
}

export function isSessionOpen(id: SessionId, at: Date = new Date()): boolean {
  return inWindow(SESSIONS[id], at);
}

export function isMarketOpen(sessions: SessionId[], exchange: string, at: Date = new Date()): boolean {
  const iso = at.toISOString().slice(0, 10);
  if ((HOLIDAYS[exchange] ?? []).includes(iso)) return false;
  return sessions.some((s) => isSessionOpen(s, at));
}

export function nextSessionOpen(sessions: SessionId[], from: Date = new Date()): Date | null {
  for (let i = 0; i < 24 * 8; i++) {
    const probe = new Date(from.getTime() + i * 3600_000);
    if (sessions.some((s) => isSessionOpen(s, probe))) return probe;
  }
  return null;
}

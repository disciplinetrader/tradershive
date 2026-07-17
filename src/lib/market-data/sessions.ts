import type { SessionWindow } from "./types";

export const DEFAULT_SESSIONS: SessionWindow[] = [
  { code: "sydney",  name: "Sydney",   market: "forex", openUtcMinute: 22*60, closeUtcMinute: 7*60,  weekdays: [0,1,2,3,4], color: "#22c55e" },
  { code: "tokyo",   name: "Tokyo",    market: "forex", openUtcMinute: 0,     closeUtcMinute: 9*60,  weekdays: [1,2,3,4,5], color: "#3b82f6" },
  { code: "london",  name: "London",   market: "forex", openUtcMinute: 7*60,  closeUtcMinute: 16*60, weekdays: [1,2,3,4,5], color: "#a855f7" },
  { code: "newyork", name: "New York", market: "forex", openUtcMinute: 12*60, closeUtcMinute: 21*60, weekdays: [1,2,3,4,5], color: "#ef4444" },
];

function inWindow(nowMinuteUtc: number, weekday: number, s: SessionWindow): boolean {
  if (!s.weekdays.includes(weekday)) return false;
  const { openUtcMinute: o, closeUtcMinute: c } = s;
  if (o < c) return nowMinuteUtc >= o && nowMinuteUtc < c;
  // Wrap past midnight
  return nowMinuteUtc >= o || nowMinuteUtc < c;
}

export function getActiveSessions(now: Date = new Date(), sessions = DEFAULT_SESSIONS): SessionWindow[] {
  const m = now.getUTCHours() * 60 + now.getUTCMinutes();
  const wd = now.getUTCDay();
  return sessions.filter((s) => inWindow(m, wd, s));
}

export function getNextSession(now: Date = new Date(), sessions = DEFAULT_SESSIONS): { session: SessionWindow; opensInMinutes: number } | null {
  const m = now.getUTCHours() * 60 + now.getUTCMinutes();
  const wd = now.getUTCDay();
  let best: { session: SessionWindow; opensInMinutes: number } | null = null;
  for (const s of sessions) {
    // Compute minutes until next open for today or the next matching weekday
    for (let d = 0; d < 7; d++) {
      const day = (wd + d) % 7;
      if (!s.weekdays.includes(day)) continue;
      const startMin = d * 1440 + s.openUtcMinute;
      const delta = startMin - m;
      if (delta <= 0) continue;
      if (!best || delta < best.opensInMinutes) best = { session: s, opensInMinutes: delta };
      break;
    }
  }
  return best;
}

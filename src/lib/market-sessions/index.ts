/**
 * The canonical FX session rule. One definition, five consumers.
 *
 * Before this module there were five, all disagreeing:
 *
 *   lib/statistics/session.ts      london 07-12 UTC, NY 12-21 UTC
 *   lib/journal/session-detect.ts  london 07-16 UTC, NY 12-21 UTC
 *   lib/paper-trading/session.ts   london 07-16 UTC, NY 12-21 UTC
 *   lib/replay/navigation.ts       opens at 07 and 12 UTC
 *   components/replay/ScenarioPicker.tsx  "NY opens 13:30 UTC"
 *
 * Every one of them hardcoded UTC hours, and every one of those hours is the
 * *summer* value. They are correct during BST/EDT and an hour wrong during
 * GMT/EST — silently, in stored analytics, for roughly five months a year.
 * Measured 2026-08-16: the defect was latent in the live journal only because
 * every entry in it was from northern summer.
 *
 * So sessions are defined here in the exchange's OWN local time and converted
 * per-timestamp through its IANA zone. That is the only formulation that stays
 * correct across a DST transition, and it is the only one that stays correct
 * when the transition *dates* differ — the EU, the US and Australia all switch
 * on different weekends, so for a few weeks each year no fixed UTC offset is
 * right for any of them.
 *
 * Mirrored in SQL by `public.detect_session()` for the journal draft trigger.
 * Both implementations are asserted against the same fixture in `./cases` —
 * see `scripts/check-session-parity.ts`. Change the rule in one place and the
 * gate fails; that is the whole reason two implementations are tolerable.
 */

export type SessionKey = "sydney" | "tokyo" | "london" | "new_york";
export type SessionLabel = SessionKey | "london_ny_overlap" | "off_hours";

/**
 * Local trading hours at each centre, in that centre's own wall clock.
 *
 * These are the FX session conventions, not equity exchange hours: the FX
 * market has no opening bell, and "the London session" means the hours London
 * desks are at them. `NY_EQUITIES_OPEN` below is the separate thing.
 */
export const SESSION_HOURS: Record<SessionKey, { zone: string; open: number; close: number }> = {
  sydney: { zone: "Australia/Sydney", open: 7, close: 16 },
  tokyo: { zone: "Asia/Tokyo", open: 9, close: 18 },
  london: { zone: "Europe/London", open: 8, close: 17 },
  new_york: { zone: "America/New_York", open: 8, close: 17 },
};

/**
 * The NYSE opening bell — 09:30 America/New_York.
 *
 * Deliberately separate from `SESSION_HOURS.new_york`. `ScenarioPicker` called
 * 13:30 UTC "the New York open" while `replay/navigation.ts` called 12:00 UTC
 * the same thing, 90 minutes apart in one product. Neither was wrong about its
 * own event: 12:00 UTC is 08:00 ET (the FX session) and 13:30 UTC is 09:30 ET
 * (the equities bell), both expressed in their summer offset. A product that
 * replays both EUR/USD and AAPL needs both anchors, named apart.
 */
export const NY_EQUITIES_OPEN = { zone: "America/New_York", hour: 9, minute: 30 } as const;

export const SESSION_LABELS: Record<SessionLabel, string> = {
  sydney: "Sydney",
  tokyo: "Tokyo",
  london: "London",
  new_york: "New York",
  london_ny_overlap: "London / New York overlap",
  off_hours: "Off-hours",
};

function toDate(at: Date | string | number): Date | null {
  const d = at instanceof Date ? at : new Date(at);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Minutes since local midnight at `zone`.
 *
 * `hourCycle: "h23"` rather than `hour12: false` — the latter renders midnight
 * as "24" in some ICU versions, which silently pushes every midnight timestamp
 * past every window.
 */
function minutesInZone(at: Date, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

/** Is this centre trading at this instant? */
export function isSessionOpen(key: SessionKey, at: Date | string | number): boolean {
  const d = toDate(at);
  if (!d) return false;
  const { zone, open, close } = SESSION_HOURS[key];
  const m = minutesInZone(d, zone);
  return m >= open * 60 && m < close * 60;
}

/**
 * The session label for an instant.
 *
 * Priority: overlap, then New York, London, Tokyo, Sydney. The overlap outranks
 * its own halves because it is the highest-liquidity window and is the answer a
 * trader means. Tokyo outranks Sydney, which is why Sydney only ever surfaces
 * between New York's close and Tokyo's open — a real but narrow window, not a
 * dead branch. This ordering matches the legacy rule exactly; only the hours
 * moved.
 */
export function sessionAt(at: Date | string | number | null | undefined): SessionLabel {
  const d = at == null ? null : toDate(at);
  if (!d) return "off_hours";

  const london = isSessionOpen("london", d);
  const newYork = isSessionOpen("new_york", d);
  if (london && newYork) return "london_ny_overlap";
  if (newYork) return "new_york";
  if (london) return "london";
  if (isSessionOpen("tokyo", d)) return "tokyo";
  if (isSessionOpen("sydney", d)) return "sydney";
  return "off_hours";
}

/** Every centre trading at this instant, for callers that want the overlap set. */
export function activeSessions(at: Date | string | number): SessionKey[] {
  return (Object.keys(SESSION_HOURS) as SessionKey[]).filter((k) => isSessionOpen(k, at));
}

/**
 * The UTC instant of a local wall-clock time at `zone`, DST-correct.
 *
 * Two-pass: guess by treating the wall time as UTC, measure the zone's offset
 * at that guess, correct, then measure again at the corrected instant. The
 * second pass is what handles a guess that lands on the wrong side of a
 * transition — without it, times in the hour after a spring-forward resolve an
 * hour out.
 */
function zonedWallTimeToUtc(
  year: number, month: number, day: number, hour: number, minute: number, zone: string,
): Date {
  const wall = Date.UTC(year, month, day, hour, minute);
  let utc = wall;
  for (let i = 0; i < 2; i++) {
    const seen = minutesInZone(new Date(utc), zone);
    const want = hour * 60 + minute;
    let delta = want - seen;
    // Wrap: reading 23:50 when we want 00:10 is +20 minutes, not -23h40m.
    if (delta > 720) delta -= 1440;
    if (delta < -720) delta += 1440;
    utc += delta * 60_000;
  }
  return new Date(utc);
}

/**
 * The next time `key` opens, at or after `from`.
 *
 * For Replay Studio's session jumps. Scans forward a day at a time because a
 * fixed offset cannot be added across a DST boundary — the wall-clock open is
 * the fixed point, not the UTC instant.
 */
export function nextSessionOpen(
  key: SessionKey, from: Date | string | number, maxDays = 8,
): Date | null {
  const start = toDate(from);
  if (!start) return null;
  const { zone, open } = SESSION_HOURS[key];

  for (let i = 0; i <= maxDays; i++) {
    const probe = new Date(start.getTime() + i * 86_400_000);
    // Read the calendar date AT THE ZONE, not UTC: near midnight the two differ,
    // and asking for "today's open" on the wrong date skips a day.
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(probe);
    const y = Number(parts.find((p) => p.type === "year")?.value);
    const mo = Number(parts.find((p) => p.type === "month")?.value);
    const da = Number(parts.find((p) => p.type === "day")?.value);

    const candidate = zonedWallTimeToUtc(y, mo - 1, da, open, 0, zone);
    if (candidate.getTime() >= start.getTime()) return candidate;
  }
  return null;
}

/** The next NYSE opening bell at or after `from`. */
export function nextEquitiesOpen(from: Date | string | number, maxDays = 8): Date | null {
  const start = toDate(from);
  if (!start) return null;
  for (let i = 0; i <= maxDays; i++) {
    const probe = new Date(start.getTime() + i * 86_400_000);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: NY_EQUITIES_OPEN.zone, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(probe);
    const y = Number(parts.find((p) => p.type === "year")?.value);
    const mo = Number(parts.find((p) => p.type === "month")?.value);
    const da = Number(parts.find((p) => p.type === "day")?.value);
    const candidate = zonedWallTimeToUtc(
      y, mo - 1, da, NY_EQUITIES_OPEN.hour, NY_EQUITIES_OPEN.minute, NY_EQUITIES_OPEN.zone,
    );
    if (candidate.getTime() >= start.getTime()) return candidate;
  }
  return null;
}

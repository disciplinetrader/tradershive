/**
 * Economic calendar — display formatting.
 *
 * Everything here is DISPLAY ONLY. `economic_events.event_time` is
 * `timestamptz` and every query in `./api` sends and receives UTC ISO strings;
 * nothing in this file may reach a query. Converting on the way in would put a
 * user in Tokyo and a user in Chicago on different rows for the same release.
 */

/**
 * The viewer's timezone abbreviation — "EDT", "GMT+5:30", "JST".
 *
 * There was no such helper anywhere in the codebase before this page, because
 * the only other consumer of calendar data draws chart markers positioned by
 * epoch and never prints a clock time.
 *
 * It matters here for one reason: an economic calendar is read to decide when
 * to be at the desk. "8:30 PM" with no zone is a number the reader has to
 * guess at, and the guess is wrong for everyone outside the writer's zone.
 * Intl resolves the abbreviation for the ACTUAL date passed, so a zone with
 * daylight saving reports EDT in July and EST in January rather than one
 * fixed label for both.
 */
export function timezoneAbbrev(timezone: string, atMs: number = Date.now()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "short",
    }).formatToParts(new Date(atMs));
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

/** Clock time in the viewer's zone, e.g. "8:30 PM". */
export function formatEventClock(epochMs: number, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(epochMs));
  } catch {
    return "";
  }
}

/** Day heading, e.g. "Mon Aug 24". */
export function formatDayHeading(epochMs: number, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(new Date(epochMs));
  } catch {
    return "";
  }
}

/**
 * A published figure, or an em-dash when there isn't one.
 *
 * Never collapses the field and never invents a value. `forecast` is null on
 * every Xoomar row by design — that provider publishes no consensus — and is
 * frequently an empty string on ForexFactory rows. Both must read as "no
 * value published", visibly distinct from a real zero, because "0.0%" and
 * "not released" are opposite facts about a release.
 */
export const NO_VALUE = "—";

export function formatValue(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  return s === "" ? NO_VALUE : s;
}

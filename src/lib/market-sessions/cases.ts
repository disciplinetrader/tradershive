/**
 * The shared session fixture — asserted against BOTH implementations.
 *
 * TypeScript (`./index.ts`) is checked by `__tests__/sessions.test.ts`; SQL
 * (`public.detect_session`) by `scripts/check-session-parity.ts`. Both run in
 * `bun run check`. A rule changed in one language and not the other fails the
 * gate here, which is the only reason having the rule twice is acceptable.
 *
 * Cases are chosen around transitions, not around convenient midday times.
 * The interesting dates in 2026:
 *
 *   2026-03-08  US springs forward   (EU has not yet — 3 weeks of mismatch)
 *   2026-03-29  EU springs forward
 *   2026-10-04  Australia springs forward (southern hemisphere, inverted)
 *   2026-10-25  EU falls back        (US has not yet — 1 week of mismatch)
 *   2026-11-01  US falls back
 *
 * The mismatch windows are the ones that break a fixed-offset implementation
 * that has otherwise been "fixed" for DST, so they carry the most weight.
 */
import type { SessionLabel } from "./index";

export type SessionCase = {
  /** UTC instant, always with an explicit Z. */
  at: string;
  expect: SessionLabel;
  why: string;
};

export const SESSION_CASES: SessionCase[] = [
  // ---- Deep winter: both London and New York on standard time --------------
  // London 08:00-17:00 UTC, New York 13:00-22:00 UTC.
  {
    at: "2026-01-15T07:30:00Z",
    expect: "tokyo",
    why: "07:30 UTC is 07:30 in London — before the 08:00 open. The legacy rule said london.",
  },
  {
    at: "2026-01-15T08:30:00Z",
    expect: "london",
    why: "London is open; New York does not start until 13:00 UTC in winter",
  },
  {
    at: "2026-01-15T12:30:00Z",
    expect: "london",
    why: "12:30 UTC is 07:30 ET — before New York opens. The legacy rule said overlap.",
  },
  {
    at: "2026-01-15T13:30:00Z",
    expect: "london_ny_overlap",
    why: "08:30 ET and 13:30 London — both open",
  },
  {
    at: "2026-01-15T16:30:00Z",
    expect: "london_ny_overlap",
    why: "16:30 UTC is 16:30 London, still open until 17:00. The legacy rule said new_york.",
  },
  {
    at: "2026-01-15T21:30:00Z",
    expect: "new_york",
    why: "16:30 ET, New York open until 17:00. The legacy rule returned NOTHING for this hour.",
  },
  {
    at: "2026-01-15T22:30:00Z",
    expect: "sydney",
    why: "New York has closed and Tokyo has not opened — the only window Sydney surfaces in",
  },
  {
    at: "2026-01-15T02:00:00Z",
    expect: "tokyo",
    why: "11:00 in Tokyo; Japan never observes DST, so this holds year-round",
  },

  // ---- Deep summer: both on daylight time ---------------------------------
  // London 07:00-16:00 UTC, New York 12:00-21:00 UTC — the values the legacy
  // rule hardcoded, which is why the defect never showed in the live data.
  {
    at: "2026-07-15T07:30:00Z",
    expect: "london",
    why: "08:30 BST — London open. Same answer as the legacy rule, by coincidence of season.",
  },
  {
    at: "2026-07-15T12:30:00Z",
    expect: "london_ny_overlap",
    why: "08:30 EDT and 13:30 BST — both open",
  },
  {
    at: "2026-07-15T21:30:00Z",
    expect: "sydney",
    why: "New York closed at 21:00 UTC in summer; Sydney is on AEST and open",
  },
  {
    at: "2026-07-15T02:00:00Z",
    expect: "tokyo",
    why: "11:00 in Tokyo — identical to the January case, proving Tokyo does not shift",
  },

  // ---- Mismatch window: EU back on GMT, US still on EDT -------------------
  // 2026-10-25 to 2026-11-01. London 08:00-17:00 UTC, New York 12:00-21:00 UTC.
  // No single fixed offset describes both, which is what makes this the case a
  // half-fixed implementation fails.
  {
    at: "2026-10-28T07:30:00Z",
    expect: "tokyo",
    why: "London is back on GMT and does not open until 08:00 UTC",
  },
  {
    at: "2026-10-28T12:30:00Z",
    expect: "london_ny_overlap",
    why: "08:30 EDT (still summer in the US) and 12:30 GMT — both open, unlike January",
  },
  {
    at: "2026-10-28T16:30:00Z",
    expect: "london_ny_overlap",
    why: "London open until 17:00 GMT, New York until 21:00 UTC",
  },
  {
    at: "2026-10-28T20:30:00Z",
    expect: "new_york",
    why: "16:30 EDT; London closed three hours ago",
  },

  // ---- Mismatch window: US on EDT, EU still on GMT ------------------------
  // 2026-03-08 to 2026-03-29. Same offsets as the October window, reached from
  // the other direction — a rule keyed on "is it summer" rather than on the
  // zones gets one of these two wrong.
  {
    at: "2026-03-10T12:30:00Z",
    expect: "london_ny_overlap",
    why: "US already on EDT (08:30 ET); UK still on GMT (12:30) — both open",
  },
  {
    at: "2026-03-10T07:30:00Z",
    expect: "tokyo",
    why: "UK still on GMT, so London opens at 08:00 UTC, not 07:00",
  },

  // ---- Southern-hemisphere DST, which runs the other way ------------------
  {
    at: "2026-01-15T21:00:00Z",
    expect: "new_york",
    why: "16:00 EST — New York still open, and it outranks Sydney",
  },
  {
    at: "2026-07-15T22:00:00Z",
    expect: "sydney",
    why: "08:00 AEST — Sydney open on southern-winter standard time",
  },
  {
    at: "2026-01-15T20:30:00Z",
    expect: "new_york",
    why: "Sydney is open on AEDT (07:30) but New York outranks it",
  },

  // ---- Exact boundaries: open is inclusive, close is exclusive ------------
  {
    at: "2026-07-15T07:00:00Z",
    expect: "london",
    why: "08:00 BST exactly — the open is inclusive",
  },
  {
    at: "2026-07-15T16:00:00Z",
    expect: "new_york",
    why: "17:00 BST exactly — London's close is exclusive, so only New York remains",
  },
];

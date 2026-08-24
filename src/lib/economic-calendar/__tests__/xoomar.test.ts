import { describe, it, expect } from "vitest";
import { parseCalendar, classify, normaliseImpact, toWindowDate } from "../xoomar.server";

/**
 * Parsing the Xoomar calendar feed.
 *
 * Every sample is a real record captured from the live endpoint on 2026-08-24.
 *
 * The load-bearing tests here are the look-ahead ones. This source mixes a
 * genuine release calendar with a macro time series whose `actual` is stamped
 * to the START of the period it describes — 31 to 41 days before that value
 * was published. The overlay these rows feed gates on
 * `event.timeMs <= marketTime`, so a period-start record does not surface
 * late, it surfaces a number the trader could not have known. That is the
 * defect the filter exists for, and it is asserted directly rather than
 * inferred from a row count.
 */

/** Family B — a genuine release. Published 2026-08-07, describing July. */
const RELEASE = {
  source: "bls",
  eventName: "Nonfarm Payrolls (Employment Situation)",
  importance: "high",
  scheduledAt: "2026-08-07T12:30:00.000Z",
  periodLabel: "July 2026",
  previous: "20.0000",
  forecast: null,
  actual: "-23.0000",
};

/** Family A — the same -23.0 value, stamped 37 days before it was published. */
const PERIOD_START = {
  source: "bls",
  eventName: "Nonfarm Payrolls (Change in Thousands)",
  importance: "high",
  scheduledAt: "2026-07-01T12:30:00.000Z",
  periodLabel: "2026-07",
  previous: "20.0000",
  forecast: null,
  actual: "-23.0000",
};

describe("classify — the look-ahead filter", () => {
  it("refuses a period-start record", () => {
    const v = classify("2026-07", "2026-07-01T12:30:00.000Z");
    expect(v.keep).toBe(false);
    expect(v.keep === false && v.reason).toMatch(/look-ahead/);
  });

  it("keeps a real release", () => {
    expect(classify("July 2026", "2026-08-07T12:30:00.000Z").keep).toBe(true);
    expect(classify("July 2026 meeting", "2026-07-29T18:00:00.000Z").keep).toBe(true);
    expect(classify("Q2 2026 Advance", "2026-07-30T12:30:00.000Z").keep).toBe(true);
  });

  it("refuses an UNRECOGNISED label rather than letting it through", () => {
    // The whole point of a whitelist: a format that does not exist yet must
    // fail closed, not sail through as if it were a release.
    const v = classify("H1 2026", "2026-07-15T12:30:00.000Z");
    expect(v.keep).toBe(false);
    expect(v.keep === false && v.reason).toMatch(/unrecognised/);
  });

  it("refuses an unlabelled record stamped day-1", () => {
    // Family A is always day-1 (36/36 measured); Family B never is (0/22).
    const v = classify(null, "2026-07-01T12:30:00.000Z");
    expect(v.keep).toBe(false);
  });

  it("keeps an unlabelled record that is not day-1", () => {
    // A real future release with no period label yet — measured 2026-08-26,
    // "GDP (Second Estimate) and Corporate Profits, 2nd Quarter 2026".
    expect(classify(null, "2026-08-26T12:30:00.000Z").keep).toBe(true);
  });

  it("refuses a release-shaped label contradicted by a day-1 stamp", () => {
    const v = classify("July 2026", "2026-07-01T12:30:00.000Z");
    expect(v.keep).toBe(false);
    expect(v.keep === false && v.reason).toMatch(/contradictory/);
  });
});

describe("parseCalendar — look-ahead never reaches a row", () => {
  it("drops the period-start twin and keeps the real release", () => {
    // Both records carry actual = -23.0. Only the one dated to the day it was
    // actually published may become a row.
    const { rows, filtered } = parseCalendar([RELEASE, PERIOD_START]);
    expect(rows).toHaveLength(1);
    expect(filtered).toBe(1);
    expect(rows[0].event_time).toBe("2026-08-07T12:30:00.000Z");
    expect(rows[0].actual).toBe("-23.0000");
  });

  it("counts filtered records instead of warning per line", () => {
    // A normal run refuses 36 of 58; per-line warnings would bury the ones
    // that need acting on.
    const { rows, warnings, filtered } = parseCalendar([PERIOD_START, PERIOD_START, PERIOD_START]);
    expect(rows).toHaveLength(0);
    expect(filtered).toBe(3);
    expect(warnings).toHaveLength(0);
  });
});

describe("parseCalendar — field mapping", () => {
  it("maps a release onto the row shape", () => {
    const { rows } = parseCalendar([RELEASE]);
    expect(rows[0]).toMatchObject({
      event_time: "2026-08-07T12:30:00.000Z",
      currency: "USD",
      title: "Nonfarm Payrolls (Employment Situation)",
      impact: "high",
      actual: "-23.0000",
      previous: "20.0000",
      source: "xoomar",
    });
  });

  it("leaves forecast null — this source does not carry one", () => {
    const { rows } = parseCalendar([RELEASE]);
    expect(rows[0].forecast).toBeNull();
  });

  it("picks up a forecast if the source ever starts sending one", () => {
    // The key is present on every record and null on all 58 measured. Read
    // defensively so it costs no code change to start working.
    const { rows } = parseCalendar([{ ...RELEASE, forecast: "85.0000" }]);
    expect(rows[0].forecast).toBe("85.0000");
  });

  it("keeps the original record in raw_payload", () => {
    const { rows } = parseCalendar([RELEASE]);
    expect(rows[0].raw_payload).toEqual(RELEASE);
  });

  it("SKIPS an unmapped source and warns, rather than defaulting to USD", () => {
    const { rows, warnings } = parseCalendar([{ ...RELEASE, source: "ecb" }]);
    expect(rows).toHaveLength(0);
    expect(warnings.join(" ")).toContain("ecb");
    expect(warnings.join(" ")).toMatch(/SOURCE_TO_CURRENCY/);
  });

  it("skips a record with an unparseable scheduledAt", () => {
    const { rows, warnings } = parseCalendar([{ ...RELEASE, scheduledAt: "not a date" }]);
    expect(rows).toHaveLength(0);
    expect(warnings.join(" ")).toMatch(/unusable scheduledAt/);
  });
});

describe("normaliseImpact", () => {
  it("expands the API's abbreviated medium", () => {
    // The payload says "med", the column's CHECK constraint says "medium".
    expect(normaliseImpact("med")).toBe("medium");
    expect(normaliseImpact("high")).toBe("high");
    expect(normaliseImpact("low")).toBe("low");
  });
});

describe("toWindowDate", () => {
  it("emits yyyy-MM-dd in UTC", () => {
    expect(toWindowDate(new Date("2026-08-07T12:30:00.000Z"))).toBe("2026-08-07");
    // 23:30Z is already tomorrow in Asia; the window must follow UTC, not the
    // host's local day.
    expect(toWindowDate(new Date("2026-08-07T23:30:00.000Z"))).toBe("2026-08-07");
  });
});

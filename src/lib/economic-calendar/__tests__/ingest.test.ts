import { describe, it, expect } from "vitest";
import { parseFeed } from "../ingest.server";

/**
 * Parsing the ForexFactory / faireconomy calendar feed.
 *
 * The overlay this feeds is gated on `event.timeMs <= marketTime`, so a
 * mis-parsed timestamp does not show a wrong marker — it shows a marker the
 * replay clock has not reached, which is a lookahead leak. That is why the
 * timezone case is asserted to the minute rather than "a date came out".
 *
 * The sample is a real row taken from the live feed on 2026-08-18.
 */

describe("parseFeed — timestamps", () => {
  it("converts the feed's local offset to UTC", () => {
    // 18:30 at -04:00 is 22:30 UTC the same day. Getting this wrong by the
    // offset would surface events up to four hours early.
    const rows = parseFeed([
      { title: "BusinessNZ Services Index", country: "NZD", date: "2026-08-16T18:30:00-04:00", impact: "Low", forecast: "", previous: "50.6" },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].event_time).toBe("2026-08-16T22:30:00.000Z");
    expect(rows[0].currency).toBe("NZD");
    expect(rows[0].title).toBe("BusinessNZ Services Index");
    expect(rows[0].impact).toBe("low");
    expect(rows[0].source).toBe("faireconomy");
  });

  it("crosses the day boundary correctly", () => {
    // 21:00 at -04:00 is 01:00 UTC the NEXT day — the case that puts an event
    // on the wrong calendar day, and therefore in the wrong replay session.
    const rows = parseFeed([
      { title: "Late release", country: "USD", date: "2026-08-16T21:00:00-04:00", impact: "High" },
    ]);
    expect(rows[0].event_time).toBe("2026-08-17T01:00:00.000Z");
  });
});

describe("parseFeed — impact", () => {
  const impactOf = (impact: string | undefined) =>
    parseFeed([{ title: "t", country: "USD", date: "2026-08-16T12:00:00Z", impact }])[0]?.impact;

  it("maps the feed's labels onto our four levels", () => {
    expect(impactOf("High")).toBe("high");
    expect(impactOf("Medium")).toBe("medium");
    expect(impactOf("Low")).toBe("low");
    expect(impactOf("Holiday")).toBe("holiday");
  });

  it("treats non-economic entries as holidays, not as low-impact news", () => {
    // They are bank holidays and the like: not a release, so not something a
    // trader should read as a quiet data point.
    expect(impactOf("Non-Economic")).toBe("holiday");
  });

  it("falls back to low for anything unrecognised", () => {
    // Deliberately NOT high: an unknown label must not manufacture urgency,
    // and the overlay only draws high and medium.
    expect(impactOf("")).toBe("low");
    expect(impactOf(undefined)).toBe("low");
    expect(impactOf("something new")).toBe("low");
  });
});

describe("parseFeed — values and rejection", () => {
  it("nulls empty strings rather than storing them", () => {
    const rows = parseFeed([
      { title: "t", country: "USD", date: "2026-08-16T12:00:00Z", impact: "High", forecast: "", previous: "50.6", actual: "" },
    ]);
    expect(rows[0].forecast).toBeNull();
    expect(rows[0].actual).toBeNull();
    expect(rows[0].previous).toBe("50.6");
  });

  it("handles the real payload shape, which has no `actual` field at all", () => {
    // Measured 2026-08-18: the live feed carries only title/country/date/
    // impact/forecast/previous — 0 of 96 items had an `actual`, including the
    // 30 already released. The column stays null with this provider, and the
    // parser must not trip over the absent key. See EC-1.
    const rows = parseFeed([
      { title: "CPI m/m", country: "CAD", date: "2026-08-17T08:30:00-04:00", impact: "High", forecast: "0.2%", previous: "0.1%" },
    ]);
    expect(rows[0].actual).toBeNull();
    expect(rows[0].forecast).toBe("0.2%");
    expect(rows[0].event_time).toBe("2026-08-17T12:30:00.000Z");
  });

  it("uppercases the currency so the per-symbol filter can match it", () => {
    // `currenciesForSymbol` returns upper-case codes; a lower-case row would
    // silently never match and the chart would show nothing.
    const rows = parseFeed([{ title: "t", country: "usd", date: "2026-08-16T12:00:00Z", impact: "High" }]);
    expect(rows[0].currency).toBe("USD");
  });

  it("drops rows that cannot be placed in time or attributed", () => {
    const rows = parseFeed([
      { title: "no date", country: "USD", impact: "High" },
      { title: "bad date", country: "USD", date: "not a date", impact: "High" },
      { country: "USD", date: "2026-08-16T12:00:00Z", impact: "High" },
      { title: "no country", date: "2026-08-16T12:00:00Z", impact: "High" },
      { title: "good", country: "EUR", date: "2026-08-16T12:00:00Z", impact: "High" },
    ]);
    expect(rows.map((r) => r.title)).toEqual(["good"]);
  });

  it("truncates a title to the column's width", () => {
    const rows = parseFeed([
      { title: "x".repeat(400), country: "USD", date: "2026-08-16T12:00:00Z", impact: "High" },
    ]);
    expect(rows[0].title).toHaveLength(300);
  });

  it("returns nothing for a payload that is not a list", () => {
    // The feed has answered with an HTML error page before; that must be an
    // empty result, not a crash inside the cron.
    expect(parseFeed(null)).toEqual([]);
    expect(parseFeed({ error: "nope" })).toEqual([]);
    expect(parseFeed("<html>404</html>")).toEqual([]);
  });
});

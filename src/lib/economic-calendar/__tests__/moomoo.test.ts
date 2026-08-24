import { describe, it, expect } from "vitest";
import { parseHot, impactFromStar, toHotDate } from "../moomoo.server";

/**
 * Parsing the moomoo `hot` calendar page.
 *
 * Every sample below is a real record captured from the live endpoint on
 * 2026-08-24, not an invented shape — the same discipline as the ForexFactory
 * fixtures. The 2026-08-07 non-farm payrolls row is the timestamp anchor: its
 * real release is 08:30 America/New_York (EDT), so any correct parse must land
 * on 12:30:00Z. The overlay gates on `event.timeMs <= marketTime`, so an
 * hour's drift here is a lookahead leak rather than a cosmetic error.
 */

const NFP = {
  event_text: "美国季调后非农就业人口变动",
  country: "美国",
  currency: null,
  event_time: 1786105800,
  previous: "20",
  predictive: "85",
  announce: "-23",
  star: 3,
  unit: "K",
  unique_id: "calendar_economic:191714200",
};

describe("parseHot — timestamps", () => {
  it("converts the epoch SECONDS to an ISO string", () => {
    const { rows } = parseHot([NFP]);
    expect(rows).toHaveLength(1);
    // 08:30 EDT on the day of the release.
    expect(rows[0].event_time).toBe("2026-08-07T12:30:00.000Z");
  });

  it("skips a record whose event_time is unusable rather than storing epoch 0", () => {
    const { rows, warnings } = parseHot([{ ...NFP, event_time: undefined }]);
    expect(rows).toHaveLength(0);
    expect(warnings.join(" ")).toMatch(/unusable event_time/);
  });
});

describe("parseHot — field mapping", () => {
  it("maps announce/predictive/previous onto actual/forecast/previous", () => {
    const { rows } = parseHot([NFP]);
    // The whole reason this provider exists: an outcome, not just a schedule.
    expect(rows[0].actual).toBe("-23");
    expect(rows[0].forecast).toBe("85");
    expect(rows[0].previous).toBe("20");
    expect(rows[0].source).toBe("moomoo");
  });

  it("null-normalises the empty strings a future event carries", () => {
    // Measured: a scheduled-but-unreleased event returns "" for both, and the
    // column must read null so `withActual` and the overlay can tell them apart.
    const { rows } = parseHot([{ ...NFP, announce: "", predictive: "" }]);
    expect(rows[0].actual).toBeNull();
    expect(rows[0].forecast).toBeNull();
    expect(rows[0].previous).toBe("20");
  });

  it("keeps the original record in raw_payload", () => {
    const { rows } = parseHot([NFP]);
    expect(rows[0].raw_payload).toEqual(NFP);
  });

  it("strips <em> highlight tags out of the title", () => {
    // `hot` takes no keyword so should never emit them, but the title is part
    // of the unique key — a stray tag would fork one event into two rows.
    const { rows } = parseHot([{ ...NFP, event_text: "美国<em>失业</em>率" }]);
    expect(rows[0].title).toBe("US Unemployment Rate");
  });
});

describe("parseHot — country to currency", () => {
  it("maps the one country this feed actually returns", () => {
    const { rows } = parseHot([NFP]);
    expect(rows[0].currency).toBe("USD");
  });

  it("SKIPS an unmapped country and warns, rather than guessing USD", () => {
    // The failure this protects against: a EUR release filed as USD lands on
    // the wrong chart looking entirely legitimate.
    const { rows, warnings } = parseHot([{ ...NFP, country: "土耳其", event_text: "土耳其失业率" }]);
    expect(rows).toHaveLength(0);
    expect(warnings.join(" ")).toContain("土耳其");
    expect(warnings.join(" ")).toMatch(/COUNTRY_TO_CURRENCY/);
  });
});

describe("parseHot — title translation", () => {
  it("translates a known indicator", () => {
    const { rows, warnings } = parseHot([NFP]);
    expect(rows[0].title).toBe("US Non-Farm Payrolls (seasonally adjusted)");
    expect(warnings).toHaveLength(0);
  });

  it("KEEPS an untranslated title and warns, rather than dropping the row", () => {
    // Opposite trade-off to currency: an untranslated label is cosmetic, but
    // dropping the row loses the `actual` this provider exists to supply.
    const { rows, warnings } = parseHot([{ ...NFP, event_text: "美国某个新指标" }]);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("美国某个新指标");
    expect(rows[0].actual).toBe("-23");
    expect(warnings.join(" ")).toMatch(/untranslated title/);
  });
});

describe("impactFromStar", () => {
  it("treats the star rating this feed actually emits as high impact", () => {
    expect(impactFromStar(3)).toBe("high");
    expect(impactFromStar(5)).toBe("high");
  });

  it("degrades to medium rather than low when star is missing", () => {
    // A curated top-events feed is not publishing noise; absent metadata
    // should not silently demote a release out of a high-impact-only filter.
    expect(impactFromStar(undefined)).toBe("medium");
    expect(impactFromStar(2)).toBe("medium");
    expect(impactFromStar(1)).toBe("low");
  });
});

describe("toHotDate", () => {
  it("emits yyyyMMdd, the only format the endpoint accepts", () => {
    // Measured: `date=2026-08-25` returns 0 rows AND ret_code 0, so a wrong
    // format here is indistinguishable from an empty day.
    expect(toHotDate(new Date("2026-08-07T12:30:00.000Z"))).toBe("20260807");
  });

  it("uses UTC, not the host's local day", () => {
    // 23:30Z is already the next day in Asia/Shanghai; the bucket must follow
    // the timezone=UTC we send, not wherever the server happens to run.
    expect(toHotDate(new Date("2026-08-07T23:30:00.000Z"))).toBe("20260807");
  });
});

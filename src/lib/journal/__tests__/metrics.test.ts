import { describe, expect, it } from "vitest";
import { bucketByDay, countsTowardAnalytics, hiveScore, summarize } from "@/lib/journal/metrics";
import type { JournalEntry } from "@/lib/journal/api";

const entry = (over: Partial<JournalEntry> = {}) =>
  ({
    id: "e1",
    status: "draft",
    closed_at: "2026-08-10T10:35:00.000Z",
    pnl: 100,
    rr: 1.2,
    emotions: [],
    mistakes: [],
    strategy_tags: [],
    notes_text: null,
    entry_reason_text: null,
    discipline: null,
    risk_pct: null,
    ...over,
  }) as unknown as JournalEntry;

describe("analytics gate", () => {
  /**
   * The regression this locks: entries auto-created from a closed trade land as
   * `draft`, and every analytics surface used to filter on `status !== "draft"`.
   * A real account of closed trades therefore rendered as "no data".
   */
  it("counts a completed trade even while it is still an unwritten draft", () => {
    expect(countsTowardAnalytics(entry({ status: "draft" }))).toBe(true);
  });

  it("counts published entries", () => {
    expect(countsTowardAnalytics(entry({ status: "published" }))).toBe(true);
  });

  it("excludes archived entries — archiving is an explicit opt-out", () => {
    expect(countsTowardAnalytics(entry({ status: "archived" }))).toBe(false);
  });

  it("excludes an entry that does not yet describe a completed trade", () => {
    expect(countsTowardAnalytics(entry({ closed_at: null }))).toBe(false);
    expect(countsTowardAnalytics(entry({ pnl: null }))).toBe(false);
  });

  it("counts a break-even trade — pnl 0 is a result, not a missing value", () => {
    expect(countsTowardAnalytics(entry({ pnl: 0 }))).toBe(true);
  });

  it("scores drafts that describe real trades", () => {
    const drafts = [
      entry({ id: "a", pnl: -894.96 }),
      entry({ id: "b", pnl: 1110.86 }),
      entry({ id: "c", pnl: -625.44 }),
    ];
    // The old gate produced sample 0 and a zeroed score for exactly this input.
    expect(hiveScore(drafts).sample).toBe(3);
    expect(summarize(drafts.filter(countsTowardAnalytics)).trades).toBe(3);
  });
});

describe("day bucketing is timezone-aware", () => {
  /**
   * Real data from 2026-08-11: two of the five trades closed at 21:35 and 22:20
   * UTC on 07-01, the rest on 07-02. Which day they belong to is a timezone
   * decision, not a detail — every "by day" report inherits it.
   */
  const closes = [
    "2026-07-01T21:35:00+00:00",
    "2026-07-01T22:20:00+00:00",
    "2026-07-02T00:35:00+00:00",
    "2026-07-02T02:45:00+00:00",
    "2026-07-02T09:50:00+00:00",
  ];
  const rows = closes.map((closed_at, i) => entry({ id: `t${i}`, closed_at, pnl: 100 }));

  it("splits across two days in UTC", () => {
    const b = bucketByDay(rows, "UTC");
    expect([...b.keys()].sort()).toEqual(["2026-07-01", "2026-07-02"]);
    expect(b.get("2026-07-01")!.ids).toHaveLength(2);
    expect(b.get("2026-07-02")!.ids).toHaveLength(3);
  });

  it("collapses onto one day for a trader in Asia/Kolkata", () => {
    // UTC+5:30 pushes both late-evening closes past midnight into the 2nd.
    const b = bucketByDay(rows, "Asia/Kolkata");
    expect([...b.keys()]).toEqual(["2026-07-02"]);
    expect(b.get("2026-07-02")!.ids).toHaveLength(5);
  });

  it("shifts the other way for a trader in America/New_York", () => {
    // UTC-4 pulls the early-morning closes back into the 1st.
    const b = bucketByDay(rows, "America/New_York");
    expect(b.get("2026-07-01")!.ids).toHaveLength(4);
    expect(b.get("2026-07-02")!.ids).toHaveLength(1);
  });

  it("labels the bucket with the zoned date, not the raw instant", () => {
    const d = bucketByDay(rows, "Asia/Kolkata").get("2026-07-02")!.date;
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2026, 7, 2]);
  });

  it("falls back to UTC on an invalid timezone rather than throwing", () => {
    const b = bucketByDay(rows, "Not/AZone");
    expect([...b.keys()].sort()).toEqual(["2026-07-01", "2026-07-02"]);
  });
});

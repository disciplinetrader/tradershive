import { describe, expect, it } from "vitest";
import {
  EMPTY_REPORT_FILTERS,
  buildDataset,
  measurableRate,
  mistakeCosts,
  winLossAnatomy,
  MIN_SAMPLE,
} from "@/lib/journal/reports";
import { fromJournalEntry } from "@/lib/analytics/normalize";
import { weekdayIndex } from "@/lib/journal/__tests__/helpers";
import type { JournalEntry } from "@/lib/journal/api";

const entry = (over: Partial<JournalEntry> = {}) =>
  ({
    id: "e1",
    status: "draft",
    symbol: "BTC/USDT",
    market: "crypto",
    direction: "long",
    opened_at: "2026-07-02T09:00:00+00:00",
    closed_at: "2026-07-02T09:50:00+00:00",
    duration_seconds: 3000,
    pnl: 100,
    rr: 1,
    commission: 0,
    swap: 0,
    entry_price: 100,
    exit_price: 110,
    stop_loss: 90,
    lot_size: 1,
    emotions: [],
    mistakes: [],
    strategy_tags: [],
    setup: null,
    ...over,
  }) as unknown as JournalEntry;

const build = (entries: JournalEntry[], filters = EMPTY_REPORT_FILTERS) =>
  buildDataset(entries, filters, "UTC", weekdayIndex);

describe("measurability is never faked", () => {
  it("refuses a rate below the minimum sample", () => {
    const m = measurableRate(1, 100);
    expect(m.measurable).toBe(false);
    if (!m.measurable) expect(m.reason).toBe(`Needs ${MIN_SAMPLE} trades, has 1`);
  });

  it("reports the sample even when refusing, so the UI can say why", () => {
    expect(measurableRate(3, 100).sample).toBe(3);
  });

  it("distinguishes an empty range from an insufficient one", () => {
    const none = measurableRate(0, 0);
    expect(none.measurable).toBe(false);
    if (!none.measurable) expect(none.reason).toBe("No trades in range");
  });

  it("measures once the sample is sufficient", () => {
    const m = measurableRate(MIN_SAMPLE, 62.5);
    expect(m.measurable).toBe(true);
    if (m.measurable) expect(m.value).toBe(62.5);
  });
});

describe("one dataset, filtered once", () => {
  const rows = [
    entry({ id: "a", pnl: 100, closed_at: "2026-07-01T10:00:00+00:00", symbol: "BTC/USDT" }),
    entry({ id: "b", pnl: -50, closed_at: "2026-07-05T10:00:00+00:00", symbol: "ETH/USDT" }),
    entry({ id: "c", pnl: 25, closed_at: "2026-07-10T10:00:00+00:00", symbol: "BTC/USDT" }),
  ];

  it("excludes entries the rest of the journal excludes", () => {
    // No closed_at / pnl -> not a completed trade, so no report may count it.
    const withDraft = [...rows, entry({ id: "d", closed_at: null, pnl: null })];
    expect(build(withDraft)).toHaveLength(3);
  });

  it("applies the date range inclusively at both ends", () => {
    const got = build(rows, { ...EMPTY_REPORT_FILTERS, from: "2026-07-01", to: "2026-07-05" });
    expect(got.map((r) => r.journalEntryId)).toEqual(["a", "b"]);
  });

  it("filters by symbol", () => {
    const got = build(rows, { ...EMPTY_REPORT_FILTERS, symbol: "btc" });
    expect(got.map((r) => r.journalEntryId)).toEqual(["a", "c"]);
  });

  it("matches a tag across any kind", () => {
    const tagged = [
      entry({ id: "x", mistakes: ["revenge_trade"] }),
      entry({ id: "y", strategy_tags: ["breakout"] }),
      entry({ id: "z" }),
    ];
    expect(build(tagged, { ...EMPTY_REPORT_FILTERS, tagValues: ["revenge_trade"] })).toHaveLength(1);
    expect(build(tagged, { ...EMPTY_REPORT_FILTERS, tagValues: ["breakout"] })).toHaveLength(1);
    expect(
      build(tagged, { ...EMPTY_REPORT_FILTERS, tagValues: ["revenge_trade", "breakout"] }),
    ).toHaveLength(2);
  });
});

describe("mistake cost is a contrast, not a sum of losses", () => {
  it("does not blame a tag that performs like the rest", () => {
    // Tagged and untagged both average +100: the tag costs nothing.
    const rows = [
      entry({ id: "a", pnl: 100, mistakes: ["overtrading"] }),
      entry({ id: "b", pnl: 100 }),
      entry({ id: "c", pnl: 100 }),
    ];
    const [row] = mistakeCosts(build(rows));
    expect(row.value).toBe("overtrading");
    expect(row.estimatedCost).toBeCloseTo(0, 6);
  });

  it("costs a tag that underperforms the baseline", () => {
    // Untagged average +100; the tagged trade returns -200 -> cost 300.
    const rows = [
      entry({ id: "a", pnl: -200, mistakes: ["revenge_trade"] }),
      entry({ id: "b", pnl: 100 }),
      entry({ id: "c", pnl: 100 }),
    ];
    const [row] = mistakeCosts(build(rows));
    expect(row.occurrences).toBe(1);
    expect(row.estimatedCost).toBeCloseTo(300, 6);
  });

  it("is legible at n=3 and ranks the costliest habit first", () => {
    const rows = [
      entry({ id: "a", pnl: -300, mistakes: ["revenge_trade"] }),
      entry({ id: "b", pnl: -50, mistakes: ["entered_early"] }),
      entry({ id: "c", pnl: 200 }),
    ];
    const out = mistakeCosts(build(rows));
    expect(out.map((r) => r.value)).toEqual(["revenge_trade", "entered_early"]);
    expect(out[0].estimatedCost).toBeGreaterThan(out[1].estimatedCost);
  });

  it("returns nothing when no mistake was ever tagged", () => {
    expect(mistakeCosts(build([entry({ id: "a" })]))).toEqual([]);
  });
});

describe("win/loss anatomy", () => {
  it("reports the hold-time ratio that catches the classic leak", () => {
    const rows = [
      entry({ id: "w", pnl: 100, duration_seconds: 600 }),
      entry({ id: "l", pnl: -100, duration_seconds: 2400 }),
    ];
    const a = winLossAnatomy(build(rows));
    expect(a.wins.count).toBe(1);
    expect(a.losses.count).toBe(1);
    expect(a.holdTimeRatio).toBeCloseTo(4, 6); // losers held 4x longer
  });

  it("refuses a ratio when one side is empty — a comparison needs two sides", () => {
    const a = winLossAnatomy(build([entry({ id: "w", pnl: 100 })]));
    expect(a.losses.count).toBe(0);
    expect(a.holdTimeRatio).toBeNull();
  });
});

describe("unmeasurable inputs stay null rather than becoming zero", () => {
  it("leaves R null when the entry has no risk basis", () => {
    const r = fromJournalEntry(entry({ rr: null, stop_loss: null, entry_price: null }));
    expect(r.riskAmount).toBeNull();
    expect(r.realizedR).toBeNull();
  });
});

describe("break-even band", () => {
  /**
   * A scratch trade is not a win. Without a band, +$0.01 inflates win rate and
   * every expectancy figure downstream, because win rate has no magnitude.
   */
  it("classifies a result inside the band as break-even", () => {
    const rows = [
      entry({ id: "scratch", pnl: 0.5 }),
      entry({ id: "real", pnl: 400 }),
      entry({ id: "loser", pnl: -400 }),
    ];
    const withBand = buildDataset(rows, EMPTY_REPORT_FILTERS, "UTC", weekdayIndex, 1);
    expect(withBand.find((r) => r.journalEntryId === "scratch")!.result).toBe("breakeven");
    expect(withBand.find((r) => r.journalEntryId === "real")!.result).toBe("win");
    expect(withBand.find((r) => r.journalEntryId === "loser")!.result).toBe("loss");
  });

  it("is symmetric — a small loss is scratch too", () => {
    const rows = [entry({ id: "a", pnl: -0.5 })];
    expect(buildDataset(rows, EMPTY_REPORT_FILTERS, "UTC", weekdayIndex, 1)[0].result).toBe("breakeven");
  });

  it("defaults to zero, so existing behaviour is unchanged", () => {
    const rows = [entry({ id: "a", pnl: 0.5 })];
    expect(build(rows)[0].result).toBe("win");
  });

  it("keeps a scratch trade out of the win rate", () => {
    const rows = [
      entry({ id: "s", pnl: 0.5 }),
      entry({ id: "w", pnl: 100 }),
      entry({ id: "l", pnl: -100 }),
    ];
    const a = winLossAnatomy(buildDataset(rows, EMPTY_REPORT_FILTERS, "UTC", weekdayIndex, 1));
    expect(a.wins.count).toBe(1);
    expect(a.losses.count).toBe(1); // the scratch is in neither
  });
});

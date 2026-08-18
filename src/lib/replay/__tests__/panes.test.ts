import { describe, it, expect } from "vitest";
import type { Candle } from "@/lib/market-data/types";
import { aggregatableFrom, aggregateCandles, defaultPaneLadder } from "../aggregate";

/**
 * Phase 2 · item 1A — multi-pane replay.
 *
 * A pane is a FOLD of the session's own dataset, never a second fetch, so the
 * whole feature rests on two things being true: which timeframes a base can
 * legally fold into, and that the fold is deterministic. Both are asserted
 * here against arithmetic rather than against whatever the folder returns.
 */

function candles(count: number, stepMinutes: number, from = Date.UTC(2026, 6, 5, 0, 0, 0)): Candle[] {
  return Array.from({ length: count }, (_, i) => ({
    time: from + i * stepMinutes * 60_000,
    open: 100 + i,
    high: 100 + i + 2,
    low: 100 + i - 2,
    close: 100 + i + 1,
    volume: 10,
  })) as Candle[];
}

describe("aggregatableFrom — a base can only fold upward, and only into multiples", () => {
  it("offers every exact multiple of a 5m base", () => {
    // 1m and 3m are BELOW the base: those bars were never loaded, and folding
    // cannot invent them.
    expect(aggregatableFrom("5m")).toEqual(["5m", "15m", "30m", "1H", "2H", "4H", "1D", "1W"]);
  });

  it("drops timeframes that are not whole multiples", () => {
    // 30m does not divide into 4H cleanly from a 45m base — and more to the
    // point, a 1H base cannot make 15m.
    expect(aggregatableFrom("1H")).toEqual(["1H", "2H", "4H", "1D", "1W"]);
    expect(aggregatableFrom("1H")).not.toContain("15m");
  });

  it("leaves a 1D base with almost nowhere to climb", () => {
    expect(aggregatableFrom("1D")).toEqual(["1D", "1W"]);
  });
});

describe("defaultPaneLadder — pane 1 is always the tape the clock runs on", () => {
  it("climbs the ladder from the base", () => {
    expect(defaultPaneLadder("5m", 1)).toEqual(["5m"]);
    expect(defaultPaneLadder("5m", 2)).toEqual(["5m", "15m"]);
    expect(defaultPaneLadder("5m", 4)).toEqual(["5m", "15m", "30m", "1H"]);
  });

  it("starts from whatever the session's own base is", () => {
    expect(defaultPaneLadder("1H", 4)).toEqual(["1H", "2H", "4H", "1D"]);
    expect(defaultPaneLadder("15m", 2)).toEqual(["15m", "30m"]);
  });

  it("repeats the highest available rather than inventing a fold it cannot do", () => {
    // A 1D session has only 1D and 1W. Four panes cannot mean four distinct
    // timeframes, and a pane must show something.
    expect(defaultPaneLadder("1D", 4)).toEqual(["1D", "1W", "1W", "1W"]);
  });

  it("always returns at least one pane", () => {
    expect(defaultPaneLadder("5m", 0)).toEqual(["5m"]);
  });
});

describe("aggregateCandles — the fold a pane actually renders", () => {
  it("turns thirty 5m bars into ten 15m bars", () => {
    const folded = aggregateCandles(candles(30, 5), "5m", "15m");
    expect(folded).toHaveLength(10);
    // First bucket spans bars 0-2: open of the first, close of the third,
    // high/low the extremes across all three.
    expect(folded[0]).toMatchObject({ open: 100, close: 103, high: 104, low: 98 });
  });

  it("leaves the base timeframe untouched", () => {
    const raw = candles(12, 5);
    expect(aggregateCandles(raw, "5m", "5m")).toEqual(raw);
  });

  it("keeps the forming bar partial rather than waiting for it to complete", () => {
    // 31 bars is ten full 15m buckets plus one bar of the eleventh. A replay
    // must show that eleventh bar forming, exactly as it would live.
    const folded = aggregateCandles(candles(31, 5), "5m", "15m");
    expect(folded).toHaveLength(11);
    expect(folded[10].open).toBe(folded[10].close - 1);
  });

  it("buckets by absolute epoch time, so the same input always folds the same", () => {
    // Determinism is the whole reason panes fold rather than re-fetch: two
    // devices on one session must see identical higher-timeframe bars.
    const raw = candles(30, 5);
    expect(aggregateCandles(raw, "5m", "1H")).toEqual(aggregateCandles([...raw], "5m", "1H"));
    // Starting mid-hour must not shift the buckets — they are absolute.
    const offset = candles(12, 5, Date.UTC(2026, 6, 5, 0, 25, 0));
    expect(aggregateCandles(offset, "5m", "1H")[0].time).toBe(Date.UTC(2026, 6, 5, 0, 0, 0));
  });
});

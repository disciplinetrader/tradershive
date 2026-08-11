import { describe, expect, it } from "vitest";
import { capPath, computeExcursions, timeframeFor } from "@/lib/journal/excursions";
import { findSymbol } from "@/lib/paper-trading/symbols";

const sym = findSymbol("BTC/USDT")!;

const candles = (rows: [number, number, number, number][]) =>
  rows.map(([time, high, low, close]) => ({ time, high, low, close }));

describe("MAE / MFE", () => {
  /**
   * The wick is the point. A trade that closed well after nearly being stopped
   * was not a comfortable trade, and only the low knows that.
   */
  it("uses the candle low for a long's adverse excursion, not the close", () => {
    const r = computeExcursions({
      sym,
      direction: "long",
      entryPrice: 100,
      stopLoss: 90,
      lotSize: 1,
      candles: candles([
        [1, 101, 92, 100], // dipped to 92 but closed flat
        [2, 120, 99, 120],
      ]),
    })!;
    expect(r.maePrice).toBe(92);
    expect(r.mfePrice).toBe(120);
    expect(r.maePnl).toBeLessThan(0);
    expect(r.mfePnl).toBeGreaterThan(0);
  });

  it("mirrors for a short — hurt by the high, helped by the low", () => {
    const r = computeExcursions({
      sym,
      direction: "short",
      entryPrice: 100,
      stopLoss: 110,
      lotSize: 1,
      candles: candles([[1, 108, 95, 96]]),
    })!;
    expect(r.maePrice).toBe(108);
    expect(r.mfePrice).toBe(95);
    expect(r.maePnl).toBeLessThan(0);
    expect(r.mfePnl).toBeGreaterThan(0);
  });

  it("expresses R against what the stop was worth", () => {
    // Stop is 10 away; the low is 5 away -> exactly -0.5R adverse.
    const r = computeExcursions({
      sym,
      direction: "long",
      entryPrice: 100,
      stopLoss: 90,
      lotSize: 1,
      candles: candles([[1, 110, 95, 105]]),
    })!;
    expect(r.maeR).toBeCloseTo(-0.5, 6);
    expect(r.mfeR).toBeCloseTo(1.0, 6);
  });

  it("leaves R null without a stop rather than inventing a basis", () => {
    const r = computeExcursions({
      sym, direction: "long", entryPrice: 100, stopLoss: null, lotSize: 1,
      candles: candles([[1, 110, 95, 105]]),
    })!;
    expect(r.maeR).toBeNull();
    expect(r.mfeR).toBeNull();
    expect(r.maePnl).toBeLessThan(0); // currency still measurable
  });

  it("clamps the signs — adverse is never positive, favourable never negative", () => {
    // Price only ever went up: adverse excursion is 0, not a positive number.
    const r = computeExcursions({
      sym, direction: "long", entryPrice: 100, stopLoss: 90, lotSize: 1,
      candles: candles([[1, 120, 101, 118]]),
    })!;
    expect(r.maePnl).toBe(0);
    expect(r.maeR).toBe(0);
    expect(r.mfePnl).toBeGreaterThan(0);
  });

  it("returns null rather than a zero result when there are no candles", () => {
    expect(computeExcursions({ sym, direction: "long", entryPrice: 100, stopLoss: 90, lotSize: 1, candles: [] })).toBeNull();
  });

  it("builds a running P&L point per candle close", () => {
    const r = computeExcursions({
      sym, direction: "long", entryPrice: 100, stopLoss: 90, lotSize: 1,
      candles: candles([[1, 105, 99, 102], [2, 108, 101, 107]]),
    })!;
    expect(r.path.map((p) => p.t)).toEqual([1, 2]);
    expect(r.path[1].pnl).toBeGreaterThan(r.path[0].pnl);
  });
});

describe("path capping", () => {
  const long = Array.from({ length: 5000 }, (_, i) => ({ t: i, pnl: i }));

  it("keeps both endpoints so the curve still starts and ends where it did", () => {
    const c = capPath(long, 500);
    expect(c).toHaveLength(500);
    expect(c[0]).toEqual(long[0]);
    expect(c[c.length - 1]).toEqual(long[long.length - 1]);
  });

  it("leaves a short path untouched", () => {
    const short = long.slice(0, 10);
    expect(capPath(short, 500)).toBe(short);
  });
});

describe("timeframe selection is bounded", () => {
  it("uses fine bars for short trades and coarse ones for long", () => {
    expect(timeframeFor(2 * 3_600_000)).toBe("1m");
    expect(timeframeFor(12 * 3_600_000)).toBe("5m");
    expect(timeframeFor(3 * 24 * 3_600_000)).toBe("15m");
    expect(timeframeFor(200 * 24 * 3_600_000)).toBe("1D");
  });
});

import { describe, it, expect } from "vitest";
import { checkCoverage, expectedCandles } from "../coverage";

/**
 * The minimum-candle floor, and the sub-candle window it used to make
 * unsatisfiable.
 *
 * The gate was `actual < Math.min(minCandles, expected || minCandles)`. When a
 * window is shorter than one candle, `expected` is 0, and `0 || 20` is 20 — so
 * the check demanded twenty candles of a window that can physically hold none.
 * Nothing could ever clear it: not a provider, not a retry, not a fully
 * populated store, because the requirement was derived from the absence of a
 * requirement.
 *
 * Measured on 2026-08-27: 18 of 41 journal entries queued for excursion
 * measurement were sub-candle scalps failing here permanently and being
 * re-queued forever (see MD-10, and `attemptExcursion`, which now refuses a
 * sub-candle trade outright rather than asking about it).
 *
 * The floor itself is NOT relaxed anywhere else — that is the other half of
 * the pin. A short-but-real window still has to be complete.
 */

const T = Date.UTC(2026, 7, 27, 12, 0, 0);
const MIN = 60_000;
const candlesFrom = (start: number, n: number, step = MIN) =>
  Array.from({ length: n }, (_, i) => ({ time: start + i * step }));

describe("checkCoverage · the minimum-candle floor", () => {
  it("a sub-candle window expects zero candles", () => {
    // 40 seconds of crypto (continuous market, no session discount).
    expect(expectedCandles(T, T + 40_000, "1m", "crypto")).toBe(0);
  });

  it("does NOT demand a minimum of a window that expects zero", () => {
    // One candle happens to overlap the 40s window. Previously: needed 20.
    const r = checkCoverage({
      candles: [{ time: T }], from: T, to: T + 40_000, timeframe: "1m", market: "crypto",
    });
    expect(r.expected).toBe(0);
    expect(r.reason).toBeUndefined();
    expect(r.ok).toBe(true);
  });

  it("still reports an empty sub-candle window as empty, not as covered", () => {
    // The `expected === 0` relaxation must not turn "no data" into "fine".
    const r = checkCoverage({
      candles: [], from: T, to: T + 40_000, timeframe: "1m", market: "crypto",
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("empty");
  });

  it("keeps the floor at `expected` for a short but real window", () => {
    // 12 minutes expects 12 candles; 11 is not enough, 12 is.
    const from = T, to = T + 12 * MIN;
    expect(expectedCandles(from, to, "1m", "crypto")).toBe(12);
    expect(checkCoverage({ candles: candlesFrom(from, 11), from, to, timeframe: "1m", market: "crypto" }).reason)
      .toBe("too-few-candles");
    expect(checkCoverage({ candles: candlesFrom(from, 12), from, to, timeframe: "1m", market: "crypto" }).ok)
      .toBe(true);
  });

  it("keeps the 20-candle floor for a long window", () => {
    // 3 hours expects 180 candles; the floor caps at minCandles, not expected.
    const from = T, to = T + 180 * MIN;
    expect(checkCoverage({ candles: candlesFrom(from, 19), from, to, timeframe: "1m", market: "crypto" }).reason)
      .toBe("too-few-candles");
    // 20 clears the floor but not the 0.6 ratio — a different failure, on purpose.
    expect(checkCoverage({ candles: candlesFrom(from, 20), from, to, timeframe: "1m", market: "crypto" }).reason)
      .toBe("insufficient-ratio");
  });
});

import { describe, it, expect } from "vitest";
import { bracketFor, marketOrderSize } from "../chart-trading";
import { inferOrderType } from "@/lib/chart/orders/model";

/**
 * The two decisions a chart click makes: what the levels are, and what kind of
 * order it is. Both are shared — the armed click-to-place flow and the
 * right-click menu must agree, or the same gesture means two different trades
 * depending on how it was started.
 */

describe("bracketFor", () => {
  it("puts the stop below and the target above for a buy, at the stated R", () => {
    // 0.2% of 63144.01 = 126.288...
    const b = bracketFor("buy", 63144.01, { stopFraction: 0.002, rr: 2 });
    expect(b.entry).toBe(63144.01);
    expect(b.stop).toBeCloseTo(63017.72, 2);
    expect(b.target).toBeCloseTo(63396.59, 2);
    // The target is exactly rr times the stop distance away.
    expect((b.target - b.entry) / (b.entry - b.stop)).toBeCloseTo(2, 10);
  });

  it("mirrors for a sell", () => {
    const b = bracketFor("sell", 63144.01, { stopFraction: 0.002, rr: 2 });
    expect(b.stop).toBeGreaterThan(b.entry);
    expect(b.target).toBeLessThan(b.entry);
    expect((b.entry - b.target) / (b.stop - b.entry)).toBeCloseTo(2, 10);
  });

  it("never returns a zero stop distance", () => {
    // A zero risk basis makes every R-multiple derived from it Infinity.
    const b = bracketFor("buy", 0, { stopFraction: 0.002, rr: 2 });
    expect(b.entry - b.stop).toBeGreaterThan(0);
  });

  it("is the same for both chart gestures — one derivation, not two", () => {
    // Armed click-to-place and the right-click menu both call this with the
    // same defaults, so an identical click must produce identical levels.
    const armed = bracketFor("buy", 100, { stopFraction: 0.002, rr: 2 });
    const menu = bracketFor("buy", 100, { stopFraction: 0.002, rr: 2 });
    expect(menu).toEqual(armed);
  });
});

describe("inferOrderType — what the context menu now offers", () => {
  const TICK = 0.01;

  it("offers a limit below market and a stop above, for a buy", () => {
    expect(inferOrderType("buy", 99, 100, TICK)).toBe("buy_limit");
    expect(inferOrderType("buy", 101, 100, TICK)).toBe("buy_stop");
  });

  it("mirrors for a sell", () => {
    expect(inferOrderType("sell", 101, 100, TICK)).toBe("sell_limit");
    expect(inferOrderType("sell", 99, 100, TICK)).toBe("sell_stop");
  });

  it("resolves a click AT the market to a market order", () => {
    // The behaviour change from folding the menu onto this function. Its old
    // inline rule (`price < livePrice`) had no tolerance, so a click on the
    // market price offered a stop — an order resting where the market already
    // is.
    expect(inferOrderType("buy", 100, 100, TICK)).toBe("market");
    expect(inferOrderType("sell", 100, 100, TICK)).toBe("market");
    expect(inferOrderType("buy", 100.005, 100, TICK)).toBe("market");
  });

  it("declines to guess when there is no market price", () => {
    // The old rule treated a missing live price as "above market" and offered
    // a stop. This returns `market`, and the menu hides the pending row.
    expect(inferOrderType("buy", 100, null, TICK)).toBe("market");
    expect(inferOrderType("sell", 100, undefined, TICK)).toBe("market");
  });
});

/**
 * RS-4 Option A - sizing when the stop may not exist.
 *
 * Dropping the seeded bracket means `placeMarketOrder` can produce
 * `stop: null`, and `sizeForRisk` divides by the stop distance. The branch that
 * decides what happens instead is one line, and one line that decides how much
 * money is at risk earns its own cases.
 *
 * Mutation-verified: collapsing the branch to `riskSized` alone fails the
 * no-stop cases; collapsing it to `defaultUnits` alone fails the risk-sized
 * ones. Both are asserted so neither collapse passes.
 */
describe("marketOrderSize", () => {
  it("uses the risk-derived size when a stop exists", () => {
    expect(marketOrderSize({ stop: 62_000, riskSized: 0.79, defaultUnits: 1 })).toBe(0.79);
  });

  it("falls back to the trader's default when there is NO stop", () => {
    // The whole point of Option A: not a fabricated risk number, a chosen one.
    expect(marketOrderSize({ stop: null, riskSized: 0.79, defaultUnits: 2.5 })).toBe(2.5);
  });

  it("ignores a risk-derived size that a null stop makes meaningless", () => {
    // `sizeForRisk` returns its own `1` fallback with a zero distance. Passing
    // that through would look deliberate and would not be.
    expect(marketOrderSize({ stop: null, riskSized: 1, defaultUnits: 4 })).toBe(4);
  });

  it("an explicit size wins over both", () => {
    expect(marketOrderSize({ explicit: 10, stop: 62_000, riskSized: 0.79, defaultUnits: 1 })).toBe(10);
    expect(marketOrderSize({ explicit: 10, stop: null, riskSized: 0.79, defaultUnits: 1 })).toBe(10);
  });

  it("never opens a zero or non-finite size", () => {
    // A zero-size position is not a smaller trade, it is a trade that books no
    // money while looking open.
    expect(marketOrderSize({ stop: null, riskSized: 0, defaultUnits: 0 })).toBe(1);
    expect(marketOrderSize({ stop: null, riskSized: 0, defaultUnits: NaN })).toBe(1);
    expect(marketOrderSize({ stop: 62_000, riskSized: NaN, defaultUnits: 3 })).toBe(3);
    expect(marketOrderSize({ stop: 62_000, riskSized: -5, defaultUnits: 3 })).toBe(3);
  });
});

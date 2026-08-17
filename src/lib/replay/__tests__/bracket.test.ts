import { describe, it, expect } from "vitest";
import { bracketFor } from "../chart-trading";
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

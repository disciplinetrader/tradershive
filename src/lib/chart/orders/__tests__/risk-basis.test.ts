import { describe, it, expect } from "vitest";
import { openExecution, riskBasisOf, stopDistance } from "../position-manager";
import type { PositionOrder } from "../model";

/**
 * RS-4 · Stage A′ — a stopless position has NO risk basis, not a huge one.
 *
 * `Math.abs(fill - stop)` with an absent stop does not throw and does not
 * produce NaN. `fill - null` is `fill - 0`, so the "risk distance" comes back
 * as the ENTIRE FILL PRICE:
 *
 *   fill 63,000, stop null  ->  riskBasis 63000   (finite, plausible, wrong)
 *
 * Every R-multiple derived from that is a small, believable, incorrect number.
 * It reaches the position label, the blotter, and — via `openExecution`, which
 * seeds `riskBasis` once at fill time and never re-derives it — the durable
 * closed-trade record, where it cannot be corrected without rewriting booked
 * history.
 *
 * Same family as the `exitFor` bug that closed a targetless long at price 0:
 * an absent level silently coerced into a sentinel that looks like data.
 *
 * These cases are written to FAIL against the unguarded arithmetic and were
 * confirmed to do so by mutation before the fix was kept.
 */

const FILL = 63_000;

function order(over: Partial<PositionOrder> = {}): PositionOrder {
  return {
    id: "o1",
    symbol: "BTC/USDT",
    direction: "buy",
    orderType: "market",
    entry: FILL,
    fillPrice: FILL,
    stop: 62_000,
    target: 65_000,
    size: 1,
    status: "filled",
    ...(over as object),
  } as PositionOrder;
}

const ABSENT = [
  ["null", null],
  ["undefined", undefined],
  ["NaN", NaN],
] as const;

describe("stopDistance", () => {
  it("measures a real distance", () => {
    expect(stopDistance(FILL, 62_000)).toBe(1_000);
    expect(stopDistance(62_000, FILL)).toBe(1_000);
  });

  it.each(ABSENT)("returns null for a %s stop rather than the fill price", (_label, value) => {
    expect(stopDistance(FILL, value as unknown as number)).toBeNull();
  });

  it("never returns the fill price for an absent stop", () => {
    for (const [, value] of ABSENT) {
      expect(stopDistance(FILL, value as unknown as number)).not.toBe(FILL);
    }
  });

  it("returns null when the fill itself is unusable", () => {
    expect(stopDistance(NaN, 62_000)).toBeNull();
  });
});

describe("riskBasisOf", () => {
  it("uses the real stop distance when there is a stop", () => {
    expect(riskBasisOf(order())).toBe(1_000);
  });

  // THE DISQUALIFYING CASE.
  it.each(ABSENT)("reports no basis for a %s stop, not the fill price", (_label, value) => {
    const basis = riskBasisOf(order({ stop: value as unknown as number }));
    expect(basis).not.toBe(FILL);
    expect(basis).toBe(0);
  });

  it("does not resurrect a basis from an absent initialStop either", () => {
    const basis = riskBasisOf(order({
      stop: null as unknown as number,
      initialStop: null as unknown as number,
    }));
    expect(basis).not.toBe(FILL);
    expect(basis).toBe(0);
  });

  it("still prefers an explicitly stored riskBasis", () => {
    // Guards the opposite regression: a guard applied too broadly would
    // discard a basis that was legitimately captured at fill time.
    expect(riskBasisOf(order({ stop: null as unknown as number, riskBasis: 1_500 }))).toBe(1_500);
  });
});

describe("openExecution seeds the durable basis", () => {
  it("stores a real basis when a stop exists", () => {
    expect(openExecution(order()).riskBasis).toBe(1_000);
  });

  // This is the write that reaches the closed-trade record. Unguarded it
  // stored 63000 and that number outlived the position.
  it.each(ABSENT)("stores NO basis for a %s stop, rather than the fill price", (_label, value) => {
    const opened = openExecution(order({ stop: value as unknown as number }));
    expect(opened.riskBasis).not.toBe(FILL);
    expect(opened.riskBasis).toBeUndefined();
  });

  it("never writes a basis larger than the position could possibly risk", () => {
    // A basis at or above the fill price is definitionally impossible: it would
    // mean risking the instrument's entire value on one position.
    for (const [, value] of ABSENT) {
      const opened = openExecution(order({ stop: value as unknown as number }));
      if (opened.riskBasis != null) {
        expect(opened.riskBasis).toBeLessThan(FILL);
      }
    }
  });
});

describe("R is absent, not zero-ish, when there is no stop", () => {
  // The display decides between a number and an em-dash on exactly this
  // predicate, so it is pinned here rather than only in the component.
  it.each(ABSENT)("Number.isFinite is false for a %s stop", (_label, value) => {
    expect(Number.isFinite(order({ stop: value as unknown as number }).stop)).toBe(false);
  });

  it("is true for a real stop, so the number still shows", () => {
    expect(Number.isFinite(order().stop)).toBe(true);
  });
});

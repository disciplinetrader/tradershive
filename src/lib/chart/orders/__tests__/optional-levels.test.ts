import { describe, it, expect } from "vitest";
import { exitFor } from "../engine";
import type { PositionOrder } from "../model";

/**
 * RS-4 · Stage 1 — a level that does not exist can never trigger.
 *
 * A position may carry no stop, no target, or neither. That means it has no
 * protection or no objective; it does NOT mean the level sits at zero.
 *
 * Before the guard in `exitFor`, an absent level was coerced by the raw
 * comparisons and fired on the very first tick:
 *
 *   long,  target = null -> exitQuote >= null -> TRUE  -> closePrice null -> 0
 *   short, stop   = null -> exitQuote >= null -> TRUE
 *
 * Neither threw. Both produced a plausible-looking exit stamped "take_profit"
 * or "stop_loss", written to the durable trade tape and into analytics — a
 * booked-but-wrong closure that cannot be reopened at a later price without
 * corrupting the journal further.
 *
 * These cases are written to FAIL against the unguarded implementation, and
 * were confirmed to do so by mutation before the fix was kept. If a later
 * change makes them pass vacuously, they are worthless: note that every "still
 * open" assertion is paired with a price that DOES close the position, so the
 * series is never merely inert.
 *
 * No costs anywhere — bid and ask both equal the observed price, so every
 * threshold below can be checked by hand.
 */

function order(over: Partial<PositionOrder> = {}): PositionOrder {
  return {
    id: "o1",
    symbol: "EUR/USD",
    direction: "buy",
    orderType: "market",
    entry: 100,
    stop: 99,
    target: 101,
    size: 1,
    status: "filled",
    ...(over as object),
  } as PositionOrder;
}

/** An absent level, however it is spelled at runtime. */
const ABSENT = [
  ["null", null],
  ["undefined", undefined],
  ["NaN", NaN],
] as const;

describe("a long with no target", () => {
  // THE DISQUALIFYING CASE. Unguarded, every one of these ticks closed the
  // position at 0 and called it a take profit.
  const long = () => order({ direction: "buy", stop: 99, target: null as unknown as number });

  it("stays open through prices that would have hit the coerced target", () => {
    // Every price here is above the real stop of 99, so the ONLY thing that
    // could close the position is the absent target. 63,000 is deliberate: an
    // absurd number still must not satisfy a level that does not exist.
    for (const price of [100.5, 100, 99.5, 99.01, 63_000]) {
      expect(exitFor(long(), price), `price ${price}`).toBeNull();
    }
  });

  it("still closes on its real stop, so the series is not inert", () => {
    const hit = exitFor(long(), 98.9);
    expect(hit?.reason).toBe("stop_loss");
    // Gapped through the stop, so the trader eats the gap: min(98.9, 99).
    expect(hit?.closePrice).toBe(98.9);
    // At the level exactly there is no gap to eat.
    expect(exitFor(long(), 99)?.closePrice).toBe(99);
  });

  it("never reports a take profit at all", () => {
    for (const price of [100.5, 101, 500, 98.9]) {
      expect(exitFor(long(), price)?.reason).not.toBe("take_profit");
    }
  });

  it.each(ABSENT)("treats a %s target as absent", (_label, value) => {
    expect(exitFor(order({ direction: "buy", stop: 99, target: value as unknown as number }), 100.5)).toBeNull();
  });
});

describe("a short with no stop", () => {
  // The mirror failure: unguarded, this stopped out instantly on any tick.
  const short = () => order({ direction: "sell", stop: null as unknown as number, target: 99 });

  it("stays open through prices that would have hit the coerced stop", () => {
    // Every price here is above the real target of 99, so the only thing that
    // could close the position is the absent stop.
    for (const price of [99.5, 100, 100.5, 63_000]) {
      expect(exitFor(short(), price), `price ${price}`).toBeNull();
    }
  });

  it("still closes on its real target, so the series is not inert", () => {
    const hit = exitFor(short(), 98.9);
    expect(hit?.reason).toBe("take_profit");
    expect(hit?.closePrice).toBe(99);
  });

  it("never reports a stop loss at all", () => {
    for (const price of [100.5, 101, 500, 98.9]) {
      expect(exitFor(short(), price)?.reason).not.toBe("stop_loss");
    }
  });

  it.each(ABSENT)("treats a %s stop as absent", (_label, value) => {
    expect(exitFor(order({ direction: "sell", stop: value as unknown as number, target: 99 }), 100.5)).toBeNull();
  });
});

describe("a position with neither level", () => {
  it("never exits on its own, in either direction, at any price", () => {
    const prices = [0.5, 50, 99, 100, 101, 63_000];
    for (const direction of ["buy", "sell"] as const) {
      const o = order({
        direction,
        stop: null as unknown as number,
        target: null as unknown as number,
      });
      for (const price of prices) {
        expect(exitFor(o, price), `${direction} @ ${price}`).toBeNull();
      }
    }
  });
});

describe("the mirrored cases still behave normally", () => {
  // Guards the opposite regression: a guard applied too broadly would make
  // every position unclosable, and the suites above would pass regardless.
  it("a long with no stop still takes its target", () => {
    const o = order({ direction: "buy", stop: null as unknown as number, target: 101 });
    expect(exitFor(o, 100.5)).toBeNull();
    expect(exitFor(o, 101)?.reason).toBe("take_profit");
  });

  it("a short with no target still hits its stop", () => {
    const o = order({ direction: "sell", stop: 101, target: null as unknown as number });
    expect(exitFor(o, 100.5)).toBeNull();
    expect(exitFor(o, 101)?.reason).toBe("stop_loss");
  });

  it("a fully levelled position is untouched by the guards", () => {
    const o = order({ direction: "buy", stop: 99, target: 101 });
    expect(exitFor(o, 100)).toBeNull();
    expect(exitFor(o, 99)?.reason).toBe("stop_loss");
    expect(exitFor(o, 101)?.reason).toBe("take_profit");
  });
});

describe("no exit ever reports a zero or absent close price", () => {
  // The specific corruption that reached the trade tape: closePrice null -> 0.
  it("across every level combination and a wide price sweep", () => {
    const combos: Array<Partial<PositionOrder>> = [
      { stop: 99, target: null as unknown as number },
      { stop: null as unknown as number, target: 101 },
      { stop: null as unknown as number, target: null as unknown as number },
      { stop: 99, target: 101 },
    ];
    for (const direction of ["buy", "sell"] as const) {
      for (const combo of combos) {
        const o = order({ direction, ...combo });
        for (let price = 0.5; price <= 200; price += 0.5) {
          const exit = exitFor(o, price);
          if (!exit) continue;
          expect(Number.isFinite(exit.closePrice), `${direction} @ ${price}`).toBe(true);
          expect(exit.closePrice, `${direction} @ ${price}`).toBeGreaterThan(0);
        }
      }
    }
  });
});

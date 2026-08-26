// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { DrawingStore } from "@/lib/chart/drawings/store";
import { PositionOrderStore } from "@/lib/chart/orders/store";
import { placeOrEditOrder, updatePositionLevels, runEngineTick } from "@/lib/chart/orders/service";
import { exitFor } from "@/lib/chart/orders/engine";
import { applyBreakEven, applyTrailing, advancedMetrics } from "@/lib/chart/orders/position-manager";
import { validateOrder, withLevels, hasLevel, levelDistance, ratioOf } from "@/lib/chart/orders/model";
import type { OrderDraft, PositionOrder } from "@/lib/chart/orders/model";
import type { Drawing } from "@/lib/chart/drawings/types";

/**
 * RS-4 · Stage A — levels are optional, and every consequence of that.
 *
 * Stage 1 and Stage A' guarded the READ paths (`exitFor`, `riskBasisOf`) while
 * the type still said `number`. Stage A makes the type tell the truth, which
 * moves the risk somewhere new: absent and present must now be distinguishable
 * at every WRITE, and the two spellings of "no argument" — `undefined` and
 * `null` — stop being synonyms.
 *
 * Every case here was mutation-verified: the fix was temporarily reverted and
 * the case confirmed to fail. Where the mutation is not obvious it is named in
 * the test's own comment.
 *
 * No costs anywhere, so every threshold can be checked by hand.
 */

const style = { color: "#fff", width: 1, lineStyle: 0 as const, fillOpacity: 0.1, fontSize: 12 };
const ENTRY = 63_000;

function drawing(id: string): Drawing {
  return {
    id,
    kind: "long_position",
    points: [
      { time: 1_000, price: ENTRY },
      { time: 2_000, price: ENTRY },
      { time: 2_000, price: ENTRY },
    ],
    style,
    createdAt: 0,
  };
}

function makeStores(ids: string[] = ["d1"]) {
  const drawings = new DrawingStore();
  drawings.setScope(`test-${Math.random().toString(36).slice(2)}`);
  for (const id of ids) drawings.add(drawing(id));
  const orders = new PositionOrderStore();
  orders.setScope(`test-${Math.random().toString(36).slice(2)}`);
  return { drawings, orders };
}

function draft(over: Partial<OrderDraft> = {}): OrderDraft {
  return {
    symbol: "BTC/USDT",
    direction: "buy",
    orderType: "market",
    entry: ENTRY,
    stop: null,
    target: null,
    size: 1,
    drawingId: "d1",
    ...over,
  };
}

/* ═══════════════════════════════════════════════════════════════════
   1 · The primitives
   ═══════════════════════════════════════════════════════════════════ */

describe("level primitives", () => {
  it("hasLevel treats null, undefined and NaN as the same statement", () => {
    // NaN is the one that matters: it is number-typed, and NaN comparisons are
    // quietly false, so an unguarded NaN reads as "never triggers" while
    // actually meaning "silently unprotected".
    expect(hasLevel(null)).toBe(false);
    expect(hasLevel(undefined)).toBe(false);
    expect(hasLevel(NaN)).toBe(false);
    expect(hasLevel(Infinity)).toBe(false);
    expect(hasLevel(0)).toBe(true);
    expect(hasLevel(62_000)).toBe(true);
  });

  it("levelDistance returns null rather than the whole price", () => {
    // The exact bug Stage A' measured: `fill - null` is `fill - 0`, so an
    // absent stop reported a risk distance of 63000 — large, finite, fictional.
    expect(levelDistance(ENTRY, null)).toBeNull();
    expect(levelDistance(ENTRY, undefined)).toBeNull();
    expect(levelDistance(ENTRY, NaN)).toBeNull();
    expect(levelDistance(ENTRY, 62_000)).toBe(1_000);
  });

  it("ratioOf refuses to divide by an absent or zero risk", () => {
    expect(ratioOf(2_000, null)).toBeNull();
    expect(ratioOf(null, 1_000)).toBeNull();
    expect(ratioOf(2_000, 0)).toBeNull();
    expect(ratioOf(2_000, 1_000)).toBe(2);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   2 · validateOrder — optional levels are a MARKET-ORDER privilege
   ═══════════════════════════════════════════════════════════════════ */

describe("validateOrder · market orders may open bare", () => {
  it("accepts a market order with no stop and no target", () => {
    expect(validateOrder(draft()).ok).toBe(true);
  });

  it("accepts a market order with a stop but no target", () => {
    // RS-3 named this the sensible middle: an unset target carries no risk,
    // an unset stop does.
    expect(validateOrder(draft({ stop: 62_000 })).ok).toBe(true);
  });

  it("still rejects a level on the wrong side when it DOES exist", () => {
    // The relaxation must not become "levels are never checked". Mutation:
    // dropping the hasLevel guard makes this pass vacuously, which is why it
    // is paired with the accepting cases above.
    const res = validateOrder(draft({ stop: 64_000 }));
    expect(res.ok).toBe(false);
    expect(res.errors.join(" ")).toMatch(/stop loss must be below entry/i);
  });

  it("still rejects a zero-distance stop — the dead end RS-4 documented", () => {
    const res = validateOrder(draft({ stop: ENTRY, target: 64_000 }));
    expect(res.ok).toBe(false);
    expect(res.errors.join(" ")).toMatch(/Risk is zero or negative/i);
  });

  it("REJECTS a resting order missing either level", () => {
    // The half of the rule that is inferred rather than observed (RS-4).
    for (const orderType of ["buy_limit", "buy_stop"] as const) {
      expect(validateOrder(draft({ orderType, entry: 62_000 })).ok).toBe(false);
      expect(validateOrder(draft({ orderType, entry: 62_000, stop: 61_000 })).ok).toBe(false);
      expect(validateOrder(draft({ orderType, entry: 62_000, target: 64_000 })).ok).toBe(false);
    }
  });

  it("a bare market order reaches the store with both levels null", () => {
    const stores = makeStores();
    const res = placeOrEditOrder(stores, draft(), { marketPrice: ENTRY });
    expect(res.ok).toBe(true);
    const order = stores.orders.list()[0];
    expect(order.stop).toBeNull();
    expect(order.target).toBeNull();
    // Derived values follow: no risk, no reward, no ratio — not zeros.
    expect(order.risk).toBeNull();
    expect(order.reward).toBeNull();
    expect(order.rr).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════
   3 · A stopless position SURVIVES ticks — RS-4's named deliverable
   ═══════════════════════════════════════════════════════════════════ */

describe("a stopless position survives the ticks that used to close it", () => {
  let stores: ReturnType<typeof makeStores>;
  beforeEach(() => { stores = makeStores(); });

  /**
   * `exitFor` is asserted DIRECTLY as well as through the store, because the
   * two are not equivalent and the difference was found by mutation.
   *
   * Removing the guard makes a targetless long return a take_profit intent at
   * `closePrice: null`. That intent is then rejected downstream by
   * `closePosition`'s own `Number.isFinite(opts.price)` check, so the position
   * stays open and a store-level assertion still passes — the bug is real and
   * invisible one layer up. Two layers of protection is good; a test that only
   * ever sees the outer one is not.
   */
  function bareOrder(over: Partial<PositionOrder> = {}): PositionOrder {
    return {
      id: "o1", symbol: "BTC/USDT", direction: "buy", orderType: "market",
      entry: ENTRY, fillPrice: ENTRY, stop: null, target: null,
      risk: null, reward: null, rr: null,
      size: 1, status: "open", drawingId: "d1", createdAt: 0, updatedAt: 0,
      ...over,
    } as PositionOrder;
  }

  it("exitFor itself produces NO intent for an absent level", () => {
    // long, no target: the raw comparison made `63000 >= null` true.
    expect(exitFor(bareOrder(), ENTRY)).toBeNull();
    expect(exitFor(bareOrder(), 1)).toBeNull();
    // short, no stop: the raw comparison made `63000 >= null` true here too.
    expect(exitFor(bareOrder({ direction: "sell" }), ENTRY * 2)).toBeNull();
    // NOT vacuous: a real level on the same order still produces an intent.
    expect(exitFor(bareOrder({ target: ENTRY + 500 }), ENTRY + 600)?.reason).toBe("take_profit");
    expect(exitFor(bareOrder({ stop: ENTRY - 500 }), ENTRY - 600)?.reason).toBe("stop_loss");
  });

  it("a long with no target does not take profit at price 0", () => {
    placeOrEditOrder(stores, draft(), { marketPrice: ENTRY });
    runEngineTick(stores, { price: ENTRY, time: 1 });
    expect(stores.orders.list()[0].status).toBe("open");

    // Every one of these would have fired targetHit under the raw comparison,
    // booking a "take_profit" at closePrice 0.
    for (const price of [ENTRY, ENTRY * 1.5, ENTRY * 0.5, 1]) {
      runEngineTick(stores, { price, time: 2 });
      expect(stores.orders.list()[0].status).toBe("open");
    }

    // NOT vacuous: give it a target and the very next tick closes it.
    updatePositionLevels(stores, stores.orders.list()[0].id, { target: ENTRY + 500 });
    runEngineTick(stores, { price: ENTRY + 600, time: 3 });
    expect(stores.orders.list()[0].status).toBe("closed");
    expect(stores.orders.list()[0].closeReason).toBe("take_profit");
  });

  it("a short with no stop does not stop out immediately", () => {
    placeOrEditOrder(stores, draft({ direction: "sell" }), { marketPrice: ENTRY });
    runEngineTick(stores, { price: ENTRY, time: 1 });
    expect(stores.orders.list()[0].status).toBe("open");

    for (const price of [ENTRY, ENTRY * 2, ENTRY * 0.5]) {
      runEngineTick(stores, { price, time: 2 });
      expect(stores.orders.list()[0].status).toBe("open");
    }

    // NOT vacuous: a real stop above the entry closes the short.
    updatePositionLevels(stores, stores.orders.list()[0].id, { stop: ENTRY + 500 });
    runEngineTick(stores, { price: ENTRY + 600, time: 3 });
    expect(stores.orders.list()[0].status).toBe("closed");
    expect(stores.orders.list()[0].closeReason).toBe("stop_loss");
  });
});

/* ═══════════════════════════════════════════════════════════════════
   4 · undefined is not null — "leave it alone" vs "remove it"
   ═══════════════════════════════════════════════════════════════════ */

describe("undefined leaves a level alone; null removes it", () => {
  let stores: ReturnType<typeof makeStores>;
  beforeEach(() => { stores = makeStores(); });

  function openWithLevels(): string {
    placeOrEditOrder(stores, draft({ stop: 62_000, target: 65_000 }), { marketPrice: ENTRY });
    runEngineTick(stores, { price: ENTRY, time: 1 });
    return stores.orders.list()[0].id;
  }

  it("omitting a key preserves that level", () => {
    const id = openWithLevels();
    updatePositionLevels(stores, id, { target: 66_000 });
    const o = stores.orders.list()[0];
    expect(o.stop).toBe(62_000);
    expect(o.target).toBe(66_000);
  });

  it("passing null REMOVES the stop", () => {
    /**
     * The mutation that matters. Restoring the old
     *   Number.isFinite(levels.stop ?? NaN) ? levels.stop : order.stop
     * makes this fail with 62000 — the trader asked to remove protection and
     * silently kept it. The disqualifying case is not a wrong number on screen,
     * it is a position whose risk state disagrees with the instruction.
     */
    const id = openWithLevels();
    updatePositionLevels(stores, id, { stop: null });
    expect(stores.orders.list()[0].stop).toBeNull();
    expect(stores.orders.list()[0].target).toBe(65_000);
  });

  it("a removed stop also stops being able to close the position", () => {
    // Removal is not merely cosmetic: the engine must agree.
    const id = openWithLevels();
    updatePositionLevels(stores, id, { stop: null });
    runEngineTick(stores, { price: 61_000, time: 2 });
    expect(stores.orders.list()[0].status).toBe("open");
  });

  it("withLevels distinguishes the two spellings directly", () => {
    const base = { entry: ENTRY, stop: 62_000, target: 65_000 } as PositionOrder;
    expect(withLevels(base, {}).stop).toBe(62_000);
    expect(withLevels(base, { stop: null }).stop).toBeNull();
    expect(withLevels(base, { stop: 61_500 }).stop).toBe(61_500);
    // Derived values follow the removal rather than lagging it.
    expect(withLevels(base, { stop: null }).risk).toBeNull();
    expect(withLevels(base, { stop: null }).rr).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════
   5 · breakEven and trailing refuse without a stop
   ═══════════════════════════════════════════════════════════════════ */

describe("stop-dependent operations refuse when there is no stop", () => {
  function bare(over: Partial<PositionOrder> = {}): PositionOrder {
    return {
      id: "o1", symbol: "BTC/USDT", direction: "buy", orderType: "market",
      entry: ENTRY, fillPrice: ENTRY, stop: null, target: null,
      risk: null, reward: null, rr: null,
      size: 1, status: "open",
      drawingId: "d1", createdAt: 0, updatedAt: 0,
      ...over,
    } as PositionOrder;
  }

  it("breakEven refuses, and says why", () => {
    // Break-even MOVES a stop. Quietly creating one at the entry would be a
    // different action wearing break-even's name.
    const res = applyBreakEven(bare(), { price: ENTRY + 1_000 });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/no stop to move/i);
  });

  it("breakEven still works when a stop exists", () => {
    // Pairing case — without this the refusal above could be a blanket "no".
    const res = applyBreakEven(bare({ stop: 62_000 }), { price: ENTRY + 1_000 });
    expect(res.ok).toBe(true);
  });

  it("applyTrailing refuses rather than ratcheting from nothing", () => {
    /**
     * nextTrailingStop's monotonic guard compares a candidate against the
     * CURRENT stop. With none there is nothing to compare against, so removing
     * this guard lets the trail accept whatever its formula produces —
     * inventing protection the trader never set.
     */
    const trailing = { active: true, mode: "fixed" as const, distance: 500 };
    const res = applyTrailing(bare({ trailing }), { price: ENTRY + 2_000 });
    expect(res).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════
   6 · Displayed R is absent, not zero
   ═══════════════════════════════════════════════════════════════════ */

describe("R is null rather than 0 when there is no stop", () => {
  /**
   * Found by the BROWSER, not by these tests.
   *
   * `initialRiskAmount` returns 0 for a stopless position — Stage A' chose 0
   * because this module's convention was already "0 means no basis". That is
   * survivable inside the module and fatal at the blotter, where the R column
   * rendered "0.00": a real flat result, on a position with no risk to measure
   * against at all. The unit suite passed throughout, because it asserted the
   * store and never the rendered row.
   *
   * The lesson is in the pairing below: `null` and `0` are both falsy, so any
   * assertion written as `expect(r).toBeFalsy()` would have passed against the
   * bug. Each case asserts the exact value.
   */
  function pos(over: Partial<PositionOrder> = {}): PositionOrder {
    return {
      id: "o1", symbol: "BTC/USDT", direction: "buy", orderType: "market",
      entry: ENTRY, fillPrice: ENTRY, stop: null, target: null,
      risk: null, reward: null, rr: null,
      size: 1, status: "open", drawingId: "d1", createdAt: 0, updatedAt: 0,
      ...over,
    } as PositionOrder;
  }

  it("floatingR, realizedR and totalR are null with no stop", () => {
    const m = advancedMetrics(pos(), ENTRY + 1_000);
    expect(m).not.toBeNull();
    if (!m) return;
    expect(m.floatingR).toBeNull();
    expect(m.realizedR).toBeNull();
    expect(m.totalR).toBeNull();
    // Explicitly NOT zero — the value the blotter was printing as "0.00R".
    expect(m.totalR).not.toBe(0);
  });

  it("the same position with a stop reports real numbers", () => {
    // Pairing case: without it, returning null unconditionally would pass.
    const m = advancedMetrics(pos({ stop: ENTRY - 1_000 }), ENTRY + 1_000);
    expect(m).not.toBeNull();
    if (!m) return;
    expect(m.floatingR).toBeCloseTo(1, 6);
    expect(m.totalR).toBeCloseTo(1, 6);
  });

  it("risk, locked profit and distances are null with no stop too", () => {
    const m = advancedMetrics(pos(), ENTRY + 1_000);
    expect(m).not.toBeNull();
    if (!m) return;
    expect(m.remainingRisk).toBeNull();
    expect(m.lockedProfit).toBeNull();
    expect(m.currentRR).toBeNull();
    expect(m.distanceToStop).toBeNull();
    expect(m.distanceToTarget).toBeNull();
    // Money is still real: P/L does not depend on a stop.
    expect(m.floatingPnl).toBeCloseTo(1_000, 6);
  });
});

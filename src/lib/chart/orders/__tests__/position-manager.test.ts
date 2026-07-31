/**
 * Phase 6 — Advanced position management.
 *
 * These tests pin the invariants that make advanced management safe:
 * one position id across every leg, an append-only execution tape, R measured
 * against the ORIGINAL risk, monotonic trailing, break-even applied at most
 * once, and exactly ONE immutable ClosedTrade per position no matter how many
 * partials, scale-ins or take-profit legs preceded the flat.
 */

import { describe, expect, it } from "vitest";
import { DrawingStore } from "@/lib/chart/drawings/store";
import { PositionOrderStore } from "../store";
import { ClosedTradeStore } from "../trade-store";
import { createOrder, type OrderDraft, type PositionOrder } from "../model";
import { aggregateExecutions, orderedExecutions } from "../executions";
import { defaultLadder, makeTakeProfit, validateLadder } from "../take-profit";
import { nextTrailingStop, improvesStop } from "../trailing";
import {
  advancedMetrics, applyBreakEven, type ManageResult, applyTrailing, evaluateAutoBreakEven, evaluateTakeProfits,
  openExecution, partialClose, remainingQuantityOf, scaleIn, scaleOut,
} from "../position-manager";
import {
  closePosition, fillOrder, partialClosePosition, runManagementTick, scaleInPosition,
  setAutoBreakEven, setTakeProfits, setTrailing,
} from "../service";

/** Narrow a ManageResult to its success branch — tests assert on success. */
function ok(res: ManageResult) {
  if (!res.ok) throw new Error(res.error);
  return res;
}

/** Same, for the break-even result shape. */
function beOk(res: { ok: boolean; order?: PositionOrder; error?: string }) {
  if (!res.ok || !res.order) throw new Error(res.error ?? "break-even failed");
  return res.order;
}

function longDraft(over: Partial<OrderDraft> = {}): OrderDraft {
  return {
    symbol: "BTCUSDT", direction: "buy", orderType: "buy_limit",
    entry: 100, stop: 90, target: 130, size: 10, drawingId: "d1", ...over,
  };
}

/** A live long: 10 units from 100, stop 90 (risk 10/unit → 100 total). */
function openLong(over: Partial<OrderDraft> = {}) {
  const order = createOrder(longDraft(over));
  const filled = {
    ...order,
    status: "open" as const,
    fillPrice: order.entry,
    filledAt: 1_000,
    positionId: order.positionId ?? "p1",
  };
  return openExecution(filled, 1_000);
}

function makeStores() {
  const drawings = new DrawingStore();
  drawings.hydrate("BTCUSDT");
  const orders = new PositionOrderStore();
  orders.hydrate("BTCUSDT");
  const trades = new ClosedTradeStore();
  trades.hydrate("BTCUSDT");
  const drawingId = drawings.add({
    kind: "long_position",
    points: [{ time: 1, price: 100 }, { time: 2, price: 130 }, { time: 3, price: 90 }],
    style: { color: "#fff", width: 1, lineStyle: 0, fillOpacity: 0.2, fontSize: 11 },
  } as never);
  return { drawings, orders, trades, drawingId: typeof drawingId === "string" ? drawingId : "d1" };
}

function livePosition(stores: ReturnType<typeof makeStores>, over: Partial<OrderDraft> = {}) {
  const order = createOrder(longDraft({ drawingId: stores.drawingId, ...over }));
  stores.orders.add(order);
  const filled = fillOrder(
    stores,
    { kind: "fill", orderId: order.id, fillPrice: order.entry, slippage: 0, executionSource: "limit_touch" },
    1_000,
  );
  return filled!;
}

/* ── execution tape ──────────────────────────────────────────────────── */

describe("execution tape", () => {
  it("seeds an open leg carrying the full quantity", () => {
    const o = openLong();
    expect(o.executions).toHaveLength(1);
    expect(o.executions![0].kind).toBe("open");
    expect(o.executions![0].quantity).toBe(10);
    expect(remainingQuantityOf(o)).toBe(10);
  });

  it("is append-only and ordered by sequence", () => {
    let o = openLong();
    o = ok(partialClose(o, { percent: 50, price: 110 })).order;
    o = ok(scaleIn(o, { percent: 20, price: 105 })).order;
    const seq = orderedExecutions(o.executions!).map((e) => e.seq);
    expect(seq).toEqual([...seq].sort((a, b) => a - b));
    expect(o.executions!.map((e) => e.kind)).toEqual(["open", "partial_close", "scale_in"]);
  });

  it("aggregates weighted entry, weighted exit and realized totals", () => {
    let o = openLong();
    o = ok(scaleIn(o, { quantity: 10, price: 120 })).order;   // avg entry 110
    o = ok(partialClose(o, { quantity: 10, price: 130 })).order;
    const agg = aggregateExecutions(o.executions!);
    expect(agg.averageEntry).toBeCloseTo(110, 6);
    expect(agg.averageExit).toBeCloseTo(130, 6);
    expect(agg.remainingQuantity).toBeCloseTo(10, 6);
  });
});

/* ── partial close ───────────────────────────────────────────────────── */

describe("partial close", () => {
  it("keeps the same position id, entry and drawing", () => {
    const o = openLong();
    const res = ok(partialClose(o, { percent: 50, price: 110 }));
    expect(res.ok).toBe(true);
    expect(res.order.positionId).toBe(o.positionId);
    expect(res.order.entry).toBe(o.entry);
    expect(res.order.drawingId).toBe(o.drawingId);
    expect(res.flat).toBe(false);
  });

  it("realizes P/L and R on the closed portion only", () => {
    const o = openLong();
    const res = ok(partialClose(o, { percent: 50, price: 110 }));
    // 5 units × +10 = +50 on a 100 risk basis → +0.5R
    expect(res.execution!.realizedPnl).toBeCloseTo(50, 6);
    expect(res.execution!.realizedR).toBeCloseTo(0.5, 6);
    expect(remainingQuantityOf(res.order)).toBeCloseTo(5, 6);
  });

  it("flags flat — and never closes the position itself", () => {
    const o = openLong();
    const res = ok(partialClose(o, { percent: 100, price: 110 }));
    expect(res.flat).toBe(true);
    expect(res.order.status).toBe("open");
    expect(remainingQuantityOf(res.order)).toBe(0);
  });

  it("rejects invalid quantities and dead positions", () => {
    const o = openLong();
    expect(partialClose(o, { percent: 0, price: 110 }).ok).toBe(false);
    expect(partialClose(o, { percent: 50, price: 0 }).ok).toBe(false);
    expect(partialClose({ ...o, status: "closed" }, { percent: 50, price: 110 }).ok).toBe(false);
  });

  it("scale-out is a partial close tagged as manual", () => {
    const o = openLong();
    const res = ok(scaleOut(o, { percent: 25, price: 110 }));
    expect(res.execution!.kind).toBe("scale_out");
  });
});

/* ── scale in ────────────────────────────────────────────────────────── */

describe("scale in", () => {
  it("recomputes the weighted average entry and re-derives RR", () => {
    const o = openLong();
    const res = ok(scaleIn(o, { quantity: 10, price: 120 }));
    expect(res.order.entry).toBeCloseTo(110, 6);
    expect(res.order.fillPrice).toBeCloseTo(110, 6);
    expect(res.order.risk).toBeCloseTo(20, 6);   // 110 − 90
    expect(res.order.reward).toBeCloseTo(20, 6); // 130 − 110
    expect(remainingQuantityOf(res.order)).toBeCloseTo(20, 6);
  });

  it("does NOT re-base R: closed legs keep their original denominator", () => {
    let o = openLong();
    const first = ok(partialClose(o, { quantity: 5, price: 110 }));
    o = ok(scaleIn(first.order!, { quantity: 10, price: 120 })).order;
    expect(o.riskBasis).toBe(first.order!.riskBasis);
    const agg = aggregateExecutions(o.executions!);
    expect(agg.realizedR).toBeCloseTo(0.5, 6);
  });
});

/* ── break-even ──────────────────────────────────────────────────────── */

describe("break-even engine", () => {
  it("refuses while the trade is not in profit", () => {
    const o = openLong();
    expect(applyBreakEven(o, { price: 95 }).ok).toBe(false);
  });

  it("moves the stop to the weighted entry exactly once", () => {
    const o = openLong();
    const first = applyBreakEven(o, { price: 110 });
    expect(first.ok).toBe(true);
    expect(first.order!.stop).toBeCloseTo(100, 6);
    expect(applyBreakEven(first.order!, { price: 115 }).ok).toBe(false);
  });

  it("auto break-even fires only past the configured R trigger", () => {
    const o = { ...openLong(), autoBreakEvenR: 1 };
    expect(evaluateAutoBreakEven(o, 105)).toBeNull();   // +0.5R
    expect(evaluateAutoBreakEven(o, 111)).not.toBeNull(); // +1.1R
  });
});

/* ── trailing ────────────────────────────────────────────────────────── */

describe("trailing stop engine", () => {
  it("only ever tightens — never loosens", () => {
    expect(improvesStop("buy", 100, 105)).toBe(true);
    expect(improvesStop("buy", 100, 95)).toBe(false);
    expect(improvesStop("sell", 100, 95)).toBe(true);
    expect(improvesStop("sell", 100, 105)).toBe(false);
  });

  it("computes an ATR candidate below price for a long", () => {
    const stop = nextTrailingStop(
      { direction: "buy", stop: 90 },
      { mode: "atr", active: true, atrMultiple: 2 },
      { price: 120, atr: 5 },
    );
    expect(stop).toBeCloseTo(110, 6);
  });

  it("ignores a mode whose market input is missing", () => {
    const stop = nextTrailingStop(
      { direction: "buy", stop: 90 },
      { mode: "ema", active: true },
      { price: 120 },
    );
    expect(stop).toBeNull();
  });

  it("never moves the stop backwards through applyTrailing", () => {
    const o = { ...openLong(), stop: 115, trailing: { mode: "atr" as const, active: true, atrMultiple: 2 } };
    const res = applyTrailing(o, { price: 120, atr: 5 });
    expect(res).toBeNull(); // candidate 110 is worse than the live 115
  });
});

/* ── take-profit ladder ──────────────────────────────────────────────── */

describe("take-profit ladder", () => {
  it("rejects allocations above 100% and non-positive prices", () => {
    expect(validateLadder([makeTakeProfit(1, 110, 60), makeTakeProfit(2, 120, 60)]).length).toBeGreaterThan(0);
    expect(validateLadder([makeTakeProfit(1, 0, 50)]).length).toBeGreaterThan(0);
    expect(validateLadder(defaultLadder("buy", 100, 130))).toEqual([]);
  });

  it("fills legs in order and allocates against the ORIGINAL quantity", () => {
    const o = { ...openLong(), takeProfits: [makeTakeProfit(1, 110, 25), makeTakeProfit(2, 120, 25)] };
    const first = evaluateTakeProfits(o, 112, 2_000);
    expect(first.steps).toHaveLength(1);
    expect(remainingQuantityOf(first.order)).toBeCloseTo(7.5, 6);

    const second = evaluateTakeProfits(first.order, 125, 3_000);
    expect(second.steps).toHaveLength(1);
    expect(remainingQuantityOf(second.order)).toBeCloseTo(5, 6);
    expect(second.flat).toBe(false);
  });

  it("does not re-fire a leg that already filled", () => {
    const o = { ...openLong(), takeProfits: [makeTakeProfit(1, 110, 50)] };
    const first = evaluateTakeProfits(o, 115, 2_000);
    const again = evaluateTakeProfits(first.order, 118, 3_000);
    expect(again.steps).toHaveLength(0);
  });

  it("goes flat when the ladder allocates the whole position", () => {
    const o = { ...openLong(), takeProfits: [makeTakeProfit(1, 110, 100)] };
    const res = evaluateTakeProfits(o, 111, 2_000);
    expect(res.flat).toBe(true);
    expect(remainingQuantityOf(res.order)).toBe(0);
  });
});

/* ── live metrics ────────────────────────────────────────────────────── */

describe("live position metrics", () => {
  it("splits floating, realized and total R", () => {
    let o = openLong();
    o = ok(partialClose(o, { percent: 50, price: 110 })).order;
    const m = advancedMetrics(o, 120)!;
    expect(m.remainingQuantity).toBeCloseTo(5, 6);
    expect(m.closedPercent).toBeCloseTo(50, 6);
    expect(m.realizedPnl).toBeCloseTo(50, 6);
    expect(m.realizedR).toBeCloseTo(0.5, 6);
    expect(m.floatingPnl).toBeCloseTo(100, 6); // 5 × +20
    expect(m.floatingR).toBeCloseTo(1, 6);
    expect(m.totalR).toBeCloseTo(1.5, 6);
  });

  it("reports locked profit once the stop is at break-even", () => {
    let o = openLong();
    o = ok(partialClose(o, { percent: 50, price: 110 })).order;
    o = applyBreakEven(o, { price: 110 }).order!;
    const m = advancedMetrics(o, 120)!;
    expect(m.remainingRisk).toBeCloseTo(0, 6);
    expect(m.lockedProfit).toBeCloseTo(50, 6);
  });
});

/* ── service orchestration & closure ─────────────────────────────────── */

describe("service — advanced management", () => {
  it("produces exactly ONE closed trade after many partials", () => {
    const stores = makeStores();
    const order = livePosition(stores);
    partialClosePosition(stores, order.id, { percent: 25, price: 110 });
    partialClosePosition(stores, order.id, { percent: 50, price: 115 });
    const res = closePosition(stores, order.id, { price: 120, reason: "manual" });
    expect(res).not.toBeNull();
    expect(stores.trades.list()).toHaveLength(1);
    expect(stores.trades.list()[0].positionId).toBe(order.positionId);
  });

  it("closes through the tape when the last partial goes flat", () => {
    const stores = makeStores();
    const order = livePosition(stores);
    partialClosePosition(stores, order.id, { percent: 50, price: 110 });
    const res = partialClosePosition(stores, order.id, { percent: 100, price: 120 });
    expect(res.ok && res.flat).toBe(true);
    expect(stores.trades.list()).toHaveLength(1);
    const trade = stores.trades.list()[0];
    // weighted exit of 5 @ 110 and 5 @ 120
    expect(trade.exitPrice).toBeCloseTo(115, 6);
  });

  it("scale-in keeps one position and one trade", () => {
    const stores = makeStores();
    const order = livePosition(stores);
    scaleInPosition(stores, order.id, { percent: 100, price: 120 });
    const after = stores.orders.byId(order.id)!;
    expect(after.entry).toBeCloseTo(110, 6);
    expect(stores.orders.positions()).toHaveLength(1);
    closePosition(stores, order.id, { price: 130, reason: "manual" });
    expect(stores.trades.list()).toHaveLength(1);
  });

  it("runs the ladder, auto break-even and trailing on a management tick", () => {
    const stores = makeStores();
    const order = livePosition(stores);
    setTakeProfits(stores, order.id, [makeTakeProfit(1, 110, 50)]);
    setAutoBreakEven(stores, order.id, 1);
    setTrailing(stores, order.id, { mode: "atr", active: true, atrMultiple: 1 });

    runManagementTick(stores, { price: 112, context: { atr: 5 } });
    const after = stores.orders.byId(order.id)!;
    expect(remainingQuantityOf(after)).toBeCloseTo(5, 6);
    expect(after.stop).toBeGreaterThanOrEqual(100); // break-even or trailed above it
    expect(after.status).toBe("open");
  });

  it("is idempotent — a repeated tick at the same price changes nothing", () => {
    const stores = makeStores();
    const order = livePosition(stores);
    setTakeProfits(stores, order.id, [makeTakeProfit(1, 110, 50)]);
    runManagementTick(stores, { price: 112 });
    const snapshot = stores.orders.byId(order.id)!;
    runManagementTick(stores, { price: 112 });
    const again = stores.orders.byId(order.id)!;
    expect(again.executions!.length).toBe(snapshot.executions!.length);
  });
});

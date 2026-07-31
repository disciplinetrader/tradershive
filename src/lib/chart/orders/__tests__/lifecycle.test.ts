import { describe, expect, it, beforeEach } from "vitest";
import { DrawingStore } from "@/lib/chart/drawings/store";
import { PositionOrderStore } from "../store";
import { createOrder, livePositionMetrics, type OrderDraft } from "../model";
import { canTransition, isLive, transition } from "../lifecycle";
import { evaluateTick, fillPriceFor, triggersEntry } from "../engine";
import {
  archiveOrder, closePosition, fillOrder, moveStopToBreakEven, runEngineTick, updatePositionLevels,
} from "../service";

function longDraft(over: Partial<OrderDraft> = {}): OrderDraft {
  return {
    symbol: "BTCUSDT", direction: "buy", orderType: "buy_limit",
    entry: 100, stop: 90, target: 120, size: 1, drawingId: "d1", ...over,
  };
}

function makeStores() {
  const drawings = new DrawingStore();
  drawings.hydrate("BTCUSDT");
  const orders = new PositionOrderStore();
  orders.hydrate("BTCUSDT");
  const id = drawings.add({
    kind: "long_position",
    points: [{ time: 1, price: 100 }, { time: 2, price: 120 }, { time: 3, price: 90 }],
    style: { color: "#fff", width: 1, lineStyle: 0, fillOpacity: 0.2, fontSize: 11 },
  } as never);
  return { stores: { drawings, orders }, drawingId: typeof id === "string" ? id : "d1" };
}

describe("state machine", () => {
  it("allows only the documented edges", () => {
    expect(canTransition("pending", "filled")).toBe(true);
    expect(canTransition("filled", "open")).toBe(true);
    expect(canTransition("open", "closed")).toBe(true);
    expect(canTransition("closed", "archived")).toBe(true);
    expect(canTransition("pending", "cancelled")).toBe(true);
  });

  it("rejects every shortcut and invalid edge", () => {
    expect(canTransition("pending", "open")).toBe(false);
    expect(canTransition("pending", "closed")).toBe(false);
    expect(canTransition("open", "pending")).toBe(false);
    expect(canTransition("open", "filled")).toBe(false);
    expect(canTransition("closed", "open")).toBe(false);
    expect(canTransition("cancelled", "filled")).toBe(false);
    expect(canTransition("archived", "open")).toBe(false);
  });

  it("returns null instead of throwing on an illegal transition", () => {
    const o = createOrder(longDraft());
    expect(transition(o, "closed")).toBeNull();
  });

  it("classifies live states", () => {
    expect(isLive("filled")).toBe(true);
    expect(isLive("open")).toBe(true);
    expect(isLive("pending")).toBe(false);
    expect(isLive("closed")).toBe(false);
  });
});

describe("trigger conditions", () => {
  it("buy limit triggers at or below entry", () => {
    expect(triggersEntry("buy_limit", 100, 101)).toBe(false);
    expect(triggersEntry("buy_limit", 100, 100)).toBe(true);
    expect(triggersEntry("buy_limit", 100, 99)).toBe(true);
  });
  it("sell limit triggers at or above entry", () => {
    expect(triggersEntry("sell_limit", 100, 99)).toBe(false);
    expect(triggersEntry("sell_limit", 100, 101)).toBe(true);
  });
  it("buy stop triggers at or above entry", () => {
    expect(triggersEntry("buy_stop", 100, 99)).toBe(false);
    expect(triggersEntry("buy_stop", 100, 101)).toBe(true);
  });
  it("sell stop triggers at or below entry", () => {
    expect(triggersEntry("sell_stop", 100, 101)).toBe(false);
    expect(triggersEntry("sell_stop", 100, 99)).toBe(true);
  });
  it("market always triggers", () => {
    expect(triggersEntry("market", 100, 12345)).toBe(true);
  });
});

describe("fill model", () => {
  it("limit orders never get price improvement on a gap", () => {
    const o = createOrder(longDraft({ orderType: "buy_limit", entry: 100 }));
    expect(fillPriceFor(o, 95)).toEqual({ fillPrice: 100, slippage: 0 });
  });
  it("stop orders eat the gap as negative slippage", () => {
    const o = createOrder(longDraft({ orderType: "buy_stop", entry: 100, stop: 90, target: 130 }));
    const res = fillPriceFor(o, 105);
    expect(res.fillPrice).toBe(105);
    expect(res.slippage).toBe(5);
  });
  it("market orders fill at the observed price with no slippage charge", () => {
    const o = createOrder(longDraft({ orderType: "market", entry: 100 }));
    expect(fillPriceFor(o, 101)).toEqual({ fillPrice: 101, slippage: 0 });
  });
});

describe("execution engine", () => {
  let ctx: ReturnType<typeof makeStores>;
  beforeEach(() => { ctx = makeStores(); });

  it("fills a buy limit exactly once", () => {
    const order = createOrder(longDraft({ drawingId: ctx.drawingId }));
    ctx.stores.orders.add(order);

    const first = runEngineTick(ctx.stores, { price: 99 });
    expect(first).toHaveLength(1);
    expect(first[0].status).toBe("open");
    expect(first[0].fillPrice).toBe(100);

    // Replayed / repeated ticks must not produce a second fill.
    expect(runEngineTick(ctx.stores, { price: 98 })).toHaveLength(0);
    expect(runEngineTick(ctx.stores, { price: 99 })).toHaveLength(0);
    expect(ctx.stores.orders.positions()).toHaveLength(1);
  });

  it("preserves id, drawingId and createdAt across the fill", () => {
    const order = createOrder(longDraft({ drawingId: ctx.drawingId }));
    ctx.stores.orders.add(order);
    const [filled] = runEngineTick(ctx.stores, { price: 99 });
    expect(filled.id).toBe(order.id);
    expect(filled.drawingId).toBe(order.drawingId);
    expect(filled.createdAt).toBe(order.createdAt);
    expect(filled.positionId).toBeTruthy();
    expect(filled.filledAt).toBeTruthy();
    expect(filled.executionSource).toBe("trigger");
  });

  it("does not open and close a position on the same tick", () => {
    // Entry 100, stop 90: a tick at 100 fills; the stop is only evaluated next tick.
    const order = createOrder(longDraft({ drawingId: ctx.drawingId, entry: 100 }));
    ctx.stores.orders.add(order);
    const applied = runEngineTick(ctx.stores, { price: 100 });
    expect(applied).toHaveLength(1);
    expect(applied[0].status).toBe("open");
  });

  it("closes at the stop and charges the gap", () => {
    const order = createOrder(longDraft({ drawingId: ctx.drawingId }));
    ctx.stores.orders.add(order);
    runEngineTick(ctx.stores, { price: 100 });
    const [closed] = runEngineTick(ctx.stores, { price: 85 }); // gapped through 90
    expect(closed.status).toBe("closed");
    expect(closed.closeReason).toBe("stop_loss");
    expect(closed.closePrice).toBe(85);
    expect(closed.realizedPnl).toBe(-15);
  });

  it("closes at the target with no price improvement", () => {
    const order = createOrder(longDraft({ drawingId: ctx.drawingId }));
    ctx.stores.orders.add(order);
    runEngineTick(ctx.stores, { price: 100 });
    const [closed] = runEngineTick(ctx.stores, { price: 140 });
    expect(closed.closePrice).toBe(120);
    expect(closed.closeReason).toBe("take_profit");
    expect(closed.realizedR).toBe(2);
  });

  it("ignores cancelled and closed orders on later ticks", () => {
    const order = createOrder(longDraft({ drawingId: ctx.drawingId }));
    ctx.stores.orders.add(order);
    ctx.stores.orders.cancel(order.id);
    expect(evaluateTick(ctx.stores.orders.list(), { price: 50 })).toHaveLength(0);
  });
});

describe("position management", () => {
  let ctx: ReturnType<typeof makeStores>;
  let orderId: string;

  beforeEach(() => {
    ctx = makeStores();
    const order = createOrder(longDraft({ drawingId: ctx.drawingId }));
    ctx.stores.orders.add(order);
    orderId = order.id;
    runEngineTick(ctx.stores, { price: 100 });
  });

  it("drags the stop and target but never the entry", () => {
    const next = updatePositionLevels(ctx.stores, orderId, { stop: 95, target: 130 });
    expect(next?.stop).toBe(95);
    expect(next?.target).toBe(130);
    expect(next?.entry).toBe(100);
  });

  it("refuses break-even while the trade is not in profit", () => {
    const res = moveStopToBreakEven(ctx.stores, orderId, 98);
    expect(res.ok).toBe(false);
  });

  it("moves the stop to the fill price when in profit", () => {
    const res = moveStopToBreakEven(ctx.stores, orderId, 110);
    expect(res.ok).toBe(true);
    expect(ctx.stores.orders.byId(orderId)?.stop).toBe(100);
  });

  it("closes at market and records the realised result", () => {
    const closed = closePosition(ctx.stores, orderId, { price: 110 });
    expect(closed?.status).toBe("closed");
    expect(closed?.realizedPnl).toBe(10);
    expect(closed?.realizedR).toBe(1);
    // Second close is idempotent (Phase 4): it resolves to the same closed
    // order and its canonical trade, never a double exit.
    const again = closePosition(ctx.stores, orderId, { price: 115 });
    expect(again?.status).toBe("closed");
    expect(again?.closePrice).toBe(110);
    expect(again?.realizedPnl).toBe(10);

  });

  it("archives only after closing", () => {
    expect(archiveOrder(ctx.stores, orderId)).toBe(false); // still open
    closePosition(ctx.stores, orderId, { price: 110 });
    expect(archiveOrder(ctx.stores, orderId)).toBe(true);
    expect(ctx.stores.orders.byId(orderId)).toBeNull();
  });

  it("keeps a live position when its drawing is deleted", () => {
    ctx.stores.orders.reconcile(new Set<string>(), "test");
    expect(ctx.stores.orders.positions()).toHaveLength(1);
  });

  it("derives live metrics against the fill price", () => {
    const m = livePositionMetrics(ctx.stores.orders.byId(orderId)!, 110);
    expect(m?.pnl).toBe(10);
    expect(m?.r).toBe(1);
    expect(m?.pct).toBeCloseTo(10);
    expect(m?.toStop).toBe(20);
    expect(m?.toTarget).toBe(10);
  });
});

describe("fillOrder guards", () => {
  it("cannot fill an already open position", () => {
    const ctx = makeStores();
    const order = createOrder(longDraft({ drawingId: ctx.drawingId }));
    ctx.stores.orders.add(order);
    const intent = { kind: "fill" as const, orderId: order.id, fillPrice: 100, slippage: 0, executionSource: "trigger" as const };
    expect(fillOrder(ctx.stores, intent)).not.toBeNull();
    expect(fillOrder(ctx.stores, intent)).toBeNull();
  });
});

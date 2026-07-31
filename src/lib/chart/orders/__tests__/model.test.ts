import { describe, expect, it } from "vitest";
import {
  createOrder, draftFromDrawing, inferOrderType, validateOrder, withLevels,
  type OrderDraft,
} from "@/lib/chart/orders/model";
import type { Drawing } from "@/lib/chart/drawings/types";

const drawing = (kind: Drawing["kind"], entry: number, target: number, stop: number): Drawing => ({
  id: "d1",
  kind,
  points: [
    { time: 1_000, price: entry },
    { time: 2_000, price: target },
    { time: 2_000, price: stop },
  ],
  style: { color: "#fff", width: 1, lineStyle: 0, fillOpacity: 0.1, fontSize: 12 },
  createdAt: 0,
});

const draft = (over: Partial<OrderDraft> = {}): OrderDraft => ({
  symbol: "EUR/USD",
  direction: "buy",
  orderType: "market",
  entry: 1.1,
  stop: 1.09,
  target: 1.12,
  size: null,
  drawingId: "d1",
  ...over,
});

describe("inferOrderType", () => {
  it("buy above market is a stop, below market is a limit", () => {
    expect(inferOrderType("buy", 1.11, 1.1, 0.0001)).toBe("buy_stop");
    expect(inferOrderType("buy", 1.09, 1.1, 0.0001)).toBe("buy_limit");
  });
  it("sell below market is a stop, above market is a limit", () => {
    expect(inferOrderType("sell", 1.09, 1.1, 0.0001)).toBe("sell_stop");
    expect(inferOrderType("sell", 1.11, 1.1, 0.0001)).toBe("sell_limit");
  });
  it("entry at market is a market order", () => {
    expect(inferOrderType("buy", 1.1, 1.1, 0.0001)).toBe("market");
    expect(inferOrderType("sell", 1.10005, 1.1, 0.0001)).toBe("market");
  });
});

describe("validateOrder", () => {
  it("accepts a well-formed buy", () => {
    expect(validateOrder(draft()).ok).toBe(true);
  });
  it("rejects a buy with stop above entry", () => {
    const v = validateOrder(draft({ stop: 1.11 }));
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toMatch(/stop loss must be below entry/i);
  });
  it("rejects a sell with target above entry", () => {
    const v = validateOrder(draft({ direction: "sell", stop: 1.11, target: 1.12 }));
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toMatch(/take profit must be below entry/i);
  });
  it("rejects zero risk", () => {
    const v = validateOrder(draft({ stop: 1.1 }));
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toMatch(/risk is zero/i);
  });
  it("rejects a buy limit placed above the market", () => {
    const v = validateOrder(draft({ orderType: "buy_limit" }), { marketPrice: 1.05, tick: 0.0001 });
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toMatch(/below the current price/i);
  });
});

describe("order lifecycle", () => {
  it("derives a draft from a long position drawing", () => {
    const d = draftFromDrawing(drawing("long_position", 1.1, 1.12, 1.09), {
      symbol: "EUR/USD", marketPrice: 1.05, tick: 0.0001,
    });
    expect(d?.direction).toBe("buy");
    expect(d?.orderType).toBe("buy_stop");
  });

  it("creates a canonical pending order", () => {
    const o = createOrder(draft(), 123);
    expect(o.status).toBe("pending");
    expect(o.source).toBe("PositionTool");
    expect(o.rr).toBeCloseTo(2, 5);
    expect(o.createdAt).toBe(123);
    expect(o.updatedAt).toBe(123);
  });

  it("re-derives metrics when levels change", () => {
    const o = withLevels(createOrder(draft(), 1), { target: 1.13 }, 2);
    expect(o.reward).toBeCloseTo(0.03, 5);
    expect(o.rr).toBeCloseTo(3, 5);
    expect(o.updatedAt).toBe(2);
  });
});

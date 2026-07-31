// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { DrawingStore } from "@/lib/chart/drawings/store";
import { PositionOrderStore } from "@/lib/chart/orders/store";
import { cancelPendingOrder, cancelOrderForDrawing, placeOrEditOrder } from "@/lib/chart/orders/service";
import type { OrderDraft } from "@/lib/chart/orders/model";
import type { Drawing } from "@/lib/chart/drawings/types";

const style = { color: "#fff", width: 1, lineStyle: 0 as const, fillOpacity: 0.1, fontSize: 12 };

function drawing(id: string, entry = 1.1, target = 1.12, stop = 1.09): Drawing {
  return {
    id,
    kind: "long_position",
    points: [
      { time: 1_000, price: entry },
      { time: 2_000, price: target },
      { time: 2_000, price: stop },
    ],
    style,
    createdAt: 0,
  };
}

function draft(over: Partial<OrderDraft> = {}): OrderDraft {
  return {
    symbol: "EUR/USD",
    direction: "buy",
    orderType: "market",
    entry: 1.1,
    stop: 1.09,
    target: 1.12,
    size: null,
    drawingId: "d1",
    ...over,
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

describe("pending order edit", () => {
  let stores: ReturnType<typeof makeStores>;
  beforeEach(() => { stores = makeStores(["d1", "d2"]); });

  it("edit preserves order id and drawing id", () => {
    const first = placeOrEditOrder(stores, draft());
    expect(first.ok).toBe(true);
    const created = first.ok ? first.order : null;

    const second = placeOrEditOrder(stores, draft({ entry: 1.11, stop: 1.10, target: 1.14 }));
    expect(second.ok).toBe(true);
    if (!second.ok || !created) throw new Error("unreachable");

    expect(second.created).toBe(false);
    expect(second.order.id).toBe(created.id);
    expect(second.order.drawingId).toBe(created.drawingId);
    expect(second.order.createdAt).toBe(created.createdAt);
    expect(stores.orders.pending()).toHaveLength(1);
  });

  it("edit updates canonical metrics and the linked drawing geometry", () => {
    placeOrEditOrder(stores, draft());
    const res = placeOrEditOrder(stores, draft({ entry: 1.10, stop: 1.09, target: 1.13 }));
    if (!res.ok) throw new Error("expected ok");

    expect(res.order.risk).toBeCloseTo(0.01, 6);
    expect(res.order.reward).toBeCloseTo(0.03, 6);
    expect(res.order.rr).toBeCloseTo(3, 5);

    const d = stores.drawings.list().find((x) => x.id === "d1")!;
    expect(d.points[0].price).toBeCloseTo(1.10, 6);
    expect(d.points[1].price).toBeCloseTo(1.13, 6);
    expect(d.points[2].price).toBeCloseTo(1.09, 6);
    // timestamps (anchoring) untouched
    expect(d.points.map((p) => p.time)).toEqual([1_000, 2_000, 2_000]);
    expect(d.orderId).toBe(res.order.id);
    expect(d.orderBadge).toContain("Pending");
  });

  it("edit persists through a store reload", () => {
    placeOrEditOrder(stores, draft());
    const res = placeOrEditOrder(stores, draft({ target: 1.15 }));
    if (!res.ok) throw new Error("expected ok");

    const scope = stores.orders.scopeValue();
    const reloaded = new PositionOrderStore();
    reloaded.hydrate(scope);
    expect(reloaded.pending()).toHaveLength(1);
    expect(reloaded.pending()[0].id).toBe(res.order.id);
    expect(reloaded.pending()[0].target).toBeCloseTo(1.15, 6);
  });

  it("invalid edits cannot be confirmed and leave the order untouched", () => {
    const first = placeOrEditOrder(stores, draft());
    if (!first.ok) throw new Error("expected ok");

    // Long: SL above entry, TP below entry
    const bad = placeOrEditOrder(stores, draft({ stop: 1.15, target: 1.05 }));
    expect(bad.ok).toBe(false);
    if (bad.ok) throw new Error("unreachable");
    expect(bad.errors.join(" ")).toMatch(/stop loss must be below entry/i);
    expect(bad.errors.join(" ")).toMatch(/take profit must be above entry/i);

    const live = stores.orders.byId(first.order.id)!;
    expect(live.stop).toBeCloseTo(1.09, 6);
    expect(live.target).toBeCloseTo(1.12, 6);
  });

  it("invalid short edits are blocked", () => {
    const s = makeStores(["s1"]);
    const short = draft({ drawingId: "s1", direction: "sell", entry: 1.1, stop: 1.11, target: 1.08 });
    expect(placeOrEditOrder(s, short).ok).toBe(true);
    const bad = placeOrEditOrder(s, { ...short, stop: 1.05, target: 1.2 });
    expect(bad.ok).toBe(false);
  });

  it("unrelated orders remain unchanged by an edit", () => {
    placeOrEditOrder(stores, draft());
    const other = placeOrEditOrder(stores, draft({ drawingId: "d2", entry: 1.2, stop: 1.19, target: 1.23 }));
    if (!other.ok) throw new Error("expected ok");

    placeOrEditOrder(stores, draft({ entry: 1.05, stop: 1.04, target: 1.09 }));
    const untouched = stores.orders.byId(other.order.id)!;
    expect(untouched.entry).toBeCloseTo(1.2, 6);
    expect(stores.orders.pending()).toHaveLength(2);
  });
});

describe("pending order cancel", () => {
  let stores: ReturnType<typeof makeStores>;
  beforeEach(() => { stores = makeStores(["d1", "d2"]); });

  it("cancel removes active pending state and retires the drawing", () => {
    const res = placeOrEditOrder(stores, draft());
    if (!res.ok) throw new Error("expected ok");

    expect(cancelPendingOrder(stores, res.order.id)).toBe(true);
    expect(stores.orders.pending()).toHaveLength(0);
    expect(stores.orders.byId(res.order.id)).toBeNull();

    const d = stores.drawings.list().find((x) => x.id === "d1")!;
    expect(d).toBeTruthy();               // geometry retired, not deleted
    expect(d.orderId).toBeUndefined();
    expect(d.orderBadge).toBeUndefined();
  });

  it("cancelled order does not resurrect after hydration", () => {
    const res = placeOrEditOrder(stores, draft());
    if (!res.ok) throw new Error("expected ok");
    cancelPendingOrder(stores, res.order.id);

    const scope = stores.orders.scopeValue();
    const reloaded = new PositionOrderStore();
    reloaded.hydrate(scope);
    expect(reloaded.list()).toHaveLength(0);

    // reconciliation against the surviving drawing must not recreate it
    reloaded.reconcile(new Set(["d1"]), "test");
    expect(reloaded.list()).toHaveLength(0);
  });

  it("repeated cancel is idempotent", () => {
    const res = placeOrEditOrder(stores, draft());
    if (!res.ok) throw new Error("expected ok");
    expect(cancelPendingOrder(stores, res.order.id)).toBe(true);
    expect(cancelPendingOrder(stores, res.order.id)).toBe(false);
    expect(cancelPendingOrder(stores, "does-not-exist")).toBe(false);
  });

  it("cancel never touches unrelated orders or drawings", () => {
    const a = placeOrEditOrder(stores, draft());
    const b = placeOrEditOrder(stores, draft({ drawingId: "d2", entry: 1.2, stop: 1.19, target: 1.23 }));
    if (!a.ok || !b.ok) throw new Error("expected ok");

    cancelPendingOrder(stores, a.order.id);
    expect(stores.orders.pending().map((o) => o.id)).toEqual([b.order.id]);
    const d2 = stores.drawings.list().find((x) => x.id === "d2")!;
    expect(d2.orderId).toBe(b.order.id);
  });

  it("deleting a drawing cancels only its own order", () => {
    const a = placeOrEditOrder(stores, draft());
    const b = placeOrEditOrder(stores, draft({ drawingId: "d2", entry: 1.2, stop: 1.19, target: 1.23 }));
    if (!a.ok || !b.ok) throw new Error("expected ok");

    expect(cancelOrderForDrawing(stores, "d1")).toBe(true);
    expect(stores.orders.pending().map((o) => o.id)).toEqual([b.order.id]);
  });
});

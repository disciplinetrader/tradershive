/**
 * Phase 4 regression suite — closed trades, journal linkage, archive and
 * legacy reconciliation.
 *
 * The trigger / fill / gap / slippage / SL / TP behaviour from Phase 3 is
 * exercised here only to assert that Phase 4 did not change it.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { DrawingStore } from "@/lib/chart/drawings/store";
import { PositionOrderStore } from "@/lib/chart/orders/store";
import { ClosedTradeStore } from "@/lib/chart/orders/trade-store";
import { deriveClosedTrade, matchesFilter, tradeResult } from "@/lib/chart/orders/closed-trade";
import { journalInsertFromTrade } from "@/lib/chart/orders/journal-link";
import {
  closePosition, placeOrEditOrder, recordClosedTrade, reconcileClosedTrades, runEngineTick,
} from "@/lib/chart/orders/service";
import { deriveTrade } from "@/lib/journal/derive";
import type { OrderDraft } from "@/lib/chart/orders/model";
import type { Drawing } from "@/lib/chart/drawings/types";

const NOW = 1_700_000_000_000;

function positionDrawing(id: string, entry: number, target: number, stop: number): Drawing {
  return {
    id,
    kind: "long_position",
    points: [
      { time: NOW, price: entry },
      { time: NOW + 60_000, price: target },
      { time: NOW + 60_000, price: stop },
    ],
    style: { color: "#38bdf8", width: 2, lineStyle: 0, fillOpacity: 0.12, fontSize: 12, showLabel: true },
    createdAt: NOW,
  };
}

function harness() {
  const drawings = new DrawingStore();
  drawings.hydrate("TEST");
  const orders = new PositionOrderStore();
  orders.hydrate("TEST");
  const trades = new ClosedTradeStore();
  trades.reset("TEST");
  return { drawings, orders, trades };
}

function openPosition(stores: ReturnType<typeof harness>, opts?: { entry?: number; stop?: number; target?: number }) {
  const entry = opts?.entry ?? 100;
  const stop = opts?.stop ?? 90;
  const target = opts?.target ?? 120;
  const d = positionDrawing("d1", entry, target, stop);
  stores.drawings.add(d);
  stores.drawings.commit();

  const draft: OrderDraft = {
    drawingId: d.id, symbol: "BTCUSDT", direction: "buy",
    orderType: "buy_limit", entry, stop, target, size: 2,
  } as OrderDraft;
  const placed = placeOrEditOrder(stores, draft, { marketPrice: 110, tick: 0.01 });
  expect(placed.ok).toBe(true);

  // Price trades down through the limit → fill.
  runEngineTick(stores, { price: entry });
  const live = stores.orders.positions()[0];
  expect(live).toBeTruthy();
  return live;
}

describe("Phase 4 — closed trade record", () => {
  let stores: ReturnType<typeof harness>;
  beforeEach(() => { stores = harness(); });

  it("1. closing an open position creates exactly one ClosedTrade", () => {
    const live = openPosition(stores);
    closePosition(stores, live.id, { price: 115, reason: "manual" });
    expect(stores.trades.list()).toHaveLength(1);
    const t = stores.trades.list()[0];
    expect(t.positionId).toBe(live.positionId);
    expect(t.fillPrice).toBe(100);
    expect(t.exitPrice).toBe(115);
  });

  it("2. duplicate ticks do not duplicate the trade", () => {
    const live = openPosition(stores);
    runEngineTick(stores, { price: 120 }); // take profit
    runEngineTick(stores, { price: 120 });
    runEngineTick(stores, { price: 121 });
    expect(stores.trades.list()).toHaveLength(1);
    expect(stores.trades.list()[0].closeReason).toBe("take_profit");
  });

  it("3. manual close is idempotent and returns the same record", () => {
    const live = openPosition(stores);
    closePosition(stores, live.id, { price: 112, reason: "manual" });
    const first = stores.trades.list()[0];
    closePosition(stores, live.id, { price: 999, reason: "manual" });
    expect(stores.trades.list()).toHaveLength(1);
    expect(stores.trades.list()[0].id).toBe(first.id);
    expect(stores.trades.list()[0].exitPrice).toBe(112); // execution facts untouched
  });

  it("4. stop-loss close records the observed gap price", () => {
    openPosition(stores);
    runEngineTick(stores, { price: 85 }); // gaps through the 90 stop
    const t = stores.trades.list()[0];
    expect(t.closeReason).toBe("stop_loss");
    expect(t.exitPrice).toBe(85);
    expect(t.netPnl).toBeLessThan(0);
  });

  it("5. take-profit close records the configured target price", () => {
    openPosition(stores);
    runEngineTick(stores, { price: 135 }); // gaps beyond the 120 target
    const t = stores.trades.list()[0];
    expect(t.closeReason).toBe("take_profit");
    expect(t.exitPrice).toBe(120);
  });

  it("6. realized P/L and R match the Journal derivation", () => {
    const live = openPosition(stores);
    closePosition(stores, live.id, { price: 118, reason: "manual" });
    const t = stores.trades.list()[0];

    const insert = journalInsertFromTrade(t, "user-1");
    const derived = deriveTrade(insert as never);

    expect(derived.netPnl).toBeCloseTo(t.netPnl, 8);
    expect(derived.r ?? 0).toBeCloseTo(t.realizedR, 6);
    expect(derived.result).toBe(tradeResult(t));
  });

  it("7 & 8. a persisted trade survives a fresh store and never reads as open", () => {
    const live = openPosition(stores);
    closePosition(stores, live.id, { price: 118, reason: "manual" });
    const snapshot = JSON.parse(JSON.stringify(stores.trades.list()));

    const revived = new ClosedTradeStore();
    revived.reset("TEST");
    for (const t of snapshot) revived.add(t);

    expect(revived.list()).toHaveLength(1);
    expect(stores.orders.positions()).toHaveLength(0);
    expect(stores.orders.list()[0].status).toBe("closed");
  });

  it("9. the drawing is stamped as a completed trade and persists", () => {
    const live = openPosition(stores);
    closePosition(stores, live.id, { price: 118, reason: "manual" });
    const d = stores.drawings.list().find((x) => x.id === "d1");
    expect(d?.closedTrade).toBeTruthy();
    expect(d?.closedTrade?.exitPrice).toBe(118);
    expect(d?.orderBadge).toBeUndefined(); // no longer an active order
  });

  it("10 & 11. journal linkage is idempotent", () => {
    const live = openPosition(stores);
    closePosition(stores, live.id, { price: 118, reason: "manual" });
    const t = stores.trades.list()[0];

    stores.trades.linkJournal(t.id, "entry-1");
    expect(stores.trades.byId(t.id)?.journalStatus).toBe("linked");
    stores.trades.linkJournal(t.id, "entry-1");
    expect(stores.trades.list()).toHaveLength(1);
    expect(stores.trades.byId(t.id)?.journalEntryId).toBe("entry-1");
  });

  it("12. journal-side changes cannot mutate execution facts", () => {
    const live = openPosition(stores);
    closePosition(stores, live.id, { price: 118, reason: "manual" });
    const before = { ...stores.trades.list()[0] };

    stores.trades.linkJournal(before.id, "entry-1");
    stores.trades.setArchived(before.id, true);
    const after = stores.trades.byId(before.id)!;

    for (const key of ["fillPrice", "exitPrice", "entryTime", "exitTime", "orderType",
      "direction", "netPnl", "realizedR", "closeReason", "slippage"] as const) {
      expect(after[key]).toEqual(before[key]);
    }
  });

  it("13. archive keeps the record, its journal link and its analytics", () => {
    const live = openPosition(stores);
    closePosition(stores, live.id, { price: 118, reason: "manual" });
    const t = stores.trades.list()[0];
    stores.trades.linkJournal(t.id, "entry-1");
    stores.trades.setArchived(t.id, true);

    const archived = stores.trades.byId(t.id)!;
    expect(archived.journalEntryId).toBe("entry-1");
    expect(archived.netPnl).toBe(t.netPnl);
    expect(matchesFilter(archived, "all")).toBe(false);
    expect(matchesFilter(archived, "archived")).toBe(true);
    expect(stores.trades.recent()).toHaveLength(0);
    expect(stores.trades.archived()).toHaveLength(1);
  });

  it("14. legacy reconciliation is idempotent and reports missing facts", () => {
    const live = openPosition(stores);
    closePosition(stores, live.id, { price: 118, reason: "manual" });
    // Simulate a Phase 3 world: the trade record never existed.
    const legacy = new ClosedTradeStore();
    legacy.reset("TEST");
    const legacyStores = { ...stores, trades: legacy };

    const first = reconcileClosedTrades(legacyStores);
    expect(first.created).toBe(1);
    const second = reconcileClosedTrades(legacyStores);
    expect(second.created).toBe(0);
    expect(second.existing).toBe(1);
    expect(legacy.list()).toHaveLength(1);
  });

  it("14b. incomplete execution data is reported, never fabricated", () => {
    const res = recordClosedTrade(stores, {
      id: "o1", drawingId: "dX", symbol: "BTCUSDT", direction: "buy", orderType: "market",
      entry: 100, stop: 90, target: 120, size: 1, status: "closed",
      createdAt: NOW, updatedAt: NOW,
    } as never);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.missing).toContain("positionId");
    expect(stores.trades.list()).toHaveLength(0);
  });

  it("15. unrelated orders and trades are untouched by a close", () => {
    const live = openPosition(stores);
    const other = positionDrawing("d2", 200, 240, 180);
    stores.drawings.add(other);
    stores.drawings.commit();
    placeOrEditOrder(stores, {
      drawingId: "d2", symbol: "BTCUSDT", direction: "buy", orderType: "buy_limit",
      entry: 200, stop: 180, target: 240, size: 1,
    } as OrderDraft, { marketPrice: 210, tick: 0.01 });

    closePosition(stores, live.id, { price: 118, reason: "manual" });

    const untouched = stores.orders.list().find((o) => o.drawingId === "d2")!;
    expect(untouched.status).toBe("pending");
    expect(stores.trades.list()).toHaveLength(1);
    expect(stores.drawings.list().find((x) => x.id === "d2")?.closedTrade).toBeUndefined();
  });
});

describe("Phase 4 — derivation parity", () => {
  it("R is size-independent and matches the journal formula", () => {
    const a = deriveClosedTrade({ direction: "buy", fillPrice: 100, exitPrice: 110, initialStop: 95, quantity: 1 });
    const b = deriveClosedTrade({ direction: "buy", fillPrice: 100, exitPrice: 110, initialStop: 95, quantity: 7 });
    expect(a.realizedR).toBeCloseTo(2, 8);
    expect(b.realizedR).toBeCloseTo(a.realizedR, 8);
    expect(b.netPnl).toBeCloseTo(a.netPnl * 7, 8);
  });

  it("short direction inverts the move", () => {
    const s = deriveClosedTrade({ direction: "sell", fillPrice: 100, exitPrice: 90, initialStop: 105, quantity: 2 });
    expect(s.netPnl).toBeCloseTo(20, 8);
    expect(s.result).toBe("win");
  });

  it("gross − fees = net", () => {
    const f = deriveClosedTrade({ direction: "buy", fillPrice: 100, exitPrice: 110, initialStop: 95, quantity: 1, fees: 3 });
    expect(f.grossPnl - f.fees).toBeCloseTo(f.netPnl, 8);
  });
});

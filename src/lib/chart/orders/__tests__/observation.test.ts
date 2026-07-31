/**
 * Phase 8 · shared-pipeline regression tests.
 *
 * These lock the two properties Replay depends on:
 *   1. a candle expands into a deterministic, conservative observation path
 *   2. live and Replay reach the same trailing decision from the same bar
 */

import { describe, expect, it } from "vitest";
import { observationsFromCandle, runCandle, type Candle } from "../observation";
import { nextTrailingStop } from "../trailing";
import { positionOrderStore } from "../store";
import { closedTradeStore } from "../trade-store";
import { DrawingStore } from "@/lib/chart/drawings/store";
import { createOrder, type OrderDraft } from "../model";

const bullish: Candle = { time: 1_000, open: 100, high: 110, low: 95, close: 108 };
const bearish: Candle = { time: 2_000, open: 108, high: 112, low: 90, close: 92 };

describe("intrabar observation policy", () => {
  it("visits the adverse extreme first on a bullish bar", () => {
    expect(observationsFromCandle(bullish).map((o) => o.price)).toEqual([100, 95, 110, 108]);
  });

  it("visits the adverse extreme first on a bearish bar", () => {
    expect(observationsFromCandle(bearish).map((o) => o.price)).toEqual([108, 112, 90, 92]);
  });

  it("collapses repeated prices so a doji never ticks twice", () => {
    const doji: Candle = { time: 3_000, open: 100, high: 100, low: 100, close: 100 };
    expect(observationsFromCandle(doji)).toHaveLength(1);
  });

  it("is deterministic — the same bar always yields the same path", () => {
    expect(observationsFromCandle(bullish)).toEqual(observationsFromCandle(bullish));
  });
});

describe("live / replay trailing parity", () => {
  it("returns the identical stop for a quote and for the bar extreme", () => {
    const cfg = { mode: "fixed" as const, active: true, distance: 5 };
    const live = nextTrailingStop({ direction: "buy", stop: 96 }, cfg, { price: 110 });
    const replay = nextTrailingStop({ direction: "buy", stop: 96 }, cfg, { price: bullish.high });
    expect(live).toBe(105);
    expect(replay).toBe(live);
  });

  it("never loosens a stop and never places it through the market", () => {
    const cfg = { mode: "fixed" as const, active: true, distance: 50 };
    expect(nextTrailingStop({ direction: "buy", stop: 105 }, cfg, { price: 110 })).toBeNull();
    expect(
      nextTrailingStop({ direction: "buy", stop: 96 }, { ...cfg, distance: 0.0001 }, { price: 110 }),
    ).toBeLessThan(110);
  });
});

describe("stop takes priority within one bar", () => {
  it("closes at the stop when a bar spans both stop and target", () => {
    positionOrderStore.hydrate("TEST/PAIR");
    closedTradeStore.reset("TEST/PAIR");
    const drawings = new DrawingStore();
    const stores = { drawings, orders: positionOrderStore, trades: closedTradeStore };

    const draft: OrderDraft = {
      symbol: "TEST/PAIR", direction: "buy", orderType: "market",
      entry: 100, stop: 96, target: 110, drawingId: "d1",
    } as OrderDraft;
    const order = createOrder(draft);
    positionOrderStore.add(order);

    runCandle(stores, { time: 1, open: 100, high: 115, low: 90, close: 112 }, {});

    const result = positionOrderStore.byId(order.id);
    expect(result?.status).toBe("closed");
    expect(result?.closeReason).toBe("stop_loss");
  });
});

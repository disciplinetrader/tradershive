/**
 * Phase 8A · Replay Session Engine determinism tests.
 *
 * These lock the guarantees the phase is judged on:
 *  · dataset identity is content-addressed and gap-aware
 *  · the clock never skips or repeats an observation, at any speed
 *  · execution flows exclusively through the canonical engine
 *  · a session resumes on another "device" at exactly the same state
 */

import { describe, expect, it, beforeEach } from "vitest";
import { DrawingStore } from "@/lib/chart/drawings/store";
import { PositionOrderStore } from "@/lib/chart/orders/store";
import { ClosedTradeStore } from "@/lib/chart/orders/trade-store";
import type { OrderStores } from "@/lib/chart/orders/service";
import { createOrder } from "@/lib/chart/orders/model";
import type { Candle } from "../../types";
import {
  buildDataset, checksumCandles, createSessionMeta, ReplayClock, ReplaySessionEngine,
  resumeSession, selectTransport, validateDataset, canTransition,
} from "../index";

function candles(n: number, start = 1_700_000_000_000, step = 60_000): Candle[] {
  const out: Candle[] = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    const open = price;
    const close = open + (i % 2 === 0 ? 1 : -0.5);
    out.push({ time: start + i * step, open, high: Math.max(open, close) + 0.5, low: Math.min(open, close) - 0.5, close, volume: 10 });
    price = close;
  }
  return out;
}

function makeStores(): OrderStores {
  const drawings = new DrawingStore();
  const orders = new PositionOrderStore();
  const trades = new ClosedTradeStore();
  return { drawings, orders, trades };
}

function makeEngine(bars = 20) {
  const dataset = buildDataset({ provider: "test", symbol: "eur/usd", timeframe: "1m", candles: candles(bars) });
  const stores = makeStores();
  const meta = createSessionMeta({ id: "s1", userId: "u1", title: "Test", dataset: dataset.identity, now: 1 });
  const engine = new ReplaySessionEngine({ meta, dataset, stores, now: () => 1 });
  return { engine, dataset, stores };
}

describe("dataset identity", () => {
  it("is content-addressed and stable", () => {
    const a = buildDataset({ provider: "p", symbol: "BTC/USDT", timeframe: "1m", candles: candles(10) });
    const b = buildDataset({ provider: "p", symbol: "BTC/USDT", timeframe: "1m", candles: candles(10) });
    expect(a.identity.datasetId).toBe(b.identity.datasetId);
    expect(a.identity.checksum).toBe(b.identity.checksum);
  });

  it("changes when a single price changes", () => {
    const base = candles(10);
    const tampered = base.map((c, i) => (i === 4 ? { ...c, high: c.high + 0.01 } : c));
    expect(checksumCandles(base)).not.toBe(checksumCandles(tampered));
  });

  it("normalises: sorts, de-duplicates and drops invalid bars", () => {
    const raw = candles(3);
    const ds = buildDataset({
      provider: "p", symbol: "X", timeframe: "1m",
      candles: [raw[2], raw[0], raw[1], raw[1], { ...raw[0], time: raw[0].time + 30, close: NaN }],
    });
    expect(ds.identity.barCount).toBe(3);
    expect(ds.candles[0].time).toBeLessThan(ds.candles[1].time);
  });

  it("reports gaps against the timeframe", () => {
    const raw = candles(5);
    const withHole = [...raw.slice(0, 2), ...raw.slice(4)];
    const ds = buildDataset({ provider: "p", symbol: "X", timeframe: "1m", candles: withHole });
    expect(ds.identity.gaps).toHaveLength(1);
    expect(ds.identity.gaps[0].missingBars).toBe(2);
  });

  it("refuses synthetic data for real sessions but allows it explicitly", () => {
    const ds = buildDataset({ provider: "synthetic", symbol: "X", timeframe: "1m", candles: candles(5), isSynthetic: true });
    expect(validateDataset(ds.identity).ok).toBe(false);
    expect(validateDataset(ds.identity, { allowSynthetic: true }).ok).toBe(true);
  });
});

describe("replay clock", () => {
  let clock: ReplayClock;
  beforeEach(() => {
    clock = new ReplayClock(buildDataset({ provider: "p", symbol: "X", timeframe: "1m", candles: candles(10) }));
  });

  it("emits every observation exactly once, in order", () => {
    clock.play();
    const seen: number[] = [];
    while (!clock.atEnd) seen.push(...clock.stepObservation().map((o) => o.index));
    expect(seen).toEqual([...Array(clock.total).keys()]);
  });

  it("produces an identical stream at 1x in many small frames and one big frame", () => {
    const ds = buildDataset({ provider: "p", symbol: "X", timeframe: "1m", candles: candles(10) });
    const slow = new ReplayClock(ds); slow.play();
    const fast = new ReplayClock(ds); fast.play();
    const a: number[] = [];
    for (let i = 0; i < 300; i++) a.push(...slow.advance(16.6667).map((o) => o.index));
    const b = fast.advance(5000).map((o) => o.index);
    expect(a).toEqual(b);
  });

  it("carries fractional time instead of dropping it", () => {
    clock.play();
    clock.setSpeed(1);
    const first = clock.advance(400);
    expect(first).toHaveLength(0);
    const second = clock.advance(700);
    expect(second.length).toBeGreaterThan(0);
  });

  it("runs every intermediate observation when fast-forwarding", () => {
    clock.play();
    const batch = clock.skipCandles(4);
    expect(batch[0].index).toBe(0);
    expect(batch[batch.length - 1].index).toBe(batch.length - 1);
  });

  it("clamps speed into the supported 0.25x–100x range", () => {
    expect(clock.setSpeed(0.01)).toBe(0.25);
    expect(clock.setSpeed(1000)).toBe(100);
    expect(clock.setSpeed(4)).toBe(4);
  });

  it("ends deterministically and stops emitting", () => {
    clock.play();
    clock.advance(1_000_000);
    expect(clock.atEnd).toBe(true);
    expect(clock.status).toBe("ended");
    expect(clock.advance(1000)).toEqual([]);
  });

  it("refuses backward seeks (trades cannot be un-executed)", () => {
    clock.play();
    clock.skipCandles(5);
    const cursor = clock.index;
    expect(clock.seekForwardTo(0)).toEqual([]);
    expect(clock.index).toBe(cursor);
  });

  it("only exposes bars up to the forming candle", () => {
    clock.play();
    clock.stepCandle();
    expect(clock.visibleCandles()).toHaveLength(2);
  });
});

describe("session lifecycle", () => {
  it("allows legal transitions only", () => {
    expect(canTransition("ready", "running")).toBe(true);
    expect(canTransition("completed", "running")).toBe(false);
    expect(canTransition("paused", "completed")).toBe(true);
  });

  it("moves created → ready on construction and running on play", () => {
    const { engine } = makeEngine();
    expect(engine.meta.lifecycle).toBe("ready");
    engine.play();
    expect(engine.meta.lifecycle).toBe("running");
    engine.pause();
    expect(engine.meta.lifecycle).toBe("paused");
  });

  it("auto-completes at the end of the dataset", () => {
    const { engine } = makeEngine(5);
    engine.play();
    engine.tick(60_000);
    expect(engine.meta.lifecycle).toBe("completed");
    expect(selectTransport(engine).canPlay).toBe(false);
  });

  it("logs transport and execution events with cursor coordinates", () => {
    const { engine } = makeEngine();
    engine.play();
    engine.stepCandle();
    const types = engine.log.list().map((e) => e.type);
    expect(types).toContain("session_started");
    expect(types).toContain("observation_batch");
    expect(engine.log.highWaterCursor()).toBeGreaterThan(0);
  });
});

describe("execution parity and autosave", () => {
  it("fills a pending order through the canonical engine, not replay-local logic", () => {
    const { engine, stores } = makeEngine();
    const order = createOrder({
      symbol: "EUR/USD", direction: "buy", orderType: "buy_stop",
      entry: 101, stop: 99, target: 105, size: 1, drawingId: "d1",
    } as any, 1);
    stores.orders.add(order);
    engine.play();
    engine.skipCandles(20);
    const stored = stores.orders.byId(order.id)!;
    expect(["open", "closed", "filled"]).toContain(stored.status);
  });

  it("marks state dirty and flushes a snapshot", async () => {
    const writes: number[] = [];
    const dataset = buildDataset({ provider: "p", symbol: "X", timeframe: "1m", candles: candles(10) });
    const engine = new ReplaySessionEngine({
      meta: createSessionMeta({ id: "s2", userId: "u", title: "t", dataset: dataset.identity, now: 1 }),
      dataset, stores: makeStores(), now: () => 1,
      writer: async (s) => { writes.push(s.revision); },
    });
    engine.play();
    engine.stepCandle();
    expect(engine.autosave.isDirty).toBe(true);
    await engine.flush();
    expect(writes).toEqual([1]);
    expect(engine.autosave.isDirty).toBe(false);
  });

  it("keeps retrying after a failed save without losing state", async () => {
    let fail = true;
    const dataset = buildDataset({ provider: "p", symbol: "X", timeframe: "1m", candles: candles(10) });
    const engine = new ReplaySessionEngine({
      meta: createSessionMeta({ id: "s3", userId: "u", title: "t", dataset: dataset.identity, now: 1 }),
      dataset, stores: makeStores(), now: () => 1,
      writer: async () => { if (fail) throw new Error("offline"); },
    });
    engine.play();
    engine.stepCandle();
    expect(await engine.flush()).toBe(false);
    expect(engine.autosave.isDirty).toBe(true);
    fail = false;
    expect(await engine.flush()).toBe(true);
    expect(engine.autosave.isDirty).toBe(false);
  });
});

describe("cross-device resume", () => {
  it("restores clock position, viewport and execution state", () => {
    const { engine, dataset } = makeEngine();
    engine.play();
    engine.skipCandles(3);
    engine.setViewport({ mode: "manual", barsVisible: 90 });
    const snapshot = engine.snapshot();

    const fresh = buildDataset({ provider: "test", symbol: "eur/usd", timeframe: "1m", candles: candles(20) });
    const result = resumeSession({ snapshot, dataset: fresh, stores: makeStores(), now: () => 2 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.engine.clock.index).toBe(engine.clock.index);
    expect(result.engine.viewport.barsVisible).toBe(90);
    expect(result.engine.clock.status).toBe("paused");
    expect(dataset.identity.datasetId).toBe(fresh.identity.datasetId);
  });

  it("refuses to resume when the historical data changed", () => {
    const { engine } = makeEngine();
    engine.play();
    engine.stepCandle();
    const changed = buildDataset({
      provider: "test", symbol: "eur/usd", timeframe: "1m",
      candles: candles(20).map((c, i) => (i === 3 ? { ...c, close: c.close + 5 } : c)),
    });
    const result = resumeSession({ snapshot: engine.snapshot(), dataset: changed, stores: makeStores() });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("dataset");
  });

  it("never replays an observation the event log already saw", () => {
    const { engine, dataset } = makeEngine();
    engine.play();
    engine.skipCandles(4);
    const snapshot = engine.snapshot();
    const torn = { ...snapshot, clock: { ...snapshot.clock, cursor: 2 } };
    const result = resumeSession({ snapshot: torn, dataset, stores: makeStores() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.resumedAtCursor).toBe(engine.clock.index);
  });

  it("rejects snapshots from an older engine version", () => {
    const { engine, dataset } = makeEngine();
    const result = resumeSession({ snapshot: { ...engine.snapshot(), version: 0 }, dataset, stores: makeStores() });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("version");
  });
});

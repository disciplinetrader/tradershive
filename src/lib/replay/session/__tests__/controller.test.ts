/**
 * Phase 8B · controller + bootstrap tests.
 *
 * These assert the properties the UI depends on, not the UI itself:
 *  · the loop is frame-rate independent (throttling changes nothing)
 *  · the chart never sees future bars
 *  · dataset preflight refuses what it cannot reproduce
 *  · resume restores execution state; a changed dataset refuses to resume
 */

import { describe, expect, it } from "vitest";
import { bootstrapSession, createSessionStores } from "../loader";
import { ReplaySessionController } from "../controller";
import type { Candle } from "../../types";

function candles(n: number, start = 1_700_000_000_000): Candle[] {
  const out: Candle[] = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    const open = price;
    const close = open + (i % 2 === 0 ? 1 : -0.5);
    out.push({
      time: start + i * 300_000,
      open,
      high: Math.max(open, close) + 0.5,
      low: Math.min(open, close) - 0.5,
      close,
      volume: 100,
    });
    price = close;
  }
  return out;
}

const row = {
  id: "11111111-1111-1111-1111-111111111111",
  user_id: "u1",
  title: "EURUSD practice",
  symbol: "EURUSD",
  timeframe: "5m",
  market: "forex",
};

function boot(overrides: Partial<Parameters<typeof bootstrapSession>[0]> = {}) {
  return bootstrapSession({
    row,
    candles: candles(50),
    provider: "twelvedata",
    writer: async () => {},
    ...overrides,
  });
}

/** Manual scheduler so tests drive frames explicitly. */
function manualController(engineOwner: ReturnType<typeof boot>) {
  if (!engineOwner.ok) throw new Error("boot failed");
  let clock = 0;
  let queued: ((t: number) => void) | null = null;
  const controller = new ReplaySessionController(engineOwner.controller.engine, {
    now: () => clock,
    schedule: (cb) => { queued = cb; return 1; },
    cancel: () => { queued = null; },
  });
  const frame = (ms: number) => {
    clock += ms;
    const cb = queued;
    queued = null;
    cb?.(clock);
  };
  return { controller, frame };
}

describe("bootstrapSession", () => {
  it("builds a dataset and a ready engine", () => {
    const r = boot();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dataset.identity.barCount).toBe(50);
    expect(r.controller.engine.meta.lifecycle).toBe("ready");
    expect(r.resumed).toBe(false);
  });

  it("refuses synthetic data unless the session opted in", () => {
    const r = boot({ isSynthetic: true });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join(" ")).toMatch(/synthetic/i);
  });

  it("allows synthetic data for demo sessions", () => {
    expect(boot({ isSynthetic: true, allowSynthetic: true }).ok).toBe(true);
  });

  it("refuses a dataset with fewer than two bars", () => {
    const r = boot({ candles: candles(1) });
    expect(r.ok).toBe(false);
  });

  it("gives each session isolated execution stores", () => {
    const a = createSessionStores();
    const b = createSessionStores();
    expect(a.orders).not.toBe(b.orders);
    expect(a.trades).not.toBe(b.trades);
  });
});

describe("ReplaySessionController", () => {
  it("consumes the same observations regardless of frame count", () => {
    const a = manualController(boot());
    a.controller.play();
    for (let i = 0; i < 60; i++) a.frame(16.7);

    const b = manualController(boot());
    b.controller.play();
    b.frame(1002);

    expect(a.controller.engine.clock.index).toBe(b.controller.engine.clock.index);
    expect(a.controller.engine.clock.index).toBeGreaterThan(0);
  });

  it("never exposes future candles to the chart", () => {
    const { controller, frame } = manualController(boot());
    controller.play();
    frame(3000);
    const snap = controller.getSnapshot();
    expect(snap.candles.length).toBe(snap.transport.candleIndex + 1);
    expect(snap.candles.length).toBeLessThan(50);
  });

  it("emits a new immutable snapshot when state changes", () => {
    const { controller, frame } = manualController(boot());
    const first = controller.getSnapshot();
    controller.play();
    frame(1000);
    const second = controller.getSnapshot();
    expect(second).not.toBe(first);
    expect(second.transport.cursor).toBeGreaterThan(first.transport.cursor);
  });

  it("stepping pauses playback and advances exactly one bar", () => {
    const { controller } = manualController(boot());
    controller.play();
    controller.stepCandle();
    expect(controller.isPlaying).toBe(false);
    expect(controller.getSnapshot().transport.candleIndex).toBe(1);
  });

  it("clamps speed to the supported range", () => {
    const { controller } = manualController(boot());
    expect(controller.setSpeed(1000)).toBe(100);
    expect(controller.setSpeed(0)).toBe(0.25);
  });

  it("completes at the end of the dataset and stops the loop", () => {
    const { controller, frame } = manualController(boot());
    controller.play();
    frame(120_000);
    const snap = controller.getSnapshot();
    expect(snap.transport.status).toBe("ended");
    expect(snap.meta.lifecycle).toBe("completed");
    expect(controller.isPlaying).toBe(false);
  });

  it("disposes cleanly without further ticks", () => {
    const { controller, frame } = manualController(boot());
    controller.play();
    frame(1000);
    const cursor = controller.getSnapshot().transport.cursor;
    controller.dispose();
    frame(5000);
    expect(controller.getSnapshot().transport.cursor).toBe(cursor);
  });
});

describe("resume", () => {
  it("restores the cursor from a saved snapshot", () => {
    const first = boot();
    if (!first.ok) throw new Error("boot failed");
    first.controller.tick(0); // no-op: engine is paused
    first.controller.stepCandle();
    first.controller.stepCandle();
    const snapshot = first.controller.engine.snapshot();

    const resumed = boot({ snapshot });
    expect(resumed.ok).toBe(true);
    if (!resumed.ok) return;
    expect(resumed.resumed).toBe(true);
    expect(resumed.resumedAtCursor).toBe(snapshot.clock.cursor);
    expect(resumed.controller.engine.clock.status).toBe("paused");
  });

  it("refuses a snapshot whose dataset changed", () => {
    const first = boot();
    if (!first.ok) throw new Error("boot failed");
    first.controller.stepCandle();
    const snapshot = first.controller.engine.snapshot();

    const changed = boot({ snapshot, candles: candles(50, 1_700_000_600_000) });
    expect(changed.ok).toBe(true);
    if (!changed.ok) return;
    expect(changed.resumed).toBe(false);
    expect(changed.discardedSnapshot?.reason).toBe("dataset");
  });
});

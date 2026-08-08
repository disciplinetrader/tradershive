import { describe, expect, it } from "vitest";

import {
  BATTLE_MAX_SPEED,
  BATTLE_MIN_SPEED,
  battleCursorAt,
  candlesConsumedAt,
  clampBattleSpeed,
  validateBattleReplayRange,
} from "../battle-cursor";
import { buildDataset } from "../session/dataset";
import type { Candle } from "../types";

/** Ascending 1-minute bars, alternating direction so intrabar paths differ. */
function candles(n: number): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < n; i++) {
    const base = 100 + i;
    const bullish = i % 2 === 0;
    out.push({
      time: i * 60_000,
      open: base,
      high: base + 2,
      low: base - 2,
      close: bullish ? base + 1 : base - 1,
      volume: 1_000,
    });
  }
  return out;
}

const dataset = (n = 100) =>
  buildDataset({ provider: "test", symbol: "BTC/USDT", timeframe: "1m", candles: candles(n) });

describe("clampBattleSpeed", () => {
  it("holds battle speed inside a narrower band than the studio's", () => {
    expect(clampBattleSpeed(100)).toBe(BATTLE_MAX_SPEED);
    expect(clampBattleSpeed(0.01)).toBe(BATTLE_MIN_SPEED);
    expect(clampBattleSpeed(Number.NaN)).toBe(1);
  });
});

describe("candlesConsumedAt", () => {
  it("consumes one candle per second at 1x", () => {
    expect(candlesConsumedAt(10_000, 1)).toBe(10);
  });

  it("scales with speed", () => {
    expect(candlesConsumedAt(10_000, 4)).toBe(40);
  });

  it("floors rather than rounds, so a candle is never reported early", () => {
    expect(candlesConsumedAt(1_999, 1)).toBe(1);
  });

  it("reads pre-start and negative elapsed as zero, never backwards", () => {
    expect(candlesConsumedAt(-5_000, 1)).toBe(0);
    expect(candlesConsumedAt(0, 1)).toBe(0);
  });
});

describe("battleCursorAt", () => {
  it("is identical for two participants at the same elapsed time", () => {
    const ds = dataset();
    const a = battleCursorAt(ds, { elapsedMs: 30_000, speed: 2 });
    const b = battleCursorAt(ds, { elapsedMs: 30_000, speed: 2 });
    expect(a).toBe(b);
  });

  it("is monotonic — it can never move backwards as time advances", () => {
    const ds = dataset();
    let prev = -1;
    for (let t = 0; t <= 60_000; t += 250) {
      const cursor = battleCursorAt(ds, { elapsedMs: t, speed: 1 });
      expect(cursor).toBeGreaterThanOrEqual(prev);
      prev = cursor;
    }
  });

  it("does not advance before the battle starts", () => {
    const ds = dataset();
    expect(battleCursorAt(ds, { elapsedMs: -60_000, speed: 4 })).toBe(0);
  });

  it("pins at the end of the tape instead of running past it", () => {
    const ds = dataset(10);
    const cursor = battleCursorAt(ds, { elapsedMs: 10_000_000, speed: 8 });
    expect(cursor).toBe(ds.identity.observationCount);
  });

  it("never returns a cursor before startCursor", () => {
    const ds = dataset();
    const startCursor = ds.observationOffsets[20];
    expect(battleCursorAt(ds, { elapsedMs: 0, speed: 1, startCursor })).toBe(startCursor);
    expect(battleCursorAt(ds, { elapsedMs: -1_000, speed: 1, startCursor })).toBe(startCursor);
  });

  it("offsets from startCursor rather than from the start of the dataset", () => {
    const ds = dataset();
    const startCursor = ds.observationOffsets[20];
    // 5 seconds at 1x = 5 candles past candle 20.
    expect(battleCursorAt(ds, { elapsedMs: 5_000, speed: 1, startCursor })).toBe(
      ds.observationOffsets[25],
    );
  });

  it("lands on an observation boundary, never mid-candle", () => {
    const ds = dataset();
    const offsets = new Set<number>([...ds.observationOffsets]);
    for (let t = 0; t < 40_000; t += 137) {
      const cursor = battleCursorAt(ds, { elapsedMs: t, speed: 1.5 });
      expect(offsets.has(cursor) || cursor === ds.identity.observationCount).toBe(true);
    }
  });

  it("doubling speed reaches the same cursor in half the time", () => {
    const ds = dataset();
    expect(battleCursorAt(ds, { elapsedMs: 20_000, speed: 1 })).toBe(
      battleCursorAt(ds, { elapsedMs: 10_000, speed: 2 }),
    );
  });
});

describe("validateBattleReplayRange", () => {
  it("accepts a range that covers the battle", () => {
    const res = validateBattleReplayRange({ barCount: 2_000, durationMs: 30 * 60_000, speed: 1 });
    expect(res.ok).toBe(true);
    expect(res.required).toBe(1_800);
  });

  it("rejects a range that would run out mid-battle", () => {
    const res = validateBattleReplayRange({ barCount: 500, durationMs: 30 * 60_000, speed: 1 });
    expect(res.ok).toBe(false);
    expect(res.reason).toContain("500 candles");
  });

  it("counts higher speed as needing more candles, not fewer", () => {
    const slow = validateBattleReplayRange({ barCount: 5_000, durationMs: 10 * 60_000, speed: 1 });
    const fast = validateBattleReplayRange({ barCount: 5_000, durationMs: 10 * 60_000, speed: 8 });
    expect(fast.required).toBeGreaterThan(slow.required);
  });

  it("discounts candles consumed by startCursor", () => {
    const res = validateBattleReplayRange({
      barCount: 2_000,
      startCursorCandles: 1_500,
      durationMs: 30 * 60_000,
      speed: 1,
    });
    expect(res.ok).toBe(false);
    expect(res.available).toBe(500);
  });

  it("rejects a zero-length battle", () => {
    expect(validateBattleReplayRange({ barCount: 100, durationMs: 0, speed: 1 }).ok).toBe(false);
  });
});

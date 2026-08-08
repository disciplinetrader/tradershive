import { describe, expect, it } from "vitest";

import {
  advanceBattleSession,
  battleProgress,
  createBattleSession,
  type BattleReplayConfig,
  type BattleSession,
} from "../battle-session";
import type { Candle } from "../types";

function candles(n: number): Candle[] {
  return Array.from({ length: n }, (_, i) => {
    const base = 100 + i;
    const bullish = i % 2 === 0;
    return {
      time: i * 60_000,
      open: base,
      high: base + 2,
      low: base - 2,
      close: bullish ? base + 1 : base - 1,
      volume: 1_000,
    };
  });
}

const START = 1_700_000_000_000;

function config(over: Partial<BattleReplayConfig> = {}): BattleReplayConfig {
  return {
    battleId: "b1",
    datasetId: "",
    symbol: "BTC/USDT",
    timeframe: "1m",
    startAt: START,
    speed: 1,
    startCursor: 0,
    ...over,
  };
}

function session(over: Partial<BattleReplayConfig> = {}, n = 200): BattleSession {
  const res = createBattleSession(config(over), candles(n));
  if (!res.ok) throw new Error(`expected a session, got ${res.reason}`);
  return res;
}

describe("createBattleSession", () => {
  it("refuses to start with no candles", () => {
    const res = createBattleSession(config(), []);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("no-candles");
  });

  it("refuses to start when the loaded bars are not the bars the battle was created against", () => {
    const res = createBattleSession(config({ datasetId: "someone-elses-dataset" }), candles(50));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("dataset-mismatch");
  });

  it("accepts a matching datasetId", () => {
    const first = session();
    const res = createBattleSession(
      config({ datasetId: first.dataset.identity.datasetId }),
      candles(200),
    );
    expect(res.ok).toBe(true);
  });

  it("gives each participant its own stores, never a shared book", () => {
    const a = session();
    const b = session();
    expect(a.stores.orders).not.toBe(b.stores.orders);
    expect(a.stores.trades).not.toBe(b.stores.trades);
  });

  it("does not complete when the tape is exhausted — end_at owns the lifecycle", () => {
    const s = session({}, 10);
    advanceBattleSession(s, START + 60 * 60_000);
    expect(s.engine.clock.atEnd).toBe(true);
    expect(s.engine.meta.lifecycle).not.toBe("completed");
  });

  it("opens on startCursor rather than the head of the dataset", () => {
    const s = session({ startCursor: 40 });
    expect(s.engine.clock.index).toBe(40);
  });
});

describe("advanceBattleSession", () => {
  it("puts two participants on the same cursor at the same moment", () => {
    const a = session();
    const b = session();
    const at = START + 37_000;
    expect(advanceBattleSession(a, at).cursor).toBe(advanceBattleSession(b, at).cursor);
  });

  it("converges regardless of how often each participant advanced", () => {
    const steady = session();
    const stuttering = session();

    // One advances every second; the other was backgrounded and advances once.
    for (let t = 1_000; t <= 60_000; t += 1_000) advanceBattleSession(steady, START + t);
    advanceBattleSession(stuttering, START + 60_000);

    expect(stuttering.engine.clock.index).toBe(steady.engine.clock.index);
  });

  it("is idempotent — advancing twice at the same instant consumes nothing extra", () => {
    const s = session();
    const first = advanceBattleSession(s, START + 20_000);
    const second = advanceBattleSession(s, START + 20_000);
    expect(second.consumed).toBe(0);
    expect(second.cursor).toBe(first.cursor);
  });

  it("never moves backwards when called with an earlier time", () => {
    const s = session();
    const ahead = advanceBattleSession(s, START + 30_000).cursor;
    const behind = advanceBattleSession(s, START + 5_000).cursor;
    expect(behind).toBe(ahead);
  });

  it("does not advance before the battle starts", () => {
    const s = session();
    expect(advanceBattleSession(s, START - 10_000).cursor).toBe(0);
  });

  it("a paused participant cannot fall behind the market", () => {
    // There is no pause API on a battle session by construction: the only way
    // to move is `advanceBattleSession`, which reads wall-clock time. A client
    // that stops rendering for two minutes and then advances lands exactly
    // where a client that never stopped is.
    const rendering = session();
    const looking_away = session();

    for (let t = 1_000; t <= 120_000; t += 1_000) advanceBattleSession(rendering, START + t);
    advanceBattleSession(looking_away, START + 120_000);

    expect(looking_away.engine.clock.index).toBe(rendering.engine.clock.index);
  });
});

describe("battleProgress", () => {
  it("reads 0 at the bell even when the battle starts mid-dataset", () => {
    const s = session({ startCursor: 100 });
    expect(battleProgress(s)).toBe(0);
  });

  it("reaches 1 once the tape is consumed", () => {
    const s = session({}, 10);
    advanceBattleSession(s, START + 60 * 60_000);
    expect(battleProgress(s)).toBe(1);
  });

  it("increases monotonically", () => {
    const s = session();
    let prev = -1;
    for (let t = 0; t <= 60_000; t += 2_000) {
      advanceBattleSession(s, START + t);
      const p = battleProgress(s);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
  });
});

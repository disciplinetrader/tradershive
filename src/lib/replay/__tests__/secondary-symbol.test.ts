import { describe, it, expect } from "vitest";
import type { Candle } from "@/lib/market-data/types";
import { projectSecondary } from "../secondary-symbol";

/**
 * MSYM-1 · secondary-symbol projection.
 *
 * The whole feature rests on one guarantee: a secondary pane can never show a
 * bar whose open the clock has not reached. Everything here asserts that
 * against arithmetic on explicit timestamps rather than against whatever the
 * projector happens to return.
 */

const T0 = Date.UTC(2026, 7, 20, 0, 0, 0);
const MIN = 60_000;

function candles(count: number, stepMinutes: number, from = T0): Candle[] {
  return Array.from({ length: count }, (_, i) => ({
    time: from + i * stepMinutes * MIN,
    open: 100 + i,
    high: 100 + i + 2,
    low: 100 + i - 2,
    close: 100 + i + 1,
    volume: 10,
  })) as Candle[];
}

describe("projectSecondary — nothing is visible before the clock reaches it", () => {
  it("shows nothing when the clock has not started", () => {
    expect(projectSecondary(candles(10, 5), null)).toEqual({
      visibleCount: 0, atTime: null, lagMs: null,
    });
  });

  it("shows nothing when the clock is before the secondary's first bar", () => {
    const c = candles(10, 5, T0 + 60 * MIN);
    expect(projectSecondary(c, T0).visibleCount).toBe(0);
  });

  it("shows nothing for an empty secondary dataset", () => {
    expect(projectSecondary([], T0).visibleCount).toBe(0);
  });

  it("includes a bar opening at exactly the clock time", () => {
    // 5m bars at T0, T0+5m, T0+10m. Clock at T0+10m: the third bar's open has
    // happened, so three bars are visible — not two.
    const c = candles(3, 5);
    const p = projectSecondary(c, T0 + 10 * MIN);
    expect(p.visibleCount).toBe(3);
    expect(p.atTime).toBe(T0 + 10 * MIN);
    expect(p.lagMs).toBe(0);
  });

  it("excludes a bar opening one millisecond after the clock", () => {
    const c = candles(3, 5);
    expect(projectSecondary(c, T0 + 10 * MIN - 1).visibleCount).toBe(2);
  });
});

describe("projectSecondary — grids that do not line up", () => {
  it("projects 5m bars onto a 1m clock without inventing one", () => {
    // Secondary prints every 5m; clock sits at T0+7m, inside the second bar.
    // Visible: bars at T0 and T0+5m. Lag: 2 minutes into the forming bar.
    const c = candles(6, 5);
    const p = projectSecondary(c, T0 + 7 * MIN);
    expect(p.visibleCount).toBe(2);
    expect(p.atTime).toBe(T0 + 5 * MIN);
    expect(p.lagMs).toBe(2 * MIN);
  });

  it("reports a large lag rather than hiding a non-trading instrument", () => {
    // Secondary stopped printing 3 days ago (its market is closed). All of its
    // bars stay visible and the staleness is reported, not concealed.
    const c = candles(4, 60);
    const clock = T0 + 3 * 24 * 60 * MIN;
    const p = projectSecondary(c, clock);
    expect(p.visibleCount).toBe(4);
    expect(p.atTime).toBe(T0 + 3 * 60 * MIN);
    expect(p.lagMs).toBe(clock - (T0 + 3 * 60 * MIN));
  });
});

describe("projectSecondary — the invariant that makes panes agree", () => {
  it("never goes backwards as the clock advances", () => {
    const c = candles(200, 5);
    let last = 0;
    for (let t = T0 - 10 * MIN; t <= T0 + 1000 * MIN; t += MIN) {
      const { visibleCount } = projectSecondary(c, t);
      expect(visibleCount).toBeGreaterThanOrEqual(last);
      last = visibleCount;
    }
    expect(last).toBe(200);
  });

  it("is a pure function of (candles, time) — two panes cannot disagree", () => {
    const c = candles(500, 15);
    const t = T0 + 1234 * MIN;
    expect(projectSecondary(c, t)).toEqual(projectSecondary(c, t));
    // And agrees with the naive definition it is an optimisation of.
    const naive = c.filter((bar) => bar.time <= t).length;
    expect(projectSecondary(c, t).visibleCount).toBe(naive);
  });

  it("matches the naive filter across the whole dataset", () => {
    const c = candles(97, 7);
    for (let i = -1; i <= 97; i++) {
      const t = T0 + i * 7 * MIN;
      expect(projectSecondary(c, t).visibleCount).toBe(
        c.filter((bar) => bar.time <= t).length,
      );
    }
  });
});

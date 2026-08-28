import { describe, it, expect } from "vitest";
import { runMonteCarlo, MIN_MONTE_CARLO_SAMPLE } from "../monte-carlo";

/**
 * Monte Carlo — pinned against numbers derived analytically, not against
 * whatever the implementation happened to print.
 *
 * Two kinds of assertion here, and the distinction is the point:
 *
 *   - Degenerate samples (every trade identical) have exactly one possible
 *     path, so every percentile is arithmetic and can be asserted to the cent.
 *   - The mixed sample is a Binomial(10, 0.6) in disguise: with six +100s and
 *     four −150s, a 10-trade path is worth 250k − 1500 for k wins. The
 *     percentile lattice and its probabilities are known in closed form, so the
 *     bands are asserted where the binomial CDF sits several standard errors
 *     clear of the quantile, and only bounded where it does not.
 *
 * Asserting p5/p95 exactly on that sample would be pinning sampling noise:
 * P(k≤8) = 0.9536 against a 0.95 quantile is under one SE at 1,000 paths, so
 * the honest test is a bound, not an equality.
 */

const WIN = 100;
const LOSS = -150;
/** Six winners, four losers: sample mean is exactly 0. */
const MIXED = [WIN, LOSS, WIN, WIN, LOSS, WIN, LOSS, WIN, WIN, LOSS];

describe("runMonteCarlo — degenerate samples are exact arithmetic", () => {
  it("projects a constant winner with no spread, no drawdown, no losing streak", () => {
    const mc = runMonteCarlo(Array<number>(10).fill(50), { startingBalance: 10_000 });

    expect(mc.available).toBe(true);
    expect(mc.sampleSize).toBe(10);
    expect(mc.simulations).toBe(1000);
    expect(mc.horizon).toBe(10);

    expect(mc.bands).toHaveLength(10);
    expect(mc.bands[0]).toEqual({ index: 1, p5: 50, p25: 50, median: 50, p75: 50, p95: 50 });
    expect(mc.bands[9]).toEqual({ index: 10, p5: 500, p25: 500, median: 500, p75: 500, p95: 500 });

    expect(mc.finalPnl).toEqual({ p5: 500, p25: 500, median: 500, p75: 500, p95: 500, mean: 500 });
    expect(mc.maxDrawdown).toEqual({ median: 0, p75: 0, p95: 0, worst: 0 });
    expect(mc.probabilityOfProfit).toBe(1);
    expect(mc.riskOfRuin).toBe(0);
    expect(mc.losingStreak).toEqual({ median: 0, p95: 0, worst: 0 });
  });

  it("ruins every path on a constant loser, and measures the drawdown from a peak of zero", () => {
    // Ruin level is 300 × (1 − 0.5) = 150, so cumulative ≤ −150 ruins: the 8th
    // trade of every path, since nothing here can win.
    const mc = runMonteCarlo(Array<number>(10).fill(-20), { startingBalance: 300 });

    expect(mc.finalPnl.median).toBe(-200);
    expect(mc.finalPnl.mean).toBe(-200);
    // Equity never rises, so peak stays at 0 and the drawdown is the whole loss.
    expect(mc.maxDrawdown).toEqual({ median: 200, p75: 200, p95: 200, worst: 200 });
    expect(mc.probabilityOfProfit).toBe(0);
    expect(mc.riskOfRuin).toBe(1);
    expect(mc.losingStreak).toEqual({ median: 10, p95: 10, worst: 10 });
  });
});

describe("runMonteCarlo — a zero-expectancy sample lands on its binomial lattice", () => {
  const mc = runMonteCarlo(MIXED, { startingBalance: null });

  it("puts the percentile bands on the lattice the binomial CDF predicts", () => {
    // final = 250k − 1500. CDF: k≤5 = 0.3669, k≤6 = 0.6177, k≤7 = 0.8327.
    expect(mc.finalPnl.median).toBe(0); // k = 6
    expect(mc.finalPnl.p25).toBe(-250); // k = 5
    expect(mc.finalPnl.p75).toBe(250); // k = 7

    // The tails sit within one SE of their quantile, so pin the lattice, not
    // the draw: every outcome is a multiple of 250 in [−1500, 1000].
    for (const v of [mc.finalPnl.p5, mc.finalPnl.p95]) {
      expect(Math.abs(v % 250)).toBe(0); // abs: a negative multiple gives −0
      expect(v).toBeGreaterThanOrEqual(-1500);
      expect(v).toBeLessThanOrEqual(1000);
    }
    expect(mc.finalPnl.p5).toBeLessThan(mc.finalPnl.p25);
    expect(mc.finalPnl.p95).toBeGreaterThan(mc.finalPnl.p75);
  });

  it("recovers the sample's zero expectancy in the mean, within 3 standard errors", () => {
    // Per-trade sd = √(0.6·100² + 0.4·150²) = 122.47; over 10 trades 387.30;
    // over 1,000 paths SE = 12.25. Three SE is 36.7.
    expect(Math.abs(mc.finalPnl.mean)).toBeLessThan(36.7);
  });

  it("prices the chance of profit at P(k ≥ 7) = 0.382", () => {
    expect(mc.probabilityOfProfit).toBeGreaterThan(0.336);
    expect(mc.probabilityOfProfit).toBeLessThan(0.428);
  });

  it("cannot state a risk of ruin without a starting balance", () => {
    expect(mc.riskOfRuin).toBeNull();
    // …and states one as soon as there is a balance to measure against.
    expect(runMonteCarlo(MIXED, { startingBalance: 1000 }).riskOfRuin).not.toBeNull();
  });

  it("reports a losing streak the 40% loss rate can produce over ten trades", () => {
    expect(mc.losingStreak.median).toBe(2);
    expect(mc.losingStreak.p95).toBe(4);
    expect(mc.losingStreak.worst).toBeLessThanOrEqual(10);
  });

  it("grows the band monotonically — later trades are never more certain than earlier ones", () => {
    const first = mc.bands[0];
    const last = mc.bands[mc.bands.length - 1];
    expect(last.p95 - last.p5).toBeGreaterThan(first.p95 - first.p5);
  });
});

describe("runMonteCarlo — the sample gate", () => {
  it("withholds the projection below ten closed trades", () => {
    const mc = runMonteCarlo(Array<number>(9).fill(50));
    expect(mc.available).toBe(false);
    expect(mc.sampleSize).toBe(9);
    expect(mc.bands).toEqual([]);
    expect(mc.reason).toMatch(/10 closed trades/);
  });

  it("opens at exactly ten, which is the floor the UI advertises", () => {
    expect(MIN_MONTE_CARLO_SAMPLE).toBe(10);
    expect(runMonteCarlo(Array<number>(10).fill(50)).available).toBe(true);
  });

  it("filters non-finite P/L before applying the gate, not after", () => {
    // A trade with no computable P/L must not count toward the ten.
    const withJunk = [...Array<number>(10).fill(50), NaN, Infinity];
    const mc = runMonteCarlo(withJunk);
    expect(mc.sampleSize).toBe(10);
    expect(mc.available).toBe(true);

    const short = [...Array<number>(9).fill(50), NaN];
    expect(runMonteCarlo(short).available).toBe(false);
    expect(runMonteCarlo(short).sampleSize).toBe(9);
  });
});

describe("runMonteCarlo — the sampler is unbiased, not merely deterministic", () => {
  /**
   * Every statistic in one run shares one seed, so they all move together —
   * which is why a single run cannot tell an unlucky draw from a sampler that
   * never reaches the last element of the array. Both look like "a bit low".
   *
   * This is the check that separates them, and it is here because a Monte
   * Carlo is the one place where a broken implementation still prints
   * plausible numbers.
   */
  const REAL = [
    142.5, -85.0, 218.75, -120.0, 64.25, -85.0,
    310.0, -175.5, 96.0, -85.0, 187.25, -240.0,
  ];

  /**
   * 10s, chosen rather than inherited. E2E-2.
   *
   * This test is deterministic — fixed seeds, fixed RUNS, fixed thresholds —
   * and has never failed an assertion. It failed on the CLOCK, against
   * vitest's 5000ms DEFAULT, which nobody picked for it: 200 Monte Carlo runs
   * is real work, and 5s was merely close enough to pass on an idle machine.
   * Measured under full-suite load on 2026-08-28: 5173ms, 5254ms, 6123ms.
   *
   * 10s is ~2x the slowest observed, and it is a CEILING rather than a target.
   * If this ever needs raising again, that is a signal the test got more
   * expensive, and the cost belongs in this comment — not in a bigger number.
   *
   * Scope: this timeout applies to THIS test only. RUNS is still 200, the
   * seeds, assertions and sampler are untouched, and no global vitest timeout
   * was changed.
   */
  it("converges on the exact bootstrap distribution as seeds are averaged", () => {
    // Exact values from a DP convolution of the 12-fold bootstrap sum:
    // mean 228.25, median 223.75, P(sum > 0) = 64.949%.
    const RUNS = 200;
    let medians = 0, means = 0, profits = 0;
    for (let s = 0; s < RUNS; s += 1) {
      const mc = runMonteCarlo(REAL, { seed: 1000 + s * 7919 });
      medians += mc.finalPnl.median;
      means += mc.finalPnl.mean;
      profits += mc.probabilityOfProfit;
    }
    expect(Math.abs(medians / RUNS - 223.75)).toBeLessThan(10);
    expect(Math.abs(means / RUNS - 228.25)).toBeLessThan(6);
    expect(Math.abs(profits / RUNS - 0.64949)).toBeLessThan(0.01);
  }, 10_000);

  it("can draw the first and the last element of the sample", () => {
    // Distinct powers of two, so a value identifies its index. An index the
    // RNG cannot reach shows up as a percentile that never gets there: with a
    // uniform draw each value owns 1/12 = 8.3% of the mass, so the top value
    // owns everything above the 91.7th percentile and the bottom value
    // everything below the 8.3rd.
    const marker = Array.from({ length: 12 }, (_, i) => 2 ** i);
    const first = runMonteCarlo(marker, { simulations: 10_000, horizon: 12 }).bands[0];
    expect(first.p95).toBe(2048); // 2^11 — the last element is reachable
    expect(first.p5).toBe(1); // 2^0 — and so is the first
  });
});

describe("runMonteCarlo — determinism and bounds", () => {
  it("returns identical results for identical input, so two readers see one projection", () => {
    expect(runMonteCarlo(MIXED)).toEqual(runMonteCarlo(MIXED));
    expect(runMonteCarlo(MIXED, { seed: 7 })).toEqual(runMonteCarlo(MIXED, { seed: 7 }));
  });

  it("moves with the seed", () => {
    const a = runMonteCarlo(MIXED, { seed: 1 });
    const b = runMonteCarlo(MIXED, { seed: 2 });
    expect(a.finalPnl.mean).not.toBe(b.finalPnl.mean);
  });

  it("projects a longer horizon without changing the per-trade expectancy", () => {
    const mc = runMonteCarlo(MIXED, { horizon: 50 });
    expect(mc.bands).toHaveLength(50);
    expect(mc.horizon).toBe(50);
    // sd over 50 trades = 866.0, SE over 1,000 paths = 27.4; three SE is 82.2.
    expect(Math.abs(mc.finalPnl.mean)).toBeLessThan(82.2);
  });

  it("clamps simulations and horizon to their supported range", () => {
    expect(runMonteCarlo(MIXED, { simulations: 10 }).simulations).toBe(100);
    expect(runMonteCarlo(MIXED, { simulations: 99_999 }).simulations).toBe(10_000);
    expect(runMonteCarlo(MIXED, { horizon: 2 }).horizon).toBe(5);
    expect(runMonteCarlo(MIXED, { horizon: 5_000 }).horizon).toBe(2_000);
  });
});

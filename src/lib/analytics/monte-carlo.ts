/**
 * Monte Carlo simulation over the filtered trade sample.
 *
 * Pure maths on records that already exist — no new data source, no server
 * round-trip. We bootstrap (sample with replacement) from the realised P/L
 * sequence, which keeps the real distribution's fat tails instead of assuming
 * normality, then report the percentile envelope of the resulting equity paths.
 *
 * Determinism matters: the same sample + seed must always produce the same
 * bands, otherwise two people reading the same link see different numbers.
 */

export interface MonteCarloOptions {
  /** Number of simulated paths. */
  simulations?: number;
  /** Trades per path. Defaults to the sample size. */
  horizon?: number;
  /** Starting balance for ruin / percentage maths. `null` = unknown. */
  startingBalance?: number | null;
  /** Equity fraction that counts as ruin (0.5 = a 50% drawdown). */
  ruinDrawdownFraction?: number;
  /** Deterministic seed. */
  seed?: number;
}

export interface MonteCarloBand {
  /** 1-based trade index along the path. */
  index: number;
  p5: number;
  p25: number;
  median: number;
  p75: number;
  p95: number;
}

export interface MonteCarloResult {
  /** null when the sample is too small to simulate anything meaningful. */
  available: boolean;
  reason: string | null;
  sampleSize: number;
  simulations: number;
  horizon: number;
  startingBalance: number | null;
  /** Cumulative-P/L percentile envelope, one entry per simulated trade. */
  bands: MonteCarloBand[];
  /** Final cumulative P/L percentiles. */
  finalPnl: { p5: number; p25: number; median: number; p75: number; p95: number; mean: number };
  /** Worst peak-to-trough on each path, percentiles (positive numbers). */
  maxDrawdown: { median: number; p75: number; p95: number; worst: number };
  /** Share of paths that finished above zero. */
  probabilityOfProfit: number;
  /**
   * Share of paths that ever breached the ruin threshold. `null` when no
   * starting balance is known — a percentage drawdown is unknowable then.
   */
  riskOfRuin: number | null;
  /** Longest losing streak across all paths, and its median. */
  losingStreak: { median: number; p95: number; worst: number };
}

/** Small, fast, deterministic PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

const EMPTY: MonteCarloResult = {
  available: false,
  reason: "Monte Carlo needs at least 10 closed trades in the current selection.",
  sampleSize: 0,
  simulations: 0,
  horizon: 0,
  startingBalance: null,
  bands: [],
  finalPnl: { p5: 0, p25: 0, median: 0, p75: 0, p95: 0, mean: 0 },
  maxDrawdown: { median: 0, p75: 0, p95: 0, worst: 0 },
  probabilityOfProfit: 0,
  riskOfRuin: null,
  losingStreak: { median: 0, p95: 0, worst: 0 },
};

export const MIN_MONTE_CARLO_SAMPLE = 10;

/**
 * @param pnls realised net P/L per trade, in account currency, in time order.
 */
export function runMonteCarlo(
  pnls: readonly number[],
  options: MonteCarloOptions = {},
): MonteCarloResult {
  const sample = pnls.filter((v) => Number.isFinite(v));
  if (sample.length < MIN_MONTE_CARLO_SAMPLE) {
    return { ...EMPTY, sampleSize: sample.length };
  }

  const simulations = Math.max(100, Math.min(options.simulations ?? 1000, 10_000));
  const horizon = Math.max(5, Math.min(options.horizon ?? sample.length, 2000));
  const startingBalance = options.startingBalance ?? null;
  const ruinFraction = options.ruinDrawdownFraction ?? 0.5;
  const random = rng(options.seed ?? 20260801);

  // Per-step cumulative values across every path, for the percentile envelope.
  const perStep: number[][] = Array.from({ length: horizon }, () => new Array<number>(simulations));
  const finals = new Array<number>(simulations);
  const maxDDs = new Array<number>(simulations);
  const streaks = new Array<number>(simulations);
  let profitable = 0;
  let ruined = 0;

  const ruinLevel = startingBalance != null ? startingBalance * (1 - ruinFraction) : null;

  for (let s = 0; s < simulations; s += 1) {
    let cumulative = 0;
    let peak = 0;
    let maxDD = 0;
    let streak = 0;
    let worstStreak = 0;
    let hitRuin = false;

    for (let i = 0; i < horizon; i += 1) {
      const pick = sample[Math.floor(random() * sample.length)];
      cumulative += pick;
      perStep[i][s] = cumulative;

      if (cumulative > peak) peak = cumulative;
      const dd = peak - cumulative;
      if (dd > maxDD) maxDD = dd;

      if (pick < 0) {
        streak += 1;
        if (streak > worstStreak) worstStreak = streak;
      } else {
        streak = 0;
      }

      if (ruinLevel != null && !hitRuin && startingBalance != null && startingBalance + cumulative <= ruinLevel) {
        hitRuin = true;
      }
    }

    finals[s] = cumulative;
    maxDDs[s] = maxDD;
    streaks[s] = worstStreak;
    if (cumulative > 0) profitable += 1;
    if (hitRuin) ruined += 1;
  }

  const bands: MonteCarloBand[] = perStep.map((column, i) => {
    const sorted = [...column].sort((a, b) => a - b);
    return {
      index: i + 1,
      p5: percentile(sorted, 0.05),
      p25: percentile(sorted, 0.25),
      median: percentile(sorted, 0.5),
      p75: percentile(sorted, 0.75),
      p95: percentile(sorted, 0.95),
    };
  });

  const sortedFinals = [...finals].sort((a, b) => a - b);
  const sortedDD = [...maxDDs].sort((a, b) => a - b);
  const sortedStreaks = [...streaks].sort((a, b) => a - b);

  return {
    available: true,
    reason: null,
    sampleSize: sample.length,
    simulations,
    horizon,
    startingBalance,
    bands,
    finalPnl: {
      p5: percentile(sortedFinals, 0.05),
      p25: percentile(sortedFinals, 0.25),
      median: percentile(sortedFinals, 0.5),
      p75: percentile(sortedFinals, 0.75),
      p95: percentile(sortedFinals, 0.95),
      mean: finals.reduce((a, b) => a + b, 0) / finals.length,
    },
    maxDrawdown: {
      median: percentile(sortedDD, 0.5),
      p75: percentile(sortedDD, 0.75),
      p95: percentile(sortedDD, 0.95),
      worst: sortedDD[sortedDD.length - 1],
    },
    probabilityOfProfit: profitable / simulations,
    riskOfRuin: ruinLevel != null ? ruined / simulations : null,
    losingStreak: {
      median: percentile(sortedStreaks, 0.5),
      p95: percentile(sortedStreaks, 0.95),
      worst: sortedStreaks[sortedStreaks.length - 1],
    },
  };
}

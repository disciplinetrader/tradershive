/**
 * §3 Core performance metrics — the canonical formulas.
 *
 * Result classification is delegated to `resultOf()` (via the record's
 * `result`, which was produced by that helper), so analytics can never
 * disagree with ClosedTrade or the Journal.
 *
 * `null` is used wherever a metric is genuinely not measurable — e.g. R
 * metrics on a dataset with no risk basis. Never 0.
 */

import type { AnalyticsRecord } from "./model";

import { measurableRate, type Measurable } from "./measurable";

export interface PerformanceMetrics {
  tradeCount: number;
  wins: number;
  losses: number;
  breakEvens: number;

  netPnl: number;
  grossPnl: number;
  fees: number;
  totalReturnPercent: number | null;

  /** R metrics are null when not a single trade has a risk basis. */
  totalR: number | null;
  averageR: number | null;
  medianR: number | null;
  rSampleSize: number;

  averageWinner: number | null;
  averageLoser: number | null;
  largestWinner: number | null;
  largestLoser: number | null;

  winRate: number;
  lossRate: number;
  breakEvenRate: number;

  /** null when there are no losses (∞ is not a number a UI should print). */
  profitFactor: number | null;
  payoffRatio: number | null;
  expectancy: number | null;
  expectancyR: number | null;

  averageHoldSeconds: number | null;
  /** Trades per active trading day. */
  tradeFrequency: number | null;

  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;

  /** netPnl / maxDrawdown — supplied by the engine which owns the curve. */
  recoveryFactor: number | null;

  /**
   * Whether the RATE-style metrics above — `winRate`, `lossRate`,
   * `breakEvenRate`, `expectancy`, `profitFactor`, `payoffRatio` — carry enough
   * decided trades to be read as findings.
   *
   * Not a replacement for their values, which stay exactly as computed. A win
   * rate over two trades is arithmetically correct and evidentially worthless,
   * so nulling it would erase a real number while printing it bare states a
   * finding the sample cannot support. The UI is expected to render
   * `reliability.reason` in place of the number when `measurable` is false —
   * the same contract the journal's six reports already honour.
   *
   * Counted on DECIDED trades (wins + losses), not `tradeCount`: break-evens
   * do not inform a win rate, so twenty scratches and one winner is still a
   * one-trade sample for this purpose.
   */
  reliability: Measurable<number>;
}

export const EMPTY_PERFORMANCE: PerformanceMetrics = {
  tradeCount: 0, wins: 0, losses: 0, breakEvens: 0,
  netPnl: 0, grossPnl: 0, fees: 0, totalReturnPercent: null,
  totalR: null, averageR: null, medianR: null, rSampleSize: 0,
  averageWinner: null, averageLoser: null, largestWinner: null, largestLoser: null,
  winRate: 0, lossRate: 0, breakEvenRate: 0,
  profitFactor: null, payoffRatio: null, expectancy: null, expectancyR: null,
  averageHoldSeconds: null, tradeFrequency: null,
  maxConsecutiveWins: 0, maxConsecutiveLosses: 0, recoveryFactor: null,
  reliability: { measurable: false, reason: "No trades in range", sample: 0 },
};

/** Net P/L of one record honouring the fee-inclusion switch (§4). */
export function pnlOf(record: AnalyticsRecord, excludeFees: boolean): number {
  return excludeFees ? record.grossPnl : record.netPnl;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Compute every §3 metric in one pass.
 *
 * `startingBalance` is optional: without it, total return % is `null` rather
 * than a fabricated percentage (§6).
 */
export function computePerformance(
  records: readonly AnalyticsRecord[],
  opts: { excludeFees?: boolean; startingBalance?: number | null } = {},
): PerformanceMetrics {
  if (records.length === 0) return EMPTY_PERFORMANCE;
  const excludeFees = !!opts.excludeFees;

  const ordered = [...records].sort((a, b) => a.exitTime - b.exitTime || a.tradeId.localeCompare(b.tradeId));

  let netPnl = 0, grossPnl = 0, fees = 0;
  let wins = 0, losses = 0, breakEvens = 0;
  let winSum = 0, lossSum = 0;
  let largestWinner: number | null = null;
  let largestLoser: number | null = null;
  let holdTotal = 0, holdCount = 0;
  let streakWin = 0, streakLoss = 0, maxWinStreak = 0, maxLossStreak = 0;
  const rValues: number[] = [];
  const days = new Set<string>();

  for (const r of ordered) {
    const pnl = pnlOf(r, excludeFees);
    netPnl += pnl;
    grossPnl += r.grossPnl;
    fees += r.fees;

    if (r.result === "win") {
      wins += 1; winSum += pnl;
      largestWinner = largestWinner == null ? pnl : Math.max(largestWinner, pnl);
      streakWin += 1; streakLoss = 0;
      maxWinStreak = Math.max(maxWinStreak, streakWin);
    } else if (r.result === "loss") {
      losses += 1; lossSum += Math.abs(pnl);
      largestLoser = largestLoser == null ? pnl : Math.min(largestLoser, pnl);
      streakLoss += 1; streakWin = 0;
      maxLossStreak = Math.max(maxLossStreak, streakLoss);
    } else {
      breakEvens += 1;
      streakWin = 0; streakLoss = 0;
    }

    if (r.realizedR != null && Number.isFinite(r.realizedR)) rValues.push(r.realizedR);
    if (r.duration > 0) { holdTotal += r.duration; holdCount += 1; }
    days.add(new Date(r.exitTime).toISOString().slice(0, 10));
  }

  const n = ordered.length;
  const totalR = rValues.length ? rValues.reduce((a, b) => a + b, 0) : null;
  const averageWinner = wins > 0 ? winSum / wins : null;
  const averageLoser = losses > 0 ? -(lossSum / losses) : null;

  const winRate = (wins / n) * 100;
  const lossRate = (losses / n) * 100;

  // Expectancy in currency: p(win)·avgWin − p(loss)·|avgLoss|. With no losses
  // it degrades gracefully to the mean P/L per trade.
  const expectancy = netPnl / n;
  const expectancyR = totalR != null && rValues.length ? totalR / rValues.length : null;

  return {
    tradeCount: n,
    wins, losses, breakEvens,
    netPnl, grossPnl, fees,
    totalReturnPercent:
      opts.startingBalance != null && opts.startingBalance > 0
        ? (netPnl / opts.startingBalance) * 100
        : null,

    totalR,
    averageR: totalR != null ? totalR / rValues.length : null,
    medianR: median(rValues),
    rSampleSize: rValues.length,

    averageWinner,
    averageLoser,
    largestWinner,
    largestLoser,

    winRate,
    lossRate,
    breakEvenRate: (breakEvens / n) * 100,

    profitFactor: lossSum > 0 ? winSum / lossSum : null,
    payoffRatio: averageWinner != null && averageLoser != null && averageLoser !== 0
      ? averageWinner / Math.abs(averageLoser)
      : null,
    expectancy,
    expectancyR,

    averageHoldSeconds: holdCount > 0 ? holdTotal / holdCount : null,
    tradeFrequency: days.size > 0 ? n / days.size : null,

    maxConsecutiveWins: maxWinStreak,
    maxConsecutiveLosses: maxLossStreak,
    recoveryFactor: null,
    // Decided trades only — a break-even neither confirms nor denies a win
    // rate, so it must not pad the sample that licenses one.
    reliability: measurableRate(wins + losses, winRate),
  };
}

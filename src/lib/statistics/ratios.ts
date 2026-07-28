/**
 * Additional risk-adjusted performance ratios (Sharpe, Sortino).
 * Computed on daily P&L series so they are comparable across accounts.
 */
import type { AnalyticsTrade } from "./types";
import { groupByDay } from "./calculations";

export interface RiskRatios {
  sharpe: number;    // annualized (sqrt(252))
  sortino: number;   // annualized, downside only
  dailyMean: number;
  dailyStdev: number;
  dailyDownsideStdev: number;
  tradingDays: number;
}

const ANNUALIZE = Math.sqrt(252);

export function computeRiskRatios(trades: AnalyticsTrade[]): RiskRatios {
  const days = groupByDay(trades);
  const pnl = days.map((d) => d.pnl);
  const n = pnl.length;
  if (n < 2) {
    return { sharpe: 0, sortino: 0, dailyMean: 0, dailyStdev: 0, dailyDownsideStdev: 0, tradingDays: n };
  }
  const mean = pnl.reduce((a, b) => a + b, 0) / n;
  const variance = pnl.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const stdev = Math.sqrt(variance);
  const downside = pnl.filter((v) => v < 0);
  const dVar = downside.length
    ? downside.reduce((s, v) => s + v * v, 0) / downside.length
    : 0;
  const dStdev = Math.sqrt(dVar);
  const sharpe = stdev > 0 ? (mean / stdev) * ANNUALIZE : 0;
  const sortino = dStdev > 0 ? (mean / dStdev) * ANNUALIZE : 0;
  return {
    sharpe, sortino,
    dailyMean: mean,
    dailyStdev: stdev,
    dailyDownsideStdev: dStdev,
    tradingDays: n,
  };
}

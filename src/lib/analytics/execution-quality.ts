/**
 * §6 Risk analytics + §7 execution-quality analytics.
 *
 * Both read canonical records only. Where account information is missing, the
 * percentage figures are `null` — the UI renders "unavailable", never 0.
 *
 * MAE / MFE are deliberately NOT inferred from entry and exit (§7): without a
 * market path they are unknowable, so they are reported as unavailable.
 */

import type { AnalyticsRecord } from "./model";
import { median, pnlOf } from "./expectancy";

export interface RiskMetrics {
  averageRisk: number | null;
  maximumRisk: number | null;
  /** Average risk as % of the account; null without a starting balance. */
  averageRiskPercent: number | null;
  maximumRiskPercent: number | null;
  /** Risk still exposed — closed-trade analytics always reports 0 exposure. */
  openRisk: number;
  realizedRisk: number;
  averageRewardPlanned: number | null;
  averageRewardCaptured: number | null;
  /** Histogram of realized R. */
  rDistribution: { bucket: string; from: number; to: number; count: number }[];
  /** Total R won per unit of R risked. */
  riskEfficiency: number | null;
  /** realized R ÷ planned R, as a percentage. */
  rewardCapturePercent: number | null;
  stopLossFrequency: number;
  takeProfitFrequency: number;
  manualCloseFrequency: number;
  sampleWithRisk: number;
  sampleWithPlannedR: number;
}

const R_BUCKETS: [number, number][] = [
  [-Infinity, -3], [-3, -2], [-2, -1], [-1, 0], [0, 1], [1, 2], [2, 3], [3, Infinity],
];

function bucketLabel(from: number, to: number): string {
  if (from === -Infinity) return `< ${to}R`;
  if (to === Infinity) return `> ${from}R`;
  return `${from}R to ${to}R`;
}

export function computeRisk(
  records: readonly AnalyticsRecord[],
  opts: { startingBalance?: number | null } = {},
): RiskMetrics {
  const risks = records.map((r) => r.riskAmount).filter((v): v is number => v != null && v > 0);
  const plannedRs = records.map((r) => r.plannedR).filter((v): v is number => v != null);
  const realizedRs = records.map((r) => r.realizedR).filter((v): v is number => v != null);

  const base = opts.startingBalance ?? null;
  const averageRisk = risks.length ? risks.reduce((a, b) => a + b, 0) / risks.length : null;
  const maximumRisk = risks.length ? Math.max(...risks) : null;

  const distribution = R_BUCKETS.map(([from, to]) => ({
    bucket: bucketLabel(from, to),
    from,
    to,
    count: realizedRs.filter((v) => v >= from && v < to).length,
  }));

  const totalPlanned = plannedRs.reduce((a, b) => a + b, 0);
  const totalRealized = realizedRs.reduce((a, b) => a + b, 0);
  const grossWonR = realizedRs.filter((v) => v > 0).reduce((a, b) => a + b, 0);
  const grossLostR = realizedRs.filter((v) => v < 0).reduce((a, b) => a + Math.abs(b), 0);

  const n = records.length || 1;
  return {
    averageRisk,
    maximumRisk,
    averageRiskPercent: base != null && base > 0 && averageRisk != null ? (averageRisk / base) * 100 : null,
    maximumRiskPercent: base != null && base > 0 && maximumRisk != null ? (maximumRisk / base) * 100 : null,
    openRisk: 0,
    realizedRisk: risks.reduce((a, b) => a + b, 0),
    averageRewardPlanned: plannedRs.length ? totalPlanned / plannedRs.length : null,
    averageRewardCaptured: realizedRs.length ? totalRealized / realizedRs.length : null,
    rDistribution: distribution,
    riskEfficiency: grossLostR > 0 ? grossWonR / grossLostR : null,
    rewardCapturePercent: totalPlanned > 0 ? (totalRealized / totalPlanned) * 100 : null,
    stopLossFrequency: (records.filter((r) => r.closeReason === "stop_loss").length / n) * 100,
    takeProfitFrequency: (records.filter((r) => r.closeReason === "take_profit").length / n) * 100,
    manualCloseFrequency: (records.filter((r) => r.closeReason === "manual").length / n) * 100,
    sampleWithRisk: risks.length,
    sampleWithPlannedR: plannedRs.length,
  };
}

// ── §7 Execution quality ────────────────────────────────────────────────────

export interface ExecutionQualityMetrics {
  averageEntrySlippage: number | null;
  /** Exit slippage is only knowable per-leg; unavailable without tape prices. */
  averageExitSlippage: number | null;
  totalSlippageCost: number | null;

  /** Mean R of positions that used the feature minus mean R of those that did not. */
  partialCloseEffect: number | null;
  scaleInEffect: number | null;
  breakEvenEffect: number | null;
  trailingStopEffect: number | null;

  averagePlannedR: number | null;
  averageRealizedR: number | null;
  /** Planned R never captured, in R, across winners that exited early. */
  rewardLeftOnTable: number | null;

  /** §7: only measurable with a market path — always unavailable here. */
  adverseExcursion: { available: false; reason: string };
  favourableExcursion: { available: false; reason: string };

  /** How much of the planned move the entry captured. */
  entryEfficiency: number | null;
  exitEfficiency: number | null;

  stopMovementFrequency: number;
  averageExecutionsPerPosition: number | null;
  tapeCoverage: number;
}

const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function rOf(r: AnalyticsRecord): number | null {
  return r.realizedR != null && Number.isFinite(r.realizedR) ? r.realizedR : null;
}

/** mean R with the feature − mean R without it; null when either side is empty. */
function featureEffect(
  records: readonly AnalyticsRecord[],
  predicate: (r: AnalyticsRecord) => boolean,
): number | null {
  const withR = records.filter((r) => rOf(r) != null);
  const on = withR.filter(predicate).map((r) => rOf(r) as number);
  const off = withR.filter((r) => !predicate(r)).map((r) => rOf(r) as number);
  const a = mean(on);
  const b = mean(off);
  return a != null && b != null ? a - b : null;
}

export function computeExecutionQuality(
  records: readonly AnalyticsRecord[],
): ExecutionQualityMetrics {
  const slippages = records.map((r) => r.slippage).filter((v): v is number => v != null);
  const plannedRs = records.map((r) => r.plannedR).filter((v): v is number => v != null);
  const realizedRs = records.map((r) => rOf(r)).filter((v): v is number => v != null);
  const withTape = records.filter((r) => r.tape.present);

  const winners = records.filter((r) => r.result === "win" && r.plannedR != null && rOf(r) != null);
  const left = winners
    .map((r) => (r.plannedR as number) - (rOf(r) as number))
    .filter((v) => v > 0);

  const entryEff = records
    .map((r) => {
      if (r.fillPrice == null || r.initialStop == null) return null;
      const risk = Math.abs(r.fillPrice - r.initialStop);
      if (!(risk > 0) || r.slippage == null) return null;
      return Math.max(0, 1 - Math.abs(r.slippage) / risk) * 100;
    })
    .filter((v): v is number => v != null);

  const exitEff = records
    .map((r) => {
      if (r.plannedR == null || r.plannedR <= 0) return null;
      const realized = rOf(r);
      if (realized == null || realized <= 0) return null;
      return Math.min(100, (realized / r.plannedR) * 100);
    })
    .filter((v): v is number => v != null);

  const n = records.length || 1;
  return {
    averageEntrySlippage: mean(slippages),
    averageExitSlippage: null,
    totalSlippageCost: slippages.length ? slippages.reduce((a, b) => a + Math.abs(b), 0) : null,

    partialCloseEffect: featureEffect(records, (r) => r.tape.partialExits > 0),
    scaleInEffect: featureEffect(records, (r) => r.tape.scaleIns > 0),
    breakEvenEffect: featureEffect(records, (r) => r.tape.breakEvenEvents > 0),
    trailingStopEffect: featureEffect(records, (r) => r.tape.trailingEvents > 0),

    averagePlannedR: mean(plannedRs),
    averageRealizedR: mean(realizedRs),
    rewardLeftOnTable: left.length ? left.reduce((a, b) => a + b, 0) : null,

    adverseExcursion: {
      available: false,
      reason: "MAE needs intra-trade market path data, which is not recorded yet.",
    },
    favourableExcursion: {
      available: false,
      reason: "MFE needs intra-trade market path data, which is not recorded yet.",
    },

    entryEfficiency: mean(entryEff),
    exitEfficiency: mean(exitEff),

    stopMovementFrequency: (records.filter((r) => r.tape.stopMoves > 0).length / n) * 100,
    averageExecutionsPerPosition: withTape.length
      ? withTape.reduce((s, r) => s + r.tape.executionCount, 0) / withTape.length
      : null,
    tapeCoverage: (withTape.length / n) * 100,
  };
}

/** Median hold time helper reused by cohort tables. */
export function medianDuration(records: readonly AnalyticsRecord[]): number | null {
  return median(records.map((r) => r.duration).filter((d) => d > 0));
}

export { pnlOf };

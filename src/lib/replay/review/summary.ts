/**
 * Phase 8D · Completed-session summary — pure derivation, zero new formulas.
 *
 * A Replay session's result is NOT a second analytics dialect. Canonical
 * `ClosedTrade` records are adapted with `fromClosedTrade()` and then handed
 * to the same engine the Portfolio Analytics workspace uses
 * (`computePerformance`, `buildEquitySeries`, `computeDrawdown`,
 * `computeBehaviour`). If the two ever disagreed, one of them would be lying —
 * so there is only one implementation.
 *
 * Unknown stays unknown: with no starting balance the summary reports
 * `endingBalance: null` and records the reason in `unknowns` rather than
 * inventing 10,000.
 */

import type { ClosedTrade } from "@/lib/chart/orders/closed-trade";
import { fromClosedTrade } from "@/lib/analytics/normalize";
import { computePerformance, type PerformanceMetrics } from "@/lib/analytics/expectancy";
import { buildEquitySeries, type EquitySeries } from "@/lib/analytics/equity";
import { computeDrawdown, type DrawdownMetrics } from "@/lib/analytics/drawdown";
import { computeBehaviour, type BehaviourAnalytics } from "@/lib/analytics/behaviour";

/** Bump when the SHAPE of the summary changes, so cached rows stay readable. */
export const SUMMARY_VERSION = 1;

export interface SummaryReflectionCounts {
  notes: number;
  bookmarks: number;
  checkpoints: number;
  screenshots: number;
  checklistDone: number;
  checklistTotal: number;
}

export const EMPTY_REFLECTION_COUNTS: SummaryReflectionCounts = {
  notes: 0, bookmarks: 0, checkpoints: 0, screenshots: 0, checklistDone: 0, checklistTotal: 0,
};

export interface ReplaySessionSummary {
  version: number;
  sessionId: string;
  symbol: string | null;
  timeframe: string | null;
  status: string | null;
  /** Wall-clock the session was worked on, seconds; null when not recorded. */
  durationSeconds: number | null;
  completionPct: number | null;

  startingBalance: number | null;
  /** startingBalance + net P/L, or null when the balance is unknown. */
  endingBalance: number | null;
  returnPercent: number | null;

  performance: PerformanceMetrics;
  equity: EquitySeries;
  drawdown: DrawdownMetrics;
  behaviour: BehaviourAnalytics;

  bestTradeId: string | null;
  worstTradeId: string | null;

  reflection: SummaryReflectionCounts;
  journalCoveragePercent: number;

  /** Human-readable list of everything that could NOT be measured. */
  unknowns: string[];
}

export interface SummaryInput {
  sessionId: string;
  symbol?: string | null;
  timeframe?: string | null;
  status?: string | null;
  durationSeconds?: number | null;
  completionPct?: number | null;
  startingBalance?: number | null;
  trades: readonly ClosedTrade[];
  reflection?: Partial<SummaryReflectionCounts>;
}

export function buildSessionSummary(input: SummaryInput): ReplaySessionSummary {
  const startingBalance =
    typeof input.startingBalance === "number" && Number.isFinite(input.startingBalance) && input.startingBalance > 0
      ? input.startingBalance
      : null;

  const records = input.trades.map((t) => fromClosedTrade(t));
  const performance = computePerformance(records, { startingBalance });
  const equity = buildEquitySeries(records, { resolution: "trade", startingBalance });
  const drawdown = computeDrawdown(equity);
  const behaviour = computeBehaviour(records);

  const unknowns: string[] = [];
  if (startingBalance == null) unknowns.push("Starting balance unknown — balance and return % are not measurable.");
  if (performance.rSampleSize === 0 && records.length > 0) unknowns.push("No trade carried a risk basis — R metrics unavailable.");
  if (records.length === 0) unknowns.push("No trades were closed in this session.");

  let best: { id: string; pnl: number } | null = null;
  let worst: { id: string; pnl: number } | null = null;
  for (const r of records) {
    if (!best || r.netPnl > best.pnl) best = { id: r.tradeId, pnl: r.netPnl };
    if (!worst || r.netPnl < worst.pnl) worst = { id: r.tradeId, pnl: r.netPnl };
  }

  const reflection: SummaryReflectionCounts = { ...EMPTY_REFLECTION_COUNTS, ...(input.reflection ?? {}) };

  return {
    version: SUMMARY_VERSION,
    sessionId: input.sessionId,
    symbol: input.symbol ?? null,
    timeframe: input.timeframe ?? null,
    status: input.status ?? null,
    durationSeconds: input.durationSeconds ?? null,
    completionPct: input.completionPct ?? null,

    startingBalance,
    endingBalance: startingBalance == null ? null : startingBalance + performance.netPnl,
    returnPercent: performance.totalReturnPercent,

    performance,
    equity,
    drawdown,
    behaviour,

    bestTradeId: best?.id ?? null,
    worstTradeId: worst?.id ?? null,

    reflection,
    journalCoveragePercent: behaviour.facts.coveragePercent,
    unknowns,
  };
}

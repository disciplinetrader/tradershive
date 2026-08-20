/**
 * The analytics engine (§1, §20).
 *
 * Pure function: dataset + filters + options → one immutable result object.
 * It never mutates accounts, orders, positions, closed trades or journal
 * records, and it is the only place the individual metric modules are
 * composed, so no UI component can assemble a different portfolio picture.
 */

import type { AccountSnapshot, AnalyticsDataset, AnalyticsRecord } from "./model";
import { applyFilters, isDefaultFilters, type AnalyticsFilters } from "./filters";
import { computePerformance, type PerformanceMetrics } from "./expectancy";
import { buildEquitySeries, returnSeries, type EquitySeries } from "./equity";
import { computeDrawdown, recoveryFactor, type DrawdownMetrics } from "./drawdown";
import { computeRisk, computeExecutionQuality, type ExecutionQualityMetrics, type RiskMetrics } from "./execution-quality";
import { computeBehaviour, type BehaviourAnalytics, type BehaviourThresholds } from "./behaviour";
import {
  accountComparison, breakdowns, playbookAnalytics, timeAnalytics, DEFAULT_MIN_SAMPLE,
  type BreakdownBundle, type PlaybookRow, type PortfolioComparison, type TimeAnalytics,
} from "./cohorts";
import { type Resolution } from "./periods";

export type AnalyticsState =
  | "no_trades"
  | "no_matches"
  | "ready";

export interface DataCoverage {
  /** Share of records carrying a usable risk basis. */
  riskBasisPercent: number;
  /** Share of records carrying journal metadata. */
  journalPercent: number;
  /** Share of records carrying an execution tape. */
  tapePercent: number;
  /** True when at least one in-scope account has no starting balance. */
  missingAccountHistory: boolean;
  /** Human-readable notes surfaced as "partial data" banners (§17). */
  notes: string[];
}

export interface AnalyticsResult {
  state: AnalyticsState;
  timezone: string;
  resolution: Resolution;

  /** Records after filtering — the sample every metric was computed from. */
  records: AnalyticsRecord[];
  totalRecords: number;

  performance: PerformanceMetrics;
  equity: EquitySeries;
  equityDaily: EquitySeries;
  equityWeekly: EquitySeries;
  equityMonthly: EquitySeries;
  returns: { time: number; value: number }[];
  drawdown: DrawdownMetrics;
  risk: RiskMetrics;
  execution: ExecutionQualityMetrics;
  behaviour: BehaviourAnalytics;
  playbooks: PlaybookRow[];
  breakdown: BreakdownBundle;
  time: TimeAnalytics;
  comparison: PortfolioComparison;
  coverage: DataCoverage;
}

export interface EngineOptions {
  resolution?: Resolution;
  minSample?: number;
  /**
   * REMOVED 2026-08-20 (MS-2). This configured a UTC time-band partition used
   * as a fallback when a trade had no journal session label. Sessions now come
   * from `@/lib/market-sessions` in every path, so there is nothing for a
   * caller to configure here. Time bands still exist in `periods.ts` under
   * their own name; they are simply not a session.
   */
  behaviourThresholds?: BehaviourThresholds;
}

/**
 * Starting balance for the scoped account set. Combined scopes sum the
 * per-account starting balances; a scope with any unknown balance yields
 * `null` so no fabricated percentage is ever produced (§6, §12).
 */
export function scopedStartingBalance(
  accounts: readonly AccountSnapshot[],
  accountIds: string[],
): number | null {
  const scope = accountIds.length ? accounts.filter((a) => accountIds.includes(a.accountId)) : accounts;
  if (scope.length === 0) return null;
  let total = 0;
  for (const a of scope) {
    if (a.startingBalance == null || a.startingBalance <= 0) return null;
    total += a.startingBalance;
  }
  return total;
}

export function runAnalytics(
  dataset: AnalyticsDataset,
  filters: AnalyticsFilters,
  options: EngineOptions = {},
): AnalyticsResult {
  const resolution = options.resolution ?? "trade";
  const tz = dataset.timezone;
  const excludeFees = filters.excludeFees;

  const records = applyFilters(dataset.records, filters);
  const startingBalance = scopedStartingBalance(dataset.accounts, filters.accounts);

  const cohortOpts = {
    excludeFees,
    minSample: options.minSample ?? DEFAULT_MIN_SAMPLE,
    timezone: tz,
  };

  const equity = buildEquitySeries(records, { resolution, timezone: tz, excludeFees, startingBalance });
  const drawdown = computeDrawdown(
    resolution === "trade"
      ? equity
      : buildEquitySeries(records, { resolution: "trade", timezone: tz, excludeFees, startingBalance }),
  );

  const performance = computePerformance(records, { excludeFees, startingBalance });
  performance.recoveryFactor = recoveryFactor(performance.netPnl, drawdown.maxDrawdown);

  const withRisk = records.filter((r) => r.riskAmount != null && r.riskAmount > 0).length;
  const withJournal = records.filter((r) => r.journal.journalEntryId != null).length;
  const withTape = records.filter((r) => r.tape.present).length;
  const n = records.length || 1;

  const notes: string[] = [];
  if (records.length && withRisk < records.length) {
    notes.push(`${records.length - withRisk} trade(s) have no risk basis — R metrics use the ${withRisk} that do.`);
  }
  if (records.length && withJournal === 0) {
    notes.push("No journal metadata in this selection — behaviour and playbook analytics are empty by design.");
  }
  if (startingBalance == null) {
    notes.push("Account starting balance unavailable — percentage returns and drawdown % are not shown.");
  }
  if (records.length && withTape === 0) {
    notes.push("No execution tapes in this selection — partial, scale-in and trailing statistics are unavailable.");
  }

  const state: AnalyticsState =
    dataset.records.length === 0 ? "no_trades" : records.length === 0 ? "no_matches" : "ready";

  return {
    state,
    timezone: tz,
    resolution,

    records,
    totalRecords: dataset.records.length,

    performance,
    equity,
    equityDaily: buildEquitySeries(records, { resolution: "daily", timezone: tz, excludeFees, startingBalance }),
    equityWeekly: buildEquitySeries(records, { resolution: "weekly", timezone: tz, excludeFees, startingBalance }),
    equityMonthly: buildEquitySeries(records, { resolution: "monthly", timezone: tz, excludeFees, startingBalance }),
    returns: returnSeries(equity),
    drawdown,
    risk: computeRisk(records, { startingBalance }),
    execution: computeExecutionQuality(records),
    behaviour: computeBehaviour(records, { excludeFees, thresholds: options.behaviourThresholds }),
    playbooks: playbookAnalytics(records, cohortOpts),
    breakdown: breakdowns(records, cohortOpts),
    time: timeAnalytics(records, cohortOpts),
    comparison: accountComparison(records, dataset.accounts, cohortOpts),
    coverage: {
      riskBasisPercent: (withRisk / n) * 100,
      journalPercent: (withJournal / n) * 100,
      tapePercent: (withTape / n) * 100,
      missingAccountHistory: startingBalance == null,
      notes,
    },
  };
}

/** True when the empty state should read "no trades match your filters". */
export function isFilteredEmpty(result: AnalyticsResult, filters: AnalyticsFilters): boolean {
  return result.state === "no_matches" && !isDefaultFilters(filters);
}

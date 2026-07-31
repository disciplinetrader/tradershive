/**
 * §9–§12 Cohort analytics: playbooks, symbols, direction, sessions, time and
 * account comparison.
 *
 * Every cohort row reuses `computePerformance` + `buildEquitySeries` +
 * `computeDrawdown`, so a group's numbers are computed with exactly the same
 * formulas as the portfolio headline.
 */

import type { AnalyticsRecord, AccountSnapshot } from "./model";
import { computePerformance, type PerformanceMetrics } from "./expectancy";
import { buildEquitySeries } from "./equity";
import { computeDrawdown } from "./drawdown";
import {
  classifySession, DEFAULT_SESSIONS, hourOfDay, weekdayLabel, monthKey, quarterKey,
  type SessionWindow,
} from "./periods";

/** Below this many trades a cohort is never ranked best/worst (§9). */
export const DEFAULT_MIN_SAMPLE = 10;

export interface CohortRow {
  key: string;
  label: string;
  count: number;
  netPnl: number;
  totalR: number | null;
  averageR: number | null;
  winRate: number;
  expectancy: number | null;
  profitFactor: number | null;
  maxDrawdown: number;
  averageDurationSeconds: number | null;
  /** False when `count` is under the configured minimum sample size. */
  rankable: boolean;
  performance: PerformanceMetrics;
}

export interface CohortOptions {
  excludeFees?: boolean;
  minSample?: number;
  timezone?: string;
}

function buildRow(
  key: string,
  label: string,
  records: AnalyticsRecord[],
  opts: CohortOptions,
): CohortRow {
  const perf = computePerformance(records, { excludeFees: opts.excludeFees });
  const dd = computeDrawdown(
    buildEquitySeries(records, { resolution: "trade", excludeFees: opts.excludeFees }),
  );
  return {
    key,
    label,
    count: perf.tradeCount,
    netPnl: perf.netPnl,
    totalR: perf.totalR,
    averageR: perf.averageR,
    winRate: perf.winRate,
    expectancy: perf.expectancy,
    profitFactor: perf.profitFactor,
    maxDrawdown: dd.maxDrawdown,
    averageDurationSeconds: perf.averageHoldSeconds,
    rankable: perf.tradeCount >= (opts.minSample ?? DEFAULT_MIN_SAMPLE),
    performance: perf,
  };
}

export function groupBy(
  records: readonly AnalyticsRecord[],
  keyOf: (r: AnalyticsRecord) => string | null,
  opts: CohortOptions = {},
  labelOf: (key: string) => string = (k) => k,
): CohortRow[] {
  const map = new Map<string, AnalyticsRecord[]>();
  for (const r of records) {
    const k = keyOf(r);
    if (k == null) continue;
    const arr = map.get(k) ?? [];
    arr.push(r);
    map.set(k, arr);
  }
  return [...map.entries()]
    .map(([k, rs]) => buildRow(k, labelOf(k), rs, opts))
    .sort((a, b) => b.netPnl - a.netPnl);
}

/** Best / worst honouring the minimum sample threshold (§9). */
export function rank(rows: CohortRow[]): { best: CohortRow | null; worst: CohortRow | null; excluded: number } {
  const eligible = rows.filter((r) => r.rankable);
  if (eligible.length === 0) return { best: null, worst: null, excluded: rows.length };
  const sorted = [...eligible].sort((a, b) => (b.averageR ?? b.netPnl) - (a.averageR ?? a.netPnl));
  return { best: sorted[0], worst: sorted[sorted.length - 1], excluded: rows.length - eligible.length };
}

// ── §9 Playbooks ────────────────────────────────────────────────────────────

export interface PlaybookRow extends CohortRow {
  bestSymbol: string | null;
  bestSession: string | null;
  planAdherence: number | null;
  confidenceDistribution: { confidence: number; count: number }[];
}

export function playbookAnalytics(
  records: readonly AnalyticsRecord[],
  opts: CohortOptions = {},
  sessions: SessionWindow[] = DEFAULT_SESSIONS,
): PlaybookRow[] {
  const base = groupBy(records, (r) => r.journal.playbook ?? r.journal.setup, opts);
  return base.map((row) => {
    const rs = records.filter((r) => (r.journal.playbook ?? r.journal.setup) === row.key);

    const symbolRows = groupBy(rs, (r) => r.symbol, opts);
    const sessionRows = groupBy(rs, (r) => r.journal.session ?? classifySession(r.entryTime, sessions)?.id ?? null, opts);

    const answered = rs.filter((r) => r.journal.followedPlan != null);
    const conf = new Map<number, number>();
    for (const r of rs) {
      if (r.journal.confidence == null) continue;
      const c = Math.round(r.journal.confidence);
      conf.set(c, (conf.get(c) ?? 0) + 1);
    }

    return {
      ...row,
      bestSymbol: symbolRows[0]?.key ?? null,
      bestSession: sessionRows[0]?.key ?? null,
      planAdherence: answered.length
        ? (answered.filter((r) => r.journal.followedPlan === true).length / answered.length) * 100
        : null,
      confidenceDistribution: [...conf.entries()]
        .map(([confidence, count]) => ({ confidence, count }))
        .sort((a, b) => a.confidence - b.confidence),
    };
  });
}

// ── §10 Symbol / market / direction ─────────────────────────────────────────

export interface BreakdownBundle {
  symbol: CohortRow[];
  assetClass: CohortRow[];
  market: CohortRow[];
  direction: CohortRow[];
  orderType: CohortRow[];
  closeReason: CohortRow[];
  executionSource: CohortRow[];
  setup: CohortRow[];
}

export function breakdowns(records: readonly AnalyticsRecord[], opts: CohortOptions = {}): BreakdownBundle {
  return {
    symbol: groupBy(records, (r) => r.symbol, opts),
    assetClass: groupBy(records, (r) => r.assetClass, opts),
    market: groupBy(records, (r) => r.market, opts),
    direction: groupBy(records, (r) => r.direction, opts, (k) => (k === "long" ? "Long" : "Short")),
    orderType: groupBy(records, (r) => r.orderType, opts),
    closeReason: groupBy(records, (r) => r.closeReason, opts),
    executionSource: groupBy(records, (r) => r.executionSource, opts),
    setup: groupBy(records, (r) => r.journal.setup, opts),
  };
}

// ── §11 Sessions and time ───────────────────────────────────────────────────

export interface HeatCell {
  key: string;
  label: string;
  count: number;
  netPnl: number;
  totalR: number | null;
  winRate: number;
}

export interface TimeAnalytics {
  sessions: CohortRow[];
  weekdays: CohortRow[];
  hours: HeatCell[];
  months: CohortRow[];
  quarters: CohortRow[];
  bestSession: CohortRow | null;
  worstSession: CohortRow | null;
  bestWeekday: CohortRow | null;
  worstWeekday: CohortRow | null;
  /** weekday × hour grid for the performance heatmap. */
  heatmap: { weekday: number; hour: number; count: number; netPnl: number; totalR: number | null }[];
}

export function timeAnalytics(
  records: readonly AnalyticsRecord[],
  opts: CohortOptions = {},
  sessions: SessionWindow[] = DEFAULT_SESSIONS,
): TimeAnalytics {
  const tz = opts.timezone ?? "UTC";
  const sessionLabel = (id: string) => sessions.find((s) => s.id === id)?.label ?? id;

  const sessionRows = groupBy(
    records,
    (r) => r.journal.session ?? classifySession(r.entryTime, sessions)?.id ?? null,
    opts,
    sessionLabel,
  );
  const weekdayRows = groupBy(records, (r) => weekdayLabel(r.exitTime, tz), opts);

  const hourMap = new Map<number, AnalyticsRecord[]>();
  const grid = new Map<string, AnalyticsRecord[]>();
  for (const r of records) {
    const h = hourOfDay(r.entryTime, tz);
    hourMap.set(h, [...(hourMap.get(h) ?? []), r]);
    const wd = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" });
    void wd; // weekday index derives from the shared helper below
  }

  const heatmap: TimeAnalytics["heatmap"] = [];
  for (const r of records) {
    const h = hourOfDay(r.entryTime, tz);
    const wdName = weekdayLabel(r.entryTime, tz);
    const wd = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].indexOf(wdName);
    const key = `${wd}:${h}`;
    grid.set(key, [...(grid.get(key) ?? []), r]);
  }
  for (const [key, rs] of grid) {
    const [wd, h] = key.split(":").map(Number);
    const rvals = rs.map((r) => r.realizedR).filter((v): v is number => v != null);
    heatmap.push({
      weekday: wd,
      hour: h,
      count: rs.length,
      netPnl: rs.reduce((s, r) => s + (opts.excludeFees ? r.grossPnl : r.netPnl), 0),
      totalR: rvals.length ? rvals.reduce((a, b) => a + b, 0) : null,
    });
  }

  const hours: HeatCell[] = [...hourMap.entries()]
    .map(([h, rs]) => {
      const rvals = rs.map((r) => r.realizedR).filter((v): v is number => v != null);
      return {
        key: String(h),
        label: `${String(h).padStart(2, "0")}:00`,
        count: rs.length,
        netPnl: rs.reduce((s, r) => s + (opts.excludeFees ? r.grossPnl : r.netPnl), 0),
        totalR: rvals.length ? rvals.reduce((a, b) => a + b, 0) : null,
        winRate: (rs.filter((r) => r.result === "win").length / rs.length) * 100,
      };
    })
    .sort((a, b) => Number(a.key) - Number(b.key));

  const sessionRank = rank(sessionRows);
  const weekdayRank = rank(weekdayRows);

  return {
    sessions: sessionRows,
    weekdays: weekdayRows,
    hours,
    months: groupBy(records, (r) => monthKey(r.exitTime, tz), opts),
    quarters: groupBy(records, (r) => quarterKey(r.exitTime, tz), opts),
    bestSession: sessionRank.best,
    worstSession: sessionRank.worst,
    bestWeekday: weekdayRank.best,
    worstWeekday: weekdayRank.worst,
    heatmap: heatmap.sort((a, b) => a.weekday - b.weekday || a.hour - b.hour),
  };
}

// ── §12 Account comparison ──────────────────────────────────────────────────

export interface AccountComparisonRow extends CohortRow {
  accountId: string;
  accountName: string;
  currency: string;
  startingBalance: number | null;
  /** Net P/L as % of THIS account's starting balance; null when unknown. */
  returnPercent: number | null;
  riskUsagePercent: number | null;
  ruleBreaches: number;
}

export interface PortfolioComparison {
  accounts: AccountComparisonRow[];
  /**
   * Combined portfolio return, weighted by starting balance — never the mean
   * of the per-account percentages (§12).
   */
  combinedReturnPercent: number | null;
  combinedNetPnl: number;
  combinedStartingBalance: number | null;
  /** True when at least one in-scope account has no starting balance. */
  partialBalanceData: boolean;
}

export function accountComparison(
  records: readonly AnalyticsRecord[],
  accounts: readonly AccountSnapshot[],
  opts: CohortOptions = {},
): PortfolioComparison {
  const byAccount = new Map<string, AnalyticsRecord[]>();
  for (const r of records) {
    const k = r.accountId ?? "__unassigned";
    byAccount.set(k, [...(byAccount.get(k) ?? []), r]);
  }

  let combinedNet = 0;
  let combinedBase = 0;
  let anyBase = false;
  let partial = false;

  const rows: AccountComparisonRow[] = [];
  for (const [accountId, rs] of byAccount) {
    const snap = accounts.find((a) => a.accountId === accountId) ?? null;
    const row = buildRow(accountId, snap?.name ?? "Unassigned", rs, opts);
    const base = snap?.startingBalance ?? null;
    if (base != null && base > 0) {
      combinedBase += base;
      anyBase = true;
    } else {
      partial = true;
    }
    combinedNet += row.netPnl;

    const risks = rs.map((r) => r.riskAmount).filter((v): v is number => v != null && v > 0);
    rows.push({
      ...row,
      accountId,
      accountName: snap?.name ?? "Unassigned",
      currency: snap?.currency ?? "USD",
      startingBalance: base,
      returnPercent: base != null && base > 0 ? (row.netPnl / base) * 100 : null,
      riskUsagePercent:
        base != null && base > 0 && risks.length
          ? ((risks.reduce((a, b) => a + b, 0) / risks.length) / base) * 100
          : null,
      ruleBreaches: rs.filter((r) => r.journal.followedPlan === false).length,
    });
  }

  return {
    accounts: rows.sort((a, b) => b.netPnl - a.netPnl),
    combinedNetPnl: combinedNet,
    combinedStartingBalance: anyBase ? combinedBase : null,
    combinedReturnPercent: anyBase && combinedBase > 0 ? (combinedNet / combinedBase) * 100 : null,
    partialBalanceData: partial,
  };
}

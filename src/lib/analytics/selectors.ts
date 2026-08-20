/**
 * §20 Selectors — the ONLY thing the UI is allowed to read.
 *
 * A selector turns the engine result into a view model. It may reshape,
 * label and format, but it must never introduce a formula: every number here
 * already came out of the engine.
 */

import type { AnalyticsResult } from "./engine";
import type { AnalyticsDataset, AnalyticsRecord, Measured } from "./model";
import { measured } from "./model";
import type { AnalyticsFilters } from "./filters";
import { sessionAt } from "@/lib/market-sessions";

export type MetricFormat = "currency" | "percent" | "r" | "number" | "duration";

export interface MetricView {
  id: string;
  label: string;
  value: Measured<number>;
  format: MetricFormat;
  hint?: string;
  tone?: "up" | "down" | "flat";
}

const tone = (v: number | null): "up" | "down" | "flat" =>
  v == null || v === 0 ? "flat" : v > 0 ? "up" : "down";

/** §14A — the eight headline KPIs. */
export function selectOverview(result: AnalyticsResult): MetricView[] {
  const p = result.performance;
  return [
    { id: "net_pnl", label: "Net P/L", value: measured(p.netPnl, "No trades"), format: "currency", tone: tone(p.netPnl) },
    { id: "total_r", label: "Total R", value: measured(p.totalR, "No trade has a risk basis"), format: "r", tone: tone(p.totalR) },
    { id: "win_rate", label: "Win rate", value: measured(p.tradeCount ? p.winRate : null, "No trades"), format: "percent" },
    { id: "expectancy", label: "Expectancy", value: measured(p.expectancy, "No trades"), format: "currency", tone: tone(p.expectancy) },
    { id: "profit_factor", label: "Profit factor", value: measured(p.profitFactor, "No losing trades yet"), format: "number" },
    { id: "max_dd", label: "Max drawdown", value: measured(p.tradeCount ? result.drawdown.maxDrawdown : null, "No trades"), format: "currency", tone: "down" },
    { id: "trades", label: "Trades", value: measured(p.tradeCount, "No trades"), format: "number" },
    { id: "avg_r", label: "Average R", value: measured(p.averageR, "No trade has a risk basis"), format: "r", tone: tone(p.averageR) },
  ];
}

export interface SeriesPoint {
  x: number;
  label: string;
  value: number;
}

/** Cumulative P/L series for the equity chart (§14B). */
export function selectEquitySeries(result: AnalyticsResult): SeriesPoint[] {
  return result.equity.points.map((p) => ({
    x: result.resolution === "trade" ? p.index : p.time,
    label: result.resolution === "trade" ? `Trade ${p.index}` : p.key,
    value: p.cumulativePnl,
  }));
}

export function selectBalanceSeries(result: AnalyticsResult): SeriesPoint[] {
  return result.equity.points
    .filter((p) => p.balance != null)
    .map((p) => ({
      x: result.resolution === "trade" ? p.index : p.time,
      label: result.resolution === "trade" ? `Trade ${p.index}` : p.key,
      value: p.balance as number,
    }));
}

export function selectUnderwaterSeries(result: AnalyticsResult): SeriesPoint[] {
  return result.equity.points.map((p) => ({
    x: result.resolution === "trade" ? p.index : p.time,
    label: result.resolution === "trade" ? `Trade ${p.index}` : p.key,
    value: p.underwater,
  }));
}

export function selectCumulativeRSeries(result: AnalyticsResult): SeriesPoint[] {
  return result.equity.points
    .filter((p) => p.cumulativeR != null)
    .map((p) => ({
      x: result.resolution === "trade" ? p.index : p.time,
      label: result.resolution === "trade" ? `Trade ${p.index}` : p.key,
      value: p.cumulativeR as number,
    }));
}

/** Monthly return bars (§14C). */
export function selectMonthlyReturns(result: AnalyticsResult): SeriesPoint[] {
  return result.equityMonthly.points.map((p) => ({ x: p.time, label: p.key, value: p.periodPnl }));
}

/** P/L distribution histogram (§14C). Buckets are derived from the sample. */
export function selectPnlDistribution(result: AnalyticsResult, buckets = 9): { label: string; count: number }[] {
  const values = result.records.map((r) => (result.equity.startingBalance, r.netPnl));
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [{ label: min.toFixed(2), count: values.length }];
  const step = (max - min) / buckets;
  return Array.from({ length: buckets }, (_, i) => {
    const from = min + i * step;
    const to = i === buckets - 1 ? max + 1e-9 : from + step;
    return {
      label: `${from.toFixed(0)}…${to.toFixed(0)}`,
      count: values.filter((v) => v >= from && v < to).length,
    };
  });
}

export function selectWinLossSplit(result: AnalyticsResult): { label: string; count: number }[] {
  const p = result.performance;
  return [
    { label: "Winners", count: p.wins },
    { label: "Losers", count: p.losses },
    { label: "Break-even", count: p.breakEvens },
  ];
}

/** Distinct filter options harvested from the dataset (§13). */
export interface FilterOptions {
  accounts: { id: string; label: string }[];
  symbols: string[];
  assetClasses: string[];
  setups: string[];
  playbooks: string[];
  sessions: string[];
  orderTypes: string[];
  closeReasons: string[];
  executionSources: string[];
  journalStatuses: string[];
  tags: string[];
}

export function selectFilterOptions(dataset: AnalyticsDataset): FilterOptions {
  const set = (pick: (r: AnalyticsRecord) => string | null | undefined) =>
    [...new Set(dataset.records.map(pick).filter((v): v is string => !!v))].sort();

  return {
    accounts: dataset.accounts.map((a) => ({ id: a.accountId, label: a.name })),
    symbols: set((r) => r.symbol),
    assetClasses: set((r) => r.assetClass),
    setups: set((r) => r.journal.setup),
    playbooks: set((r) => r.journal.playbook),
    sessions: [
      ...new Set(
        dataset.records
          .map((r) => r.journal.session ?? sessionAt(r.entryTime))
          .filter((v): v is NonNullable<typeof v> => !!v),
      ),
    ].sort(),
    orderTypes: set((r) => r.orderType),
    closeReasons: set((r) => r.closeReason),
    executionSources: set((r) => r.executionSource),
    journalStatuses: set((r) => r.journal.status),
    tags: [...new Set(dataset.records.flatMap((r) => r.journal.tags))].sort(),
  };
}

/** Count of active narrowing clauses — drives the "N filters" chip. */
export function activeFilterCount(f: AnalyticsFilters): number {
  let n = 0;
  if (f.from != null || f.to != null) n += 1;
  for (const key of [
    "accounts", "symbols", "assetClasses", "directions", "setups", "playbooks",
    "sessions", "orderTypes", "closeReasons", "executionSources", "journalStatuses", "tags",
  ] as const) {
    if (f[key].length) n += 1;
  }
  if (f.outcome !== "all") n += 1;
  if (f.archived !== "active") n += 1;
  if (f.excludeFees) n += 1;
  return n;
}

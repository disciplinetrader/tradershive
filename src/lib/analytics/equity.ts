/**
 * §4 Canonical equity / balance time series.
 *
 * Deterministic ordering: exitTime, then tradeId as the tiebreaker, so two
 * trades closing in the same millisecond always fold in the same order and a
 * refresh reproduces the identical curve.
 */

import type { AnalyticsRecord } from "./model";
import { pnlOf } from "./expectancy";
import { periodKey, type Resolution } from "./periods";

export interface EquityPoint {
  /** Bucket identity: epoch-ms for trade resolution, date key otherwise. */
  key: string;
  /** Representative instant of the bucket (the last trade in it). */
  time: number;
  /** Index in the series, 1-based — used for the trade-by-trade x axis. */
  index: number;
  /** Trades folded into this bucket. */
  trades: number;
  /** P/L of this bucket only. */
  periodPnl: number;
  /** R of this bucket only; null when no trade in it had a risk basis. */
  periodR: number | null;
  /** Running account balance (starting balance + cumulative net P/L). */
  balance: number | null;
  /** Running equity — equal to balance here: closed trades carry no float. */
  equity: number | null;
  cumulativePnl: number;
  cumulativeR: number | null;
  /** Peak of cumulativePnl seen so far. */
  peak: number;
  /** cumulativePnl − peak, always ≤ 0. */
  underwater: number;
  /** Period return as % of the balance at period open; null without a balance. */
  returnPercent: number | null;
}

export interface EquitySeries {
  points: EquityPoint[];
  resolution: Resolution;
  /** null when the account's starting balance is unknown (§6/§17). */
  startingBalance: number | null;
  finalCumulativePnl: number;
  finalCumulativeR: number | null;
}

export function sortRecords(records: readonly AnalyticsRecord[]): AnalyticsRecord[] {
  return [...records].sort(
    (a, b) => a.exitTime - b.exitTime || a.tradeId.localeCompare(b.tradeId),
  );
}

export interface EquityOptions {
  resolution?: Resolution;
  timezone?: string;
  excludeFees?: boolean;
  /** Omit to get a pure P/L curve with `balance: null`. */
  startingBalance?: number | null;
}

export function buildEquitySeries(
  records: readonly AnalyticsRecord[],
  opts: EquityOptions = {},
): EquitySeries {
  const resolution = opts.resolution ?? "trade";
  const timezone = opts.timezone ?? "UTC";
  const excludeFees = !!opts.excludeFees;
  const startingBalance = opts.startingBalance ?? null;

  const ordered = sortRecords(records);

  // Bucket first so daily/weekly/monthly fold deterministically.
  const buckets = new Map<string, { time: number; pnl: number; r: number | null; trades: number }>();
  const order: string[] = [];

  for (const rec of ordered) {
    const key = periodKey(rec.exitTime, timezone, resolution);
    let b = buckets.get(key);
    if (!b) {
      b = { time: rec.exitTime, pnl: 0, r: null, trades: 0 };
      buckets.set(key, b);
      order.push(key);
    }
    b.time = Math.max(b.time, rec.exitTime);
    b.pnl += pnlOf(rec, excludeFees);
    b.trades += 1;
    if (rec.realizedR != null && Number.isFinite(rec.realizedR)) {
      b.r = (b.r ?? 0) + rec.realizedR;
    }
  }

  const points: EquityPoint[] = [];
  let cumulative = 0;
  let cumulativeR: number | null = null;
  let peak = 0;

  order.forEach((key, i) => {
    const b = buckets.get(key)!;
    const openBalance = startingBalance != null ? startingBalance + cumulative : null;
    cumulative += b.pnl;
    if (b.r != null) cumulativeR = (cumulativeR ?? 0) + b.r;
    peak = Math.max(peak, cumulative);

    points.push({
      key,
      time: b.time,
      index: i + 1,
      trades: b.trades,
      periodPnl: b.pnl,
      periodR: b.r,
      balance: startingBalance != null ? startingBalance + cumulative : null,
      equity: startingBalance != null ? startingBalance + cumulative : null,
      cumulativePnl: cumulative,
      cumulativeR,
      peak,
      underwater: cumulative - peak,
      returnPercent: openBalance != null && openBalance !== 0 ? (b.pnl / openBalance) * 100 : null,
    });
  });

  return {
    points,
    resolution,
    startingBalance,
    finalCumulativePnl: cumulative,
    finalCumulativeR: cumulativeR,
  };
}

/** Benchmark-ready per-period return series (§4). Empty without a balance. */
export function returnSeries(series: EquitySeries): { time: number; value: number }[] {
  if (series.startingBalance == null) return [];
  return series.points
    .filter((p) => p.returnPercent != null)
    .map((p) => ({ time: p.time, value: p.returnPercent as number }));
}

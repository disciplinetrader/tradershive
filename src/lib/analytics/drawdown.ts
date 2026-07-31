/**
 * §5 Drawdown analytics — computed from the canonical equity series only.
 *
 * Explicitly NOT the sum of losing trades: a drawdown is a peak-to-trough
 * excursion of the equity curve and must survive interleaved winners.
 */

import type { EquitySeries } from "./equity";

export interface DrawdownEpisode {
  /** Instant the equity curve left its peak. */
  startTime: number;
  /** Instant of the lowest point of the episode. */
  bottomTime: number;
  /** Instant the curve regained the prior peak; null while still underwater. */
  recoveryTime: number | null;
  /** Positive magnitude in account currency. */
  depth: number;
  /** Positive magnitude as % of the peak equity; null without a balance. */
  depthPercent: number | null;
  /** Seconds from start to recovery (or to the last point when unrecovered). */
  durationSeconds: number;
  recovered: boolean;
}

export interface DrawdownMetrics {
  currentDrawdown: number;
  currentDrawdownPercent: number | null;
  maxDrawdown: number;
  maxDrawdownPercent: number | null;
  drawdownStart: number | null;
  drawdownBottom: number | null;
  recoveryDate: number | null;
  recoveryDurationSeconds: number | null;
  longestDrawdownSeconds: number | null;
  averageDrawdown: number | null;
  /** Seconds spent below a prior peak across the whole series. */
  underwaterSeconds: number;
  episodes: DrawdownEpisode[];
}

export const EMPTY_DRAWDOWN: DrawdownMetrics = {
  currentDrawdown: 0,
  currentDrawdownPercent: null,
  maxDrawdown: 0,
  maxDrawdownPercent: null,
  drawdownStart: null,
  drawdownBottom: null,
  recoveryDate: null,
  recoveryDurationSeconds: null,
  longestDrawdownSeconds: null,
  averageDrawdown: null,
  underwaterSeconds: 0,
  episodes: [],
};

export function computeDrawdown(series: EquitySeries): DrawdownMetrics {
  const pts = series.points;
  if (pts.length === 0) return EMPTY_DRAWDOWN;

  const base = series.startingBalance;
  const episodes: DrawdownEpisode[] = [];

  let peak = 0;
  let peakTime = pts[0].time;
  let open: { startTime: number; bottomTime: number; depth: number; peakAt: number } | null = null;
  let underwaterSeconds = 0;

  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i];
    const prev = i > 0 ? pts[i - 1] : null;

    if (p.cumulativePnl > peak) {
      // New high: close any open episode as recovered.
      if (open) {
        episodes.push({
          startTime: open.startTime,
          bottomTime: open.bottomTime,
          recoveryTime: p.time,
          depth: open.depth,
          depthPercent: base != null && base + open.peakAt > 0
            ? (open.depth / (base + open.peakAt)) * 100
            : null,
          durationSeconds: Math.max(0, Math.round((p.time - open.startTime) / 1000)),
          recovered: true,
        });
        open = null;
      }
      peak = p.cumulativePnl;
      peakTime = p.time;
      continue;
    }

    const depth = peak - p.cumulativePnl;
    if (depth > 0) {
      if (prev) underwaterSeconds += Math.max(0, Math.round((p.time - prev.time) / 1000));
      if (!open) {
        open = { startTime: peakTime, bottomTime: p.time, depth, peakAt: peak };
      } else if (depth > open.depth) {
        open.depth = depth;
        open.bottomTime = p.time;
      }
    }
  }

  const last = pts[pts.length - 1];
  if (open) {
    episodes.push({
      startTime: open.startTime,
      bottomTime: open.bottomTime,
      recoveryTime: null,
      depth: open.depth,
      depthPercent: base != null && base + open.peakAt > 0
        ? (open.depth / (base + open.peakAt)) * 100
        : null,
      durationSeconds: Math.max(0, Math.round((last.time - open.startTime) / 1000)),
      recovered: false,
    });
  }

  const worst = episodes.reduce<DrawdownEpisode | null>(
    (acc, e) => (acc == null || e.depth > acc.depth ? e : acc),
    null,
  );

  const currentDrawdown = Math.max(0, peak - last.cumulativePnl);
  const currentBase = base != null ? base + peak : null;

  return {
    currentDrawdown,
    currentDrawdownPercent:
      currentBase != null && currentBase > 0 ? (currentDrawdown / currentBase) * 100 : null,
    maxDrawdown: worst?.depth ?? 0,
    maxDrawdownPercent: worst?.depthPercent ?? null,
    drawdownStart: worst?.startTime ?? null,
    drawdownBottom: worst?.bottomTime ?? null,
    recoveryDate: worst?.recoveryTime ?? null,
    recoveryDurationSeconds:
      worst && worst.recoveryTime != null
        ? Math.max(0, Math.round((worst.recoveryTime - worst.bottomTime) / 1000))
        : null,
    longestDrawdownSeconds: episodes.length
      ? Math.max(...episodes.map((e) => e.durationSeconds))
      : null,
    averageDrawdown: episodes.length
      ? episodes.reduce((s, e) => s + e.depth, 0) / episodes.length
      : null,
    underwaterSeconds,
    episodes,
  };
}

/** netPnl / maxDrawdown; null when the curve never drew down. */
export function recoveryFactor(netPnl: number, maxDrawdown: number): number | null {
  return maxDrawdown > 0 ? netPnl / maxDrawdown : null;
}

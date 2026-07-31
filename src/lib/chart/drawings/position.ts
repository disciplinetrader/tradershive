/**
 * Position tool — domain model and live metrics.
 *
 * Everything here is expressed in chart-domain units (price + epoch-ms).
 * The renderer converts to pixels every frame; nothing in this file knows
 * about the screen, which is what keeps a position glued to its candles
 * through zoom, pan, resize, fullscreen, replay and timeframe changes.
 *
 * Anchor contract (see types.ts):
 *   points[0] = { time: START, price: ENTRY }
 *   points[1] = { time: END,   price: TARGET }
 *   points[2] = { time: END,   price: STOP }
 */

import type { Drawing } from "./types";

export interface PositionModel {
  long: boolean;
  entry: number;
  target: number;
  stop: number;
  startTime: number;
  endTime: number;
}

export interface PositionMetrics extends PositionModel {
  /** Absolute price distance entry → stop. */
  risk: number;
  /** Absolute price distance entry → target. */
  reward: number;
  /** reward / risk (0 when risk is degenerate). */
  rr: number;
  riskTicks: number;
  rewardTicks: number;
  riskPct: number;
  rewardPct: number;
  /** Units sized off the risk budget; null until sizing is wired up. */
  size: number | null;
}

export function positionModel(d: Drawing): PositionModel | null {
  if (d.points.length < 3) return null;
  const [a, b, c] = d.points;
  if (![a.price, b.price, c.price, a.time, b.time].every(Number.isFinite)) return null;
  return {
    long: d.kind === "long_position",
    entry: a.price,
    target: b.price,
    stop: c.price,
    startTime: a.time,
    endTime: b.time,
  };
}

/**
 * Live metrics for the tool. Recomputed on demand (drag, redraw) — never
 * cached, so the numbers can't drift away from the stored anchors.
 */
export function positionMetrics(
  d: Drawing,
  opts: { tick?: number; riskBudget?: number } = {},
): PositionMetrics | null {
  const m = positionModel(d);
  if (!m) return null;
  const risk = Math.abs(m.entry - m.stop);
  const reward = Math.abs(m.target - m.entry);
  const tick = opts.tick && opts.tick > 0 ? opts.tick : null;
  const base = Math.abs(m.entry) || 1;
  return {
    ...m,
    risk,
    reward,
    rr: risk > 0 ? reward / risk : 0,
    riskTicks: tick ? Math.round(risk / tick) : 0,
    rewardTicks: tick ? Math.round(reward / tick) : 0,
    riskPct: (risk / base) * 100,
    rewardPct: (reward / base) * 100,
    size: opts.riskBudget && risk > 0 ? opts.riskBudget / risk : null,
  };
}

/** Decimal places implied by a chart's own price formatter. */
export function decimalsFromFormatter(format: (p: number) => string): number {
  const sample = format(1);
  const dot = sample.indexOf(".");
  return dot < 0 ? 0 : sample.length - dot - 1;
}

/** Tick size implied by a chart's own price formatter. */
export function tickFromFormatter(format: (p: number) => string): number {
  const decimals = decimalsFromFormatter(format);
  return Number(Math.pow(10, -decimals).toFixed(10));
}

/** Compact number for the metrics panel. */
export function compact(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1000) return value.toFixed(Math.min(decimals, 2));
  return value.toFixed(decimals);
}

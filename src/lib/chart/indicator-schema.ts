/**
 * Per-indicator parameter schemas.
 *
 * Drives the indicator settings dialog: each entry describes the editable
 * numeric inputs for an indicator, with the same defaults the toolbar uses.
 * Keeping this declarative means adding a knob is a one-line change and the
 * UI, validation and persistence all follow automatically.
 */
import type { IndicatorKey } from "./types";

export interface IndicatorParamSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  step?: number;
  hint?: string;
}

export const INDICATOR_PARAM_SCHEMA: Partial<Record<IndicatorKey, IndicatorParamSpec[]>> = {
  ema: [{ key: "length", label: "Length", min: 2, max: 400, hint: "Periods used for the exponential average" }],
  sma: [{ key: "length", label: "Length", min: 2, max: 400 }],
  bollinger: [
    { key: "length", label: "Length", min: 2, max: 200 },
    { key: "stddev", label: "Std. deviation", min: 0.5, max: 5, step: 0.1 },
  ],
  supertrend: [
    { key: "period", label: "ATR period", min: 2, max: 100 },
    { key: "multiplier", label: "Multiplier", min: 0.5, max: 10, step: 0.1 },
  ],
  ichimoku: [
    { key: "conversion", label: "Conversion line", min: 2, max: 60 },
    { key: "base", label: "Base line", min: 2, max: 120 },
  ],
  donchian: [{ key: "length", label: "Length", min: 2, max: 200 }],
  rsi: [{ key: "length", label: "Length", min: 2, max: 100 }],
  macd: [
    { key: "fast", label: "Fast length", min: 2, max: 100 },
    { key: "slow", label: "Slow length", min: 3, max: 200 },
    { key: "signal", label: "Signal smoothing", min: 1, max: 60 },
  ],
  atr: [{ key: "length", label: "Length", min: 2, max: 100 }],
  sessions: [
    { key: "asia_start", label: "Asia open (UTC h)", min: 0, max: 23, step: 0.5, hint: "Market hours are UTC; the chart axis shows your local time" },
    { key: "asia_end", label: "Asia close (UTC h)", min: 0, max: 24, step: 0.5 },
    { key: "london_start", label: "London open (UTC h)", min: 0, max: 23, step: 0.5 },
    { key: "london_end", label: "London close (UTC h)", min: 0, max: 24, step: 0.5 },
    { key: "ny_start", label: "New York open (UTC h)", min: 0, max: 23, step: 0.5 },
    { key: "ny_end", label: "New York close (UTC h)", min: 0, max: 24, step: 0.5 },
  ],
  fib: [{ key: "length", label: "Lookback bars", min: 20, max: 500 }],


/** Clamp a user-entered value into the spec's allowed range. */
export function clampParam(spec: IndicatorParamSpec, value: number): number {
  if (!Number.isFinite(value)) return spec.min;
  const stepped = spec.step && spec.step < 1 ? Math.round(value * 100) / 100 : Math.round(value);
  return Math.min(spec.max, Math.max(spec.min, stepped));
}

export function hasSettings(key: IndicatorKey): boolean {
  return (INDICATOR_PARAM_SCHEMA[key]?.length ?? 0) > 0;
}

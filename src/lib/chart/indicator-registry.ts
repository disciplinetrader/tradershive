/**
 * Shared indicator registry.
 *
 * Single source of truth for the indicators the app offers, so the live
 * Trading Workspace and the Replay Studio can never drift apart on defaults,
 * labels or pane placement.
 */
import type { IndicatorKey } from "@/lib/chart/types";

export type IndicatorDef = {
  key: IndicatorKey;
  label: string;
  params: Record<string, number>;
  pane: "price" | "sub";
  group: string;
};

export const INDICATOR_TOGGLES: IndicatorDef[] = [
  { key: "ema", label: "EMA 20", params: { length: 20 }, pane: "price", group: "Overlays" },
  { key: "sma", label: "SMA 50", params: { length: 50 }, pane: "price", group: "Overlays" },
  { key: "bollinger", label: "Bollinger Bands", params: { length: 20, stddev: 2 }, pane: "price", group: "Overlays" },
  { key: "vwap", label: "VWAP", params: {}, pane: "price", group: "Overlays" },
  { key: "supertrend", label: "SuperTrend (10, 3)", params: { period: 10, multiplier: 3 }, pane: "price", group: "Overlays" },
  { key: "ichimoku", label: "Ichimoku Cloud", params: { conversion: 9, base: 26 }, pane: "price", group: "Overlays" },
  { key: "donchian", label: "Donchian Channels", params: { length: 20 }, pane: "price", group: "Overlays" },
  { key: "volume", label: "Volume", params: {}, pane: "sub", group: "Oscillators" },
  { key: "rsi", label: "RSI (14)", params: { length: 14 }, pane: "sub", group: "Oscillators" },
  { key: "macd", label: "MACD", params: { fast: 12, slow: 26, signal: 9 }, pane: "sub", group: "Oscillators" },
  { key: "sessions", label: "Sessions (Asia / London / NY)", params: {}, pane: "price", group: "Sessions & Levels" },
  { key: "fib", label: "Fibonacci", params: { length: 120 }, pane: "price", group: "Sessions & Levels" },
  { key: "sr", label: "Support / Resistance", params: { left: 5, right: 5, levels: 6 }, pane: "price", group: "Sessions & Levels" },
];

/**
 * Professional Trading Chart System — shared types.
 *
 * The Chart Engine is an abstraction over a concrete charting library so we
 * can swap the renderer (lightweight-charts today, TradingView Advanced
 * Charts once its private library is dropped in `public/charting_library`)
 * without touching consumers.
 */

import type { Timeframe, MarketKind } from "@/lib/market-data/types";

export type ChartType =
  | "candles"
  | "hollow_candles"
  | "heikin_ashi"
  | "line"
  | "area"
  | "bars"
  | "baseline";

export type PriceScaleMode = "auto" | "log" | "percentage" | "inverted";

export type CrosshairMode = "normal" | "magnet" | "hidden";

export type DrawingTool =
  | "cursor"
  | "trend_line"
  | "horizontal_line"
  | "vertical_line"
  | "ray"
  | "rectangle"
  | "circle"
  | "ellipse"
  | "arrow"
  | "text"
  | "brush"
  | "risk_reward"
  | "long_position"
  | "short_position"
  | "fib_retracement"
  | "fib_extension"
  | "pitchfork"
  | "parallel_channel"
  | "regression_trend"
  | "measure";

export type IndicatorKey =
  | "ema" | "sma" | "vwap" | "volume" | "atr" | "rsi" | "macd"
  | "bollinger" | "adx" | "supertrend" | "ichimoku" | "stochastic"
  | "donchian" | "cci" | "obv"
  | "fib" | "sr" | "sessions" | "smc";

export interface IndicatorConfig {
  id: string;
  key: IndicatorKey;
  params: Record<string, number>;
  color?: string;
  pane?: "price" | "sub";
  visible?: boolean;
}

export interface DrawingPoint { time: number; price: number; }

export interface Drawing {
  id: string;
  tool: DrawingTool;
  points: DrawingPoint[];
  color?: string;
  text?: string;
  locked?: boolean;
  timeframe?: Timeframe;
}

export interface ChartSettings {
  chartType: ChartType;
  timeframe: Timeframe;
  symbol: string;
  market?: MarketKind;
  priceScale: PriceScaleMode;
  crosshair: CrosshairMode;
  showGrid: boolean;
  showVolume: boolean;
  sessionShading: boolean;
  autoScale: boolean;
  timezone: string;
}

export interface ChartLayoutRow {
  id: string;
  name: string;
  grid: string;
  symbols: string[];
  timeframes: string[];
  indicators: IndicatorConfig[];
  drawings: Drawing[];
  settings: Partial<ChartSettings>;
  is_default: boolean;
  updated_at: string;
}

export type AlertType =
  | "price_cross"
  | "indicator_cross"
  | "trend_line_break"
  | "volume_spike"
  | "session_open";

export type AlertCondition = "above" | "below" | "cross_up" | "cross_down";

export interface ChartAlertRow {
  id: string;
  symbol: string;
  alert_type: AlertType;
  condition: AlertCondition;
  target_price: number | null;
  indicator: string | null;
  message: string | null;
  is_active: boolean;
  triggered_at: string | null;
  triggered_count: number;
  updated_at: string;
}

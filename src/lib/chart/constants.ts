import type { ChartType, DrawingTool, IndicatorKey } from "./types";
import type { Timeframe } from "@/lib/market-data/types";

export const CHART_TYPES: { key: ChartType; label: string }[] = [
  { key: "candles", label: "Candles" },
  { key: "hollow_candles", label: "Hollow Candles" },
  { key: "heikin_ashi", label: "Heikin Ashi" },
  { key: "line", label: "Line" },
  { key: "area", label: "Area" },
  { key: "bars", label: "Bars" },
  { key: "baseline", label: "Baseline" },
];

export const TIMEFRAMES: Timeframe[] = ["1m","3m","5m","15m","30m","1H","2H","4H","1D","1W","1M"];

export const DRAWING_TOOLS: { key: DrawingTool; label: string; group: string }[] = [
  { key: "cursor", label: "Cursor", group: "cursor" },
  { key: "trend_line", label: "Trend Line", group: "lines" },
  { key: "horizontal_line", label: "Horizontal Line", group: "lines" },
  { key: "vertical_line", label: "Vertical Line", group: "lines" },
  { key: "ray", label: "Ray", group: "lines" },
  { key: "parallel_channel", label: "Parallel Channel", group: "lines" },
  { key: "regression_trend", label: "Regression Trend", group: "lines" },
  { key: "rectangle", label: "Rectangle", group: "shapes" },
  { key: "circle", label: "Circle", group: "shapes" },
  { key: "ellipse", label: "Ellipse", group: "shapes" },
  { key: "arrow", label: "Arrow", group: "shapes" },
  { key: "brush", label: "Brush", group: "shapes" },
  { key: "text", label: "Text", group: "annotation" },
  { key: "risk_reward", label: "Risk / Reward", group: "trading" },
  { key: "long_position", label: "Long Position", group: "trading" },
  { key: "short_position", label: "Short Position", group: "trading" },
  { key: "fib_retracement", label: "Fib Retracement", group: "fib" },
  { key: "fib_extension", label: "Fib Extension", group: "fib" },
  { key: "pitchfork", label: "Pitchfork", group: "fib" },
  { key: "measure", label: "Measure", group: "measure" },
];

export const INDICATORS: { key: IndicatorKey; label: string; pane: "price"|"sub"; defaults: Record<string, number> }[] = [
  { key: "ema", label: "EMA", pane: "price", defaults: { length: 20 } },
  { key: "sma", label: "SMA", pane: "price", defaults: { length: 50 } },
  { key: "vwap", label: "VWAP", pane: "price", defaults: {} },
  { key: "bollinger", label: "Bollinger Bands", pane: "price", defaults: { length: 20, stddev: 2 } },
  { key: "supertrend", label: "SuperTrend", pane: "price", defaults: { period: 10, multiplier: 3 } },
  { key: "ichimoku", label: "Ichimoku", pane: "price", defaults: { conversion: 9, base: 26, spanB: 52 } },
  { key: "donchian", label: "Donchian Channel", pane: "price", defaults: { length: 20 } },
  { key: "volume", label: "Volume", pane: "sub", defaults: {} },
  { key: "rsi", label: "RSI", pane: "sub", defaults: { length: 14 } },
  { key: "macd", label: "MACD", pane: "sub", defaults: { fast: 12, slow: 26, signal: 9 } },
  { key: "atr", label: "ATR", pane: "sub", defaults: { length: 14 } },
  { key: "adx", label: "ADX", pane: "sub", defaults: { length: 14 } },
  { key: "stochastic", label: "Stochastic", pane: "sub", defaults: { k: 14, d: 3 } },
  { key: "cci", label: "CCI", pane: "sub", defaults: { length: 20 } },
  { key: "obv", label: "OBV", pane: "sub", defaults: {} },
];

export const GRID_LAYOUTS: { key: string; label: string; count: number; cols: number; rows: number }[] = [
  { key: "1x1", label: "1 Chart", count: 1, cols: 1, rows: 1 },
  { key: "2x1", label: "2 Charts", count: 2, cols: 2, rows: 1 },
  { key: "2x2", label: "4 Charts", count: 4, cols: 2, rows: 2 },
  { key: "3x2", label: "6 Charts", count: 6, cols: 3, rows: 2 },
  { key: "4x2", label: "8 Charts", count: 8, cols: 4, rows: 2 },
];

export const HOTKEYS = [
  { keys: "+", label: "Zoom In" },
  { keys: "-", label: "Zoom Out" },
  { keys: "Space", label: "Reset Tool" },
  { keys: "Esc", label: "Cancel Drawing" },
  { keys: "Ctrl+S", label: "Save Layout" },
  { keys: "Ctrl+L", label: "Load Layout" },
  { keys: "Ctrl+F", label: "Search Symbol" },
];

export const DEFAULT_CHART_SETTINGS = {
  chartType: "candles" as ChartType,
  timeframe: "1H" as Timeframe,
  symbol: "BTC/USDT",
  market: undefined,
  priceScale: "auto" as const,
  crosshair: "normal" as const,
  showGrid: true,
  showVolume: true,
  sessionShading: false,
  autoScale: true,
  // "auto" = follow the browser's IANA timezone for axis + crosshair times.
  timezone: "auto",

};

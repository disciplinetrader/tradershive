export type HistoricalTimeframe =
  | "30s" | "1m" | "5m" | "15m" | "30m" | "1H" | "4H" | "1D" | "1W" | "1M";

export const HISTORICAL_TF_SECONDS: Record<HistoricalTimeframe, number> = {
  "30s": 30,
  "1m": 60, "5m": 300, "15m": 900, "30m": 1800,
  "1H": 3600, "4H": 14400, "1D": 86400, "1W": 604800, "1M": 2592000,
};

/** Base timeframe used for downloads; higher TFs are aggregated. */
export const BASE_TF: HistoricalTimeframe = "1m";
export const DAILY_TF: HistoricalTimeframe = "1D";

/**
 * Aggregation map — which TFs can be built from which base.
 *
 * `30s` cannot be built from `1m` (we would need to fabricate/interpolate
 * candles, which we refuse to do). It is therefore only available when a
 * provider natively delivers 30-second data. The UI must show a friendly
 * "no historical data available for 30s on this symbol" message when the
 * user tries to load a range for which we have no native 30s coverage.
 */
export const AGGREGATE_FROM: Record<HistoricalTimeframe, HistoricalTimeframe | null> = {
  "30s": null,
  "1m": null, "5m": "1m", "15m": "1m", "30m": "1m",
  "1H": "1m", "4H": "1m", "1D": "1m", "1W": "1D", "1M": "1D",
};

export type HistoricalCandle = {
  ts: number;      // epoch ms, UTC
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type HistoricalImportRange = { from: number; to: number };

export type HistoricalImportResult = {
  fetched: number;
  inserted: number;
  skipped: number;
  gaps: number;
  earliest: number | null;
  latest: number | null;
};

export type HistoricalSymbolRow = {
  id: string;
  source_code: string;
  market: string;
  symbol: string;
  native_symbol: string;
  display_name: string | null;
  is_enabled: boolean;
  priority: number;
  earliest_available: string | null;
  latest_imported: string | null;
  base_timeframe: string;
  timeframes: string[];
};

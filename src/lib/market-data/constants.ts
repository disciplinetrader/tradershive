import type { Timeframe, MarketKind } from "./types";

export const TIMEFRAMES: Timeframe[] = [
  "30s","1m","3m","5m","15m","30m","1H","2H","4H","1D","1W","1M",
];

export const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  tick: 1,
  "30s": 30,
  "1m": 60,
  "3m": 180,
  "5m": 300,
  "15m": 900,
  "30m": 1800,
  "1H": 3600,
  "2H": 7200,
  "4H": 14400,
  "1D": 86400,
  "1W": 604800,
  "1M": 2592000,
};

export const MARKETS: { kind: MarketKind; label: string }[] = [
  { kind: "forex", label: "Forex" },
  { kind: "crypto", label: "Crypto" },
  { kind: "metals", label: "Metals" },
  { kind: "indices", label: "Indices" },
  { kind: "commodities", label: "Commodities" },
  { kind: "futures", label: "Futures" },
  { kind: "stocks", label: "Stocks" },
];

export const DEFAULT_PROVIDER = "mock";
export const DEFAULT_SYMBOL = "EURUSD";
export const DEFAULT_TIMEFRAME: Timeframe = "1H";

export const QUOTE_CACHE_MS = 3000;
export const CANDLE_CACHE_MS = 60_000;
export const RECONNECT_BASE_MS = 750;
export const RECONNECT_MAX_MS = 30_000;
export const HEARTBEAT_MS = 15_000;

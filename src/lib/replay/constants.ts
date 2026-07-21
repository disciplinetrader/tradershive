import type { BookmarkCategory, ReplayMarket, Timeframe } from "./types";

export const TIMEFRAMES: Timeframe[] = ["1m", "3m", "5m", "15m", "30m", "1H", "4H", "1D"];

export const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  "1m": 60,
  "3m": 180,
  "5m": 300,
  "15m": 900,
  "30m": 1800,
  "1H": 3600,
  "4H": 14400,
  "1D": 86400,
};

/**
 * Playback speed multipliers.
 * Speeds >16x use batched candle advancement inside the playback loop
 * so the render stays at 60fps regardless of tick rate.
 */
export const SPEEDS = [0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128] as const;

export const MARKETS: { id: ReplayMarket; label: string }[] = [
  { id: "forex", label: "Forex" },
  { id: "crypto", label: "Crypto" },
  { id: "stocks", label: "Stocks" },
  { id: "indices", label: "Indices" },
  { id: "futures", label: "Futures" },
  { id: "metals", label: "Metals" },
];

export const BOOKMARK_CATEGORIES: { id: BookmarkCategory; label: string; color: string }[] = [
  { id: "good_setup", label: "Good Setup", color: "#22c55e" },
  { id: "bad_setup", label: "Bad Setup", color: "#f97316" },
  { id: "mistake", label: "Mistake", color: "#ef4444" },
  { id: "lesson", label: "Lesson", color: "#3b82f6" },
  { id: "question", label: "Question", color: "#a855f7" },
  { id: "custom", label: "Custom", color: "#94a3b8" },
];

export const CHECKPOINT_KINDS = [
  "london_open",
  "ny_open",
  "asia_open",
  "trade_entry",
  "trade_exit",
  "liquidity_sweep",
  "bookmark",
  "custom",
] as const;

export const CHECKPOINT_LABEL: Record<(typeof CHECKPOINT_KINDS)[number], string> = {
  london_open: "London Open",
  ny_open: "New York Open",
  asia_open: "Asia Open",
  trade_entry: "Trade Entry",
  trade_exit: "Trade Exit",
  liquidity_sweep: "Liquidity Sweep",
  bookmark: "Bookmark",
  custom: "Custom",
};

export const DEFAULT_MISTAKES = [
  "FOMO",
  "Late Entry",
  "Early Entry",
  "Moved Stop",
  "No Stop",
  "Overtrading",
  "Ignored Trend",
  "Revenge Trade",
  "Risk Too High",
];

export const DEFAULT_CHECKLIST = [
  "Waited for confirmation",
  "Risk respected",
  "Followed plan",
  "Correct session",
  "Correct trend",
  "Journal completed",
];

/** Default replay templates seeded lazily per-user on first Templates open. */
export const DEFAULT_TEMPLATES: Array<{
  name: string;
  market: string;
  symbol: string;
  timeframe: Timeframe;
  mode: "trade" | "session" | "free" | "day" | "range";
  playback_speed: number;
  difficulty: string;
  favorite_session: string | null;
  objectives: string[];
}> = [
  {
    name: "London Gold Practice",
    market: "metals",
    symbol: "XAUUSD",
    timeframe: "5m",
    mode: "session",
    playback_speed: 4,
    difficulty: "medium",
    favorite_session: "london",
    objectives: ["Wait for London sweep", "Only trade with trend", "1% risk per trade"],
  },
  {
    name: "Silver Bullet",
    market: "forex",
    symbol: "EURUSD",
    timeframe: "1m",
    mode: "session",
    playback_speed: 2,
    difficulty: "hard",
    favorite_session: "new_york",
    objectives: ["10:00–11:00 NY only", "1 setup max", "Journal every trade"],
  },
  {
    name: "ICT Practice",
    market: "forex",
    symbol: "GBPUSD",
    timeframe: "15m",
    mode: "free",
    playback_speed: 8,
    difficulty: "hard",
    favorite_session: "london",
    objectives: ["Mark liquidity", "Identify FVG", "Trade off order block"],
  },
  {
    name: "Random London",
    market: "forex",
    symbol: "EURUSD",
    timeframe: "5m",
    mode: "day",
    playback_speed: 4,
    difficulty: "easy",
    favorite_session: "london",
    objectives: ["React, don't predict", "Respect the plan"],
  },
  {
    name: "Crypto Scalping",
    market: "crypto",
    symbol: "BTCUSDT",
    timeframe: "1m",
    mode: "free",
    playback_speed: 2,
    difficulty: "hard",
    favorite_session: null,
    objectives: ["Max 3 trades", "Take profit at 1R", "No revenge trading"],
  },
];

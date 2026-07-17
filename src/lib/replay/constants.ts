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

export const SPEEDS = [0.25, 0.5, 1, 2, 4, 8, 16] as const;

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

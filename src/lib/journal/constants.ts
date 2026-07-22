// Default taxonomies + feature flags for the Journal module.
// User custom values live in the `journal_taxonomy` table.

export type Option = { value: string; label: string; color?: string };

export const DEFAULT_SETUPS: Option[] = [
  { value: "breakout", label: "Breakout" },
  { value: "pullback", label: "Pullback" },
  { value: "liquidity_sweep", label: "Liquidity Sweep" },
  { value: "smc", label: "SMC" },
  { value: "ict", label: "ICT" },
  { value: "vwap", label: "VWAP" },
  { value: "ema", label: "EMA" },
  { value: "trend", label: "Trend" },
  { value: "range", label: "Range" },
  { value: "scalp", label: "Scalp" },
  { value: "swing", label: "Swing" },
  { value: "reversal", label: "Reversal" },
  { value: "momentum", label: "Momentum" },
];

export const DEFAULT_EMOTIONS: Option[] = [
  { value: "confident", label: "Confident", color: "#10b981" },
  { value: "fear", label: "Fear", color: "#ef4444" },
  { value: "greed", label: "Greed", color: "#f97316" },
  { value: "fomo", label: "FOMO", color: "#f59e0b" },
  { value: "revenge", label: "Revenge", color: "#dc2626" },
  { value: "patient", label: "Patient", color: "#22c55e" },
  { value: "disciplined", label: "Disciplined", color: "#3b82f6" },
  { value: "overconfident", label: "Overconfident", color: "#a855f7" },
  { value: "calm", label: "Calm", color: "#06b6d4" },
  { value: "impulsive", label: "Impulsive", color: "#f43f5e" },
];

export const DEFAULT_MISTAKES: Option[] = [
  { value: "entered_early", label: "Entered Early" },
  { value: "entered_late", label: "Entered Late" },
  { value: "no_stop_loss", label: "No Stop Loss" },
  { value: "moved_stop_loss", label: "Moved Stop Loss" },
  { value: "over_leveraged", label: "Over Leveraged" },
  { value: "overtrading", label: "Overtrading" },
  { value: "revenge_trade", label: "Revenge Trade" },
  { value: "ignored_plan", label: "Ignored Plan" },
  { value: "poor_risk_mgmt", label: "Poor Risk Management" },
  { value: "missed_confirmation", label: "Missed Confirmation" },
];

export const DEFAULT_CHECKLIST: { id: string; label: string }[] = [
  { id: "plan", label: "Followed Trading Plan" },
  { id: "confirmation", label: "Waited for Confirmation" },
  { id: "risk", label: "Correct Risk" },
  { id: "no_fomo", label: "No FOMO" },
  { id: "session", label: "Correct Session" },
  { id: "trend", label: "Correct Trend" },
];

export const SESSION_OPTIONS: Option[] = [
  { value: "sydney", label: "Sydney" },
  { value: "tokyo", label: "Tokyo" },
  { value: "asia", label: "Asia" },
  { value: "london", label: "London" },
  { value: "london_ny_overlap", label: "London / NY Overlap" },
  { value: "new_york", label: "New York" },
];

export const GRADE_OPTIONS: Option[] = [
  { value: "A+", label: "A+" },
  { value: "A", label: "A" },
  { value: "B", label: "B" },
  { value: "C", label: "C" },
  { value: "D", label: "D" },
  { value: "F", label: "F" },
];

export const GRADE_COLOR: Record<string, string> = {
  "A+": "text-emerald-400 border-emerald-400/40 bg-emerald-500/10",
  A: "text-emerald-300 border-emerald-300/40 bg-emerald-400/10",
  B: "text-sky-300 border-sky-300/40 bg-sky-400/10",
  C: "text-amber-300 border-amber-300/40 bg-amber-400/10",
  D: "text-orange-300 border-orange-300/40 bg-orange-400/10",
  F: "text-rose-300 border-rose-300/40 bg-rose-400/10",
};

export const MARKET_OPTIONS: Option[] = [
  { value: "forex", label: "Forex" },
  { value: "crypto", label: "Crypto" },
  { value: "stocks", label: "Stocks" },
  { value: "indices", label: "Indices" },
  { value: "futures", label: "Futures" },
];

export const DIRECTION_OPTIONS: Option[] = [
  { value: "long", label: "Long" },
  { value: "short", label: "Short" },
];

export const RESULT_OPTIONS: Option[] = [
  { value: "win", label: "Win" },
  { value: "loss", label: "Loss" },
  { value: "breakeven", label: "Breakeven" },
];

export const STATUS_OPTIONS: Option[] = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

// Feature flags — reserve AI sections until backed by a real service.
export const JOURNAL_FEATURES = {
  aiReview: false,
  aiPsychology: false,
  aiMistakeDetection: false,
  aiPerformanceCoach: false,
  aiSuggestions: false,
  importTrade: false,
} as const;

export const JOURNAL_STORAGE_KEYS = {
  view: "th_journal_view",
  filters: "th_journal_filters",
  draft: "th_journal_draft_v2",
  defaults: "th_journal_defaults_v2",
  sections: "th_journal_sections_v2",
} as const;


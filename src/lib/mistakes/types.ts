/** Trading Mistake Detection Engine — rule-based, AI-free. */

export type MistakeCategory =
  | "risk"
  | "execution"
  | "psychology"
  | "discipline"
  | "consistency";

export type MistakeSeverity = "low" | "medium" | "high";

/** Stable identifiers so future AI coaching consumes the same schema. */
export type MistakeKind =
  // Risk
  | "risk_above_limit"
  | "inconsistent_size"
  | "consecutive_oversized_losses"
  | "daily_loss_limit_breach"
  // Execution
  | "entered_before_confirmation"
  | "chased_price"
  | "poor_stop_placement"
  | "poor_rr"
  | "early_exit_winner"
  | "let_loser_run"
  // Psychology
  | "revenge_trade"
  | "overtrading"
  | "fomo_entry"
  | "fear_exit"
  | "traded_after_max_loss"
  // Discipline
  | "did_not_follow_playbook"
  | "journal_incomplete"
  | "missing_screenshots"
  | "missing_notes"
  | "ignored_checklist"
  // Consistency
  | "random_lot_sizes"
  | "random_holding_time"
  | "random_sessions"
  | "strategy_hopping";

export type TradeSource = "journal" | "paper";

/** Common shape unified from journal_entries + paper_trades. */
export interface NormalizedTrade {
  id: string;
  source: TradeSource;
  symbol: string | null;
  direction: "long" | "short" | null;
  status: "open" | "closed" | "planned";
  opened_at: string | null;
  closed_at: string | null;
  duration_seconds: number | null;
  session: string | null;
  strategy_id: string | null;
  strategy_name: string | null;
  lot_size: number | null;
  entry: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  exit: number | null;
  pnl: number | null;
  rr: number | null;
  rr_planned: number | null;
  risk_pct: number | null;
  emotions: string[];
  mistake_flags: string[]; // user-tagged (from journal.mistakes)
  checklist_ran: boolean;
  has_screenshots: boolean;
  has_notes: boolean;
  outcome: "win" | "loss" | "breakeven";
}

export interface MistakeOccurrence {
  trade_id: string;
  source: TradeSource;
  at: string; // ISO
  cost_r: number; // negative R absorbed (or 0 if unknown)
  detail?: string;
}

export interface DetectedMistake {
  kind: MistakeKind;
  category: MistakeCategory;
  title: string;
  description: string;
  severity: MistakeSeverity;
  frequency: number; // number of occurrences in the range
  impact_r: number; // aggregate R impact (negative = costing)
  trend: "improving" | "worsening" | "stable" | "new";
  first_seen: string | null;
  last_seen: string | null;
  occurrences: MistakeOccurrence[];
  resolved: boolean;
}

export interface EngineInsight {
  id: string;
  text: string;
  tone: "warn" | "info" | "positive";
  related_kinds: MistakeKind[];
}

export interface EngineResult {
  range_days: number;
  total_trades: number;
  closed_trades: number;
  detected: DetectedMistake[];
  insights: EngineInsight[];
  totals: {
    total_impact_r: number;
    top_kind: MistakeKind | null;
    top_kind_impact_r: number;
    resolved_count: number;
    improving_count: number;
  };
}

export interface UserRiskLimits {
  max_risk_per_trade_pct: number; // e.g. 1
  daily_loss_limit_r: number; // e.g. -3
  max_consecutive_losses: number; // e.g. 3
}

export const DEFAULT_LIMITS: UserRiskLimits = {
  max_risk_per_trade_pct: 1,
  daily_loss_limit_r: -3,
  max_consecutive_losses: 3,
};

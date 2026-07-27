/**
 * Trading Goals & Progress — shared types.
 *
 * The goal system is intentionally decoupled from XP/badges: it's a
 * measurable-progress engine that Analytics, Dashboard, Journal and
 * future AI Coach modules all consume.
 */

export const GOAL_KINDS = [
  // Discipline / activity caps
  "max_trades_per_day",
  "max_daily_loss",
  "max_weekly_drawdown",
  "max_risk_per_trade",
  // Positive targets
  "daily_r_target",
  "weekly_r_target",
  "monthly_r_target",
  "win_rate_target",
  "profit_factor_target",
  "min_journal_rate",
  "consecutive_days",
  "replay_hours",
  "journal_entries_count",
  // Legacy (kept so existing goals still render)
  "net_profit",
  "max_drawdown",
  "min_win_rate",
  "min_rr",
  "max_trades",
  "trades_count",
] as const;

export type GoalKind = (typeof GOAL_KINDS)[number];

export const GOAL_PERIODS = ["day", "week", "month", "quarter", "year", "all_time", "custom"] as const;
export type GoalPeriod = (typeof GOAL_PERIODS)[number];

export type GoalUnit = "R" | "%" | "count" | "hours" | "currency" | "days" | "ratio";
export type GoalDirection = "up" | "down"; // up = higher is better, down = cap (lower is better)
export type GoalStatus = "on_track" | "completed" | "warning" | "missed";

export type GoalMeta = {
  label: string;
  description: string;
  unit: GoalUnit;
  direction: GoalDirection;
  defaultTarget: number;
  defaultPeriod: GoalPeriod;
  category: "discipline" | "performance" | "practice";
};

export const GOAL_META: Record<GoalKind, GoalMeta> = {
  max_trades_per_day: {
    label: "Maximum trades per day",
    description: "Cap over-trading. Progress = trades taken today vs. cap.",
    unit: "count", direction: "down", defaultTarget: 5, defaultPeriod: "day", category: "discipline",
  },
  max_daily_loss: {
    label: "Maximum daily loss",
    description: "Stop-loss for the day, expressed in R.",
    unit: "R", direction: "down", defaultTarget: 2, defaultPeriod: "day", category: "discipline",
  },
  max_weekly_drawdown: {
    label: "Maximum weekly drawdown",
    description: "Cap the drawdown you accept in a week (R).",
    unit: "R", direction: "down", defaultTarget: 5, defaultPeriod: "week", category: "discipline",
  },
  max_risk_per_trade: {
    label: "Risk per trade limit",
    description: "Largest single-trade risk (% of account).",
    unit: "%", direction: "down", defaultTarget: 1, defaultPeriod: "all_time", category: "discipline",
  },
  daily_r_target: {
    label: "Daily R target",
    description: "R earned today toward your daily goal.",
    unit: "R", direction: "up", defaultTarget: 1, defaultPeriod: "day", category: "performance",
  },
  weekly_r_target: {
    label: "Weekly R target",
    description: "R earned this week toward your weekly goal.",
    unit: "R", direction: "up", defaultTarget: 5, defaultPeriod: "week", category: "performance",
  },
  monthly_r_target: {
    label: "Monthly R target",
    description: "R earned this month toward your monthly goal.",
    unit: "R", direction: "up", defaultTarget: 20, defaultPeriod: "month", category: "performance",
  },
  win_rate_target: {
    label: "Win rate target",
    description: "Percentage of winning trades over the period.",
    unit: "%", direction: "up", defaultTarget: 50, defaultPeriod: "month", category: "performance",
  },
  profit_factor_target: {
    label: "Profit factor target",
    description: "Gross profit ÷ gross loss.",
    unit: "ratio", direction: "up", defaultTarget: 1.5, defaultPeriod: "month", category: "performance",
  },
  min_journal_rate: {
    label: "Journal completion rate",
    description: "Share of closed trades that have a journal entry.",
    unit: "%", direction: "up", defaultTarget: 80, defaultPeriod: "week", category: "discipline",
  },
  consecutive_days: {
    label: "Consecutive trading days",
    description: "Days in a row with at least one closed trade.",
    unit: "days", direction: "up", defaultTarget: 10, defaultPeriod: "all_time", category: "discipline",
  },
  replay_hours: {
    label: "Replay practice hours",
    description: "Total hours spent in Replay Studio.",
    unit: "hours", direction: "up", defaultTarget: 2, defaultPeriod: "week", category: "practice",
  },
  journal_entries_count: {
    label: "Journal entries completed",
    description: "New journal entries created in the period.",
    unit: "count", direction: "up", defaultTarget: 5, defaultPeriod: "week", category: "practice",
  },

  // Legacy — preserved
  net_profit: { label: "Net profit", description: "Realised P&L (currency).", unit: "currency", direction: "up", defaultTarget: 1000, defaultPeriod: "month", category: "performance" },
  max_drawdown: { label: "Max drawdown (cap)", description: "Peak-to-trough drawdown cap.", unit: "currency", direction: "down", defaultTarget: 500, defaultPeriod: "month", category: "discipline" },
  min_win_rate: { label: "Minimum win rate", description: "Legacy win-rate goal.", unit: "%", direction: "up", defaultTarget: 50, defaultPeriod: "month", category: "performance" },
  min_rr: { label: "Minimum avg RR", description: "Legacy avg RR goal.", unit: "ratio", direction: "up", defaultTarget: 1.5, defaultPeriod: "month", category: "performance" },
  max_trades: { label: "Max trades (cap)", description: "Legacy trades cap.", unit: "count", direction: "down", defaultTarget: 20, defaultPeriod: "month", category: "discipline" },
  trades_count: { label: "Trades count", description: "Legacy trades count goal.", unit: "count", direction: "up", defaultTarget: 20, defaultPeriod: "month", category: "performance" },
};

export type GoalRow = {
  id: string;
  user_id: string;
  name: string;
  kind: GoalKind;
  target_value: number;
  period: GoalPeriod;
  start_date: string | null;
  end_date: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type GoalProgress = {
  goal: GoalRow;
  current: number;             // current numeric value
  target: number;
  pct: number;                 // 0..100
  status: GoalStatus;
  insight: string;             // 1-line human-friendly summary
  formattedCurrent: string;
  formattedTarget: string;
};

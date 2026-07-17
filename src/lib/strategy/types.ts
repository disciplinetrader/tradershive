export type StrategyStatus = "draft" | "private" | "public" | "archived";
export type StrategyDifficulty = "beginner" | "intermediate" | "advanced" | "expert";
export type ChecklistKind = "pre_market" | "entry" | "exit" | "post_trade" | "weekly" | "monthly";
export type ExampleRefType = "trade" | "journal" | "replay" | "image" | "video" | "document" | "note";

export type Rule = { id: string; text: string; done?: boolean };
export type RiskRules = {
  max_risk_pct?: number;
  max_trades_per_day?: number;
  max_daily_loss_pct?: number;
  max_weekly_loss_pct?: number;
  min_rr?: number;
  position_sizing?: string;
  daily_stop?: number;
  weekly_stop?: number;
};
export type TradeManagement = {
  move_stop_rules?: string;
  scale_in?: string;
  scale_out?: string;
  trailing_logic?: string;
  reentry_rules?: string;
  checklist?: string[];
};

export type Strategy = {
  id: string;
  user_id: string;
  name: string;
  slug: string | null;
  description: string | null;
  category: string | null;
  market: string | null;
  timeframes: string[];
  tags: string[];
  markets: string[];
  symbols: string[];
  market_conditions: string[];
  color: string;
  icon: string;
  cover_url: string | null;
  status: StrategyStatus;
  difficulty: StrategyDifficulty;
  estimated_timeframe: string | null;
  is_favorite: boolean;
  is_active: boolean;
  is_template: boolean;
  version: number;
  entry_rules: Rule[];
  exit_rules: Rule[];
  risk_rules: RiskRules;
  trade_management: TradeManagement;
  position_sizing: Record<string, unknown>;
  notes: string | null;
  published_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type StrategyStats = {
  strategy_id: string;
  trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  avg_rr: number;
  gross_profit: number;
  gross_loss: number;
  net_pnl: number;
  best_month: number;
  worst_month: number;
  avg_hold_seconds: number;
};

export type Playbook = {
  id: string;
  user_id: string;
  strategy_id: string | null;
  name: string;
  overview: string | null;
  rules: Rule[];
  checklist: Rule[];
  mistakes: Rule[];
  examples: Array<{ id: string; type: string; ref_id?: string; label?: string }>;
  color: string;
  icon: string;
  cover_url: string | null;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
};

export type StrategyTemplate = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  difficulty: StrategyDifficulty;
  markets: string[];
  timeframes: string[];
  tags: string[];
  color: string;
  icon: string;
  data: Record<string, any>;
  is_official: boolean;
};

import { z } from "zod";

export const battleTypeSchema = z.enum(["time_trial", "profit_target", "custom", "1v1", "2v2", "ffa5", "ffa10"]);
export type BattleType = z.infer<typeof battleTypeSchema>;

export const marketSchema = z.enum(["crypto", "forex", "indices", "metals", "mixed"]);
export type MarketType = z.infer<typeof marketSchema>;

export const visibilitySchema = z.enum(["public", "private"]);
export type VisibilityType = z.infer<typeof visibilitySchema>;

export const battleStatusSchema = z.enum([
  "draft",
  "upcoming",
  "open",
  "filling",
  "ready",
  "countdown",
  "live",
  "completed",
  "cancelled",
]);
export type BattleStatus = z.infer<typeof battleStatusSchema>;

export const winCondSchema = z.enum([
  "highest_pnl",
  "highest_r",
  "highest_winrate",
  "lowest_dd",
  "first_to_5r",
  "first_to_target",
  "consistency",
]);
export type WinCondition = z.infer<typeof winCondSchema>;

export interface BattleRules {
  timeLimit?: number; // minutes
  maxDrawdown?: number; // %
  riskLimit?: number; // %
  profitTarget?: number; // %
  startingBalance?: number;
  allowedSymbols: string[];
}

export interface BattleParticipant {
  id: string;
  battle_id: string;
  user_id: string;
  paper_account_id?: string;
  is_ready: boolean;
  joined_at: string;
  rank?: number;
  pnl_pct?: number;
}

export interface Battle {
  id: string;
  name: string;
  description?: string;
  host_id: string;
  status: BattleStatus;
  battle_type: BattleType;
  market: MarketType;
  visibility: VisibilityType;
  invite_code?: string;
  start_at: string;
  end_at: string;
  min_participants: number;
  max_participants: number;
  starting_balance: number;
  max_risk_pct?: number;
  max_daily_loss_pct?: number;
  max_drawdown_pct?: number;
  profit_target_pct?: number;
  allowed_symbols: string[];
  win_condition: WinCondition;
  ranked: boolean;
  featured?: boolean;
}

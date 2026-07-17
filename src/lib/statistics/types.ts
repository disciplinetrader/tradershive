import type { Database } from "@/integrations/supabase/types";

export type PaperTradeRow = Database["public"]["Tables"]["paper_trades"]["Row"];
export type JournalRow = Database["public"]["Tables"]["journal_entries"]["Row"];
export type PaperAccountRow = Database["public"]["Tables"]["paper_accounts"]["Row"];
export type GoalRow = Database["public"]["Tables"]["goal_tracking"]["Row"];
export type SavedFilterRow = Database["public"]["Tables"]["statistics_saved_filters"]["Row"];

/** Unified analytics trade shape merging paper_trades + journal_entries. */
export interface AnalyticsTrade {
  id: string;
  trade_id: string | null;
  account_id: string | null;
  symbol: string;
  market: string;
  direction: "long" | "short";
  entry_price: number | null;
  exit_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  lot_size: number | null;
  rr: number | null;
  risk_pct: number | null;
  pnl: number;
  commission: number;
  swap: number;
  opened_at: string;
  closed_at: string | null;
  duration_seconds: number | null;
  session: string | null;
  setup: string | null;
  strategy: string | null;
  emotions: string[];
  mistakes: string[];
  grade: string | null;
  status: string;
}

export type DatePreset =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_year"
  | "last_year"
  | "all_time"
  | "custom";

export interface StatisticsFilters {
  preset: DatePreset;
  from?: string | null;
  to?: string | null;
  markets: string[];
  symbols: string[];
  accounts: string[];
  strategies: string[];
  setups: string[];
  emotions: string[];
  sessions: string[];
  directions: ("long" | "short")[];
  tags: string[];
  challengeId?: string | null;
}

export const EMPTY_FILTERS: StatisticsFilters = {
  preset: "all_time",
  from: null,
  to: null,
  markets: [],
  symbols: [],
  accounts: [],
  strategies: [],
  setups: [],
  emotions: [],
  sessions: [],
  directions: [],
  tags: [],
  challengeId: null,
};

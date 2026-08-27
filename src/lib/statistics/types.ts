import type { Database } from "@/integrations/supabase/types";

export type PaperTradeRow = Database["public"]["Tables"]["paper_trades"]["Row"];
export type JournalRow = Database["public"]["Tables"]["journal_entries"]["Row"];
export type PaperAccountRow = Database["public"]["Tables"]["paper_accounts"]["Row"];
export type GoalRow = Database["public"]["Tables"]["goal_tracking"]["Row"];
export type SavedFilterRow = Database["public"]["Tables"]["statistics_saved_filters"]["Row"];

/** Where a trade originated so Analytics can be scoped per source. */
export type TradeSource = "paper" | "journal" | "imported";
export type TradeSourceTab = "all" | TradeSource;

/** Unified analytics trade shape merging paper_trades + journal_entries. */
export interface AnalyticsTrade {
  source: TradeSource;
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

/** Outcome buckets. `all` disables the filter rather than being a fourth bucket. */
export type TradeOutcome = "all" | "win" | "loss" | "breakeven";

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

  /** Win / loss / breakeven, derived from `pnl` against `breakevenThreshold`. */
  outcome: TradeOutcome;
  /**
   * |pnl| at or below this counts as BREAKEVEN, in account currency.
   *
   * Defaults to 0, which means only an exactly-flat trade is breakeven. That is
   * deliberately strict: any non-zero default would be a number nobody chose,
   * and a guessed threshold silently reclassifies real wins and losses. The
   * control is on the filter bar so the trader picks their own.
   *
   * It lives in the filters (and therefore in the URL) rather than in a
   * preference, because it changes what the numbers on screen MEAN — a shared
   * link has to carry it or the recipient sees different figures.
   */
  breakevenThreshold: number;
  /** Days of week to include, 0 = Sunday. Empty means every day. */
  days: number[];
  /** Local hour-of-day window, 0-23 inclusive. Null means unbounded. */
  hourFrom?: number | null;
  hourTo?: number | null;
  /** Analytics Center source tab (paper/journal/imported or all). */
  source?: TradeSourceTab;
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
  source: "all",
  outcome: "all",
  breakevenThreshold: 0,
  days: [],
  hourFrom: null,
  hourTo: null,
};

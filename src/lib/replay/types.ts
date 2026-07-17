export type ReplayMode = "trade" | "session" | "free" | "day" | "range";
export type ReplayStatus = "active" | "paused" | "completed" | "archived";
export type ReplayMarket = "forex" | "crypto" | "stocks" | "indices" | "futures" | "metals";
export type Timeframe = "1m" | "3m" | "5m" | "15m" | "30m" | "1H" | "4H" | "1D";
export type BookmarkCategory = "good_setup" | "bad_setup" | "mistake" | "lesson" | "question" | "custom";
export type ReplayTradeStatus = "open" | "closed" | "cancelled";
export type OrderType = "market" | "limit" | "stop";

export type Candle = {
  time: number; // epoch ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type ReplaySession = {
  id: string;
  user_id: string;
  title: string;
  mode: ReplayMode;
  market: string;
  symbol: string;
  timeframe: string;
  replay_date: string | null;
  range_start: string | null;
  range_end: string | null;
  source_trade_id: string | null;
  source_journal_id: string | null;
  playback_speed: number;
  cursor_ts: string | null;
  duration_seconds: number;
  completion_pct: number;
  status: ReplayStatus;
  is_favorite: boolean;
  tags: string[];
  provider: string;
  settings: Record<string, unknown>;
  last_opened_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ReplayTrade = {
  id: string;
  session_id: string;
  symbol: string;
  market: string;
  direction: "long" | "short";
  order_type: OrderType;
  entry_price: number;
  exit_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  lot_size: number;
  risk_pct: number | null;
  rr_planned: number | null;
  rr_realized: number | null;
  pnl: number | null;
  commission: number;
  swap: number;
  opened_at: string;
  closed_at: string | null;
  status: ReplayTradeStatus;
  notes: string | null;
  created_at: string;
};

export type ReplayNote = {
  id: string;
  session_id: string;
  note_ts: string;
  body: string;
  screenshot_path: string | null;
  chart_x: number | null;
  chart_y: number | null;
  created_at: string;
};

export type ReplayBookmark = {
  id: string;
  session_id: string;
  bookmark_ts: string;
  label: string;
  category: BookmarkCategory;
  color: string | null;
};

export type ReplayChecklistItem = {
  id: string;
  session_id: string;
  label: string;
  checked: boolean;
  sort_order: number;
};

export type ReplayScore = {
  id: string;
  session_id: string;
  score: number;
  discipline: number;
  risk: number;
  execution: number;
  patience: number;
  consistency: number;
  journal_completion: number;
  breakdown: Record<string, unknown>;
};

export type ReplayStatistics = {
  user_id: string;
  total_sessions: number;
  total_hours: number;
  total_trades: number;
  streak_days: number;
  last_practiced_at: string | null;
  average_score: number;
  most_practiced_market: string | null;
  most_practiced_symbol: string | null;
};

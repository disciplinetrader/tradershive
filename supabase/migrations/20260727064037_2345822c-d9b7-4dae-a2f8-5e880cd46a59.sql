ALTER TABLE public.goal_tracking DROP CONSTRAINT IF EXISTS goal_tracking_kind_check;
ALTER TABLE public.goal_tracking ADD CONSTRAINT goal_tracking_kind_check CHECK (kind = ANY (ARRAY[
  'net_profit','max_drawdown','min_win_rate','min_rr','max_trades','trades_count',
  'max_trades_per_day','min_journal_rate','daily_r_target','weekly_r_target','monthly_r_target',
  'max_daily_loss','max_weekly_drawdown','win_rate_target','profit_factor_target',
  'max_risk_per_trade','consecutive_days','replay_hours','journal_entries_count'
]));
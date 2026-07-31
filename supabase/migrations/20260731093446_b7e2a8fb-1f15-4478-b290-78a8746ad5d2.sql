CREATE TABLE public.chart_closed_trades (
  id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL,
  position_id TEXT NOT NULL,
  drawing_id TEXT,
  symbol TEXT NOT NULL,
  market TEXT,
  direction TEXT NOT NULL,
  order_type TEXT NOT NULL,
  requested_entry NUMERIC,
  fill_price NUMERIC NOT NULL,
  entry_time BIGINT NOT NULL,
  initial_stop NUMERIC,
  initial_target NUMERIC,
  final_stop NUMERIC,
  final_target NUMERIC,
  exit_price NUMERIC NOT NULL,
  exit_time BIGINT NOT NULL,
  close_reason TEXT NOT NULL,
  quantity NUMERIC,
  position_size NUMERIC,
  gross_pnl NUMERIC NOT NULL DEFAULT 0,
  fees NUMERIC NOT NULL DEFAULT 0,
  net_pnl NUMERIC NOT NULL DEFAULT 0,
  risk_amount NUMERIC NOT NULL DEFAULT 0,
  initial_risk_distance NUMERIC NOT NULL DEFAULT 0,
  realized_r NUMERIC NOT NULL DEFAULT 0,
  return_percent NUMERIC NOT NULL DEFAULT 0,
  slippage NUMERIC NOT NULL DEFAULT 0,
  execution_source TEXT,
  closed_at BIGINT NOT NULL,
  journal_entry_id UUID,
  journal_status TEXT NOT NULL DEFAULT 'unlinked',
  archived_at BIGINT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT chart_closed_trades_pkey PRIMARY KEY (id),
  CONSTRAINT chart_closed_trades_position_unique UNIQUE (user_id, position_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chart_closed_trades TO authenticated;
GRANT ALL ON public.chart_closed_trades TO service_role;

ALTER TABLE public.chart_closed_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own chart closed trades"
  ON public.chart_closed_trades FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own chart closed trades"
  ON public.chart_closed_trades FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own chart closed trades"
  ON public.chart_closed_trades FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own chart closed trades"
  ON public.chart_closed_trades FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_chart_closed_trades_user_symbol ON public.chart_closed_trades (user_id, symbol, closed_at DESC);

CREATE TRIGGER update_chart_closed_trades_updated_at
  BEFORE UPDATE ON public.chart_closed_trades
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
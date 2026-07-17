
-- Goal tracking
CREATE TABLE public.goal_tracking (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('net_profit','max_drawdown','min_win_rate','min_rr','max_trades','trades_count')),
  target_value NUMERIC(18,4) NOT NULL,
  period TEXT NOT NULL DEFAULT 'month' CHECK (period IN ('day','week','month','quarter','year','all_time','custom')),
  start_date DATE,
  end_date DATE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goal_tracking TO authenticated;
GRANT ALL ON public.goal_tracking TO service_role;
ALTER TABLE public.goal_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own goals" ON public.goal_tracking
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX goal_tracking_user_idx ON public.goal_tracking (user_id, active);
CREATE TRIGGER goal_tracking_updated BEFORE UPDATE ON public.goal_tracking
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Saved statistics filters
CREATE TABLE public.statistics_saved_filters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.statistics_saved_filters TO authenticated;
GRANT ALL ON public.statistics_saved_filters TO service_role;
ALTER TABLE public.statistics_saved_filters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own saved filters" ON public.statistics_saved_filters
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX statistics_saved_filters_user_idx ON public.statistics_saved_filters (user_id);
CREATE TRIGGER stats_saved_filters_updated BEFORE UPDATE ON public.statistics_saved_filters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

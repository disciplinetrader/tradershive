
-- ============ prop_challenges ============
CREATE TABLE public.prop_challenges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  paper_account_id UUID REFERENCES public.paper_accounts(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  preset TEXT NOT NULL DEFAULT 'custom',
  account_size NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  profit_target_pct NUMERIC NOT NULL DEFAULT 8,
  max_daily_loss_pct NUMERIC NOT NULL DEFAULT 5,
  max_total_drawdown_pct NUMERIC NOT NULL DEFAULT 10,
  min_trading_days INTEGER NOT NULL DEFAULT 5,
  max_position_size NUMERIC,
  leverage INTEGER NOT NULL DEFAULT 100,
  duration_days INTEGER NOT NULL DEFAULT 30,
  commission_per_lot NUMERIC NOT NULL DEFAULT 0,
  spread_profile TEXT NOT NULL DEFAULT 'standard',
  slippage_profile TEXT NOT NULL DEFAULT 'standard',
  weekend_hold_allowed BOOLEAN NOT NULL DEFAULT TRUE,
  news_trading_allowed BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','passed','failed','abandoned')),
  result TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  starting_equity NUMERIC NOT NULL,
  current_equity NUMERIC NOT NULL,
  peak_equity NUMERIC NOT NULL,
  lowest_equity NUMERIC NOT NULL,
  realized_pnl NUMERIC NOT NULL DEFAULT 0,
  trading_days_used INTEGER NOT NULL DEFAULT 0,
  breach_reason TEXT,
  breach_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prop_challenges TO authenticated;
GRANT ALL ON public.prop_challenges TO service_role;

ALTER TABLE public.prop_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prop_challenges_owner_all" ON public.prop_challenges
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX prop_challenges_user_idx ON public.prop_challenges (user_id, status, started_at DESC);
CREATE INDEX prop_challenges_paper_account_idx ON public.prop_challenges (paper_account_id);

CREATE TRIGGER update_prop_challenges_updated_at
  BEFORE UPDATE ON public.prop_challenges
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ prop_challenge_days ============
CREATE TABLE public.prop_challenge_days (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  challenge_id UUID NOT NULL REFERENCES public.prop_challenges(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day_date DATE NOT NULL,
  start_equity NUMERIC NOT NULL,
  end_equity NUMERIC NOT NULL,
  high_equity NUMERIC NOT NULL,
  low_equity NUMERIC NOT NULL,
  realized_pnl NUMERIC NOT NULL DEFAULT 0,
  trades_count INTEGER NOT NULL DEFAULT 0,
  breached BOOLEAN NOT NULL DEFAULT FALSE,
  breach_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (challenge_id, day_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prop_challenge_days TO authenticated;
GRANT ALL ON public.prop_challenge_days TO service_role;

ALTER TABLE public.prop_challenge_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prop_challenge_days_owner_all" ON public.prop_challenge_days
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX prop_challenge_days_challenge_idx ON public.prop_challenge_days (challenge_id, day_date);

CREATE TRIGGER update_prop_challenge_days_updated_at
  BEFORE UPDATE ON public.prop_challenge_days
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

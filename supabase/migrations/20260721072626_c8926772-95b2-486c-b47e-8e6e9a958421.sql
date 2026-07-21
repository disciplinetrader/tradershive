
-- ============ replay_debriefs ============
CREATE TABLE public.replay_debriefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  session_id UUID NOT NULL UNIQUE REFERENCES public.replay_sessions(id) ON DELETE CASCADE,
  overall_summary TEXT,
  strengths TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  weaknesses TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  best_trade JSONB,
  worst_trade JSONB,
  risk_review TEXT,
  execution_review TEXT,
  discipline_review TEXT,
  psychology_review TEXT,
  improvement_suggestions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  action_items TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  grade TEXT,
  confidence NUMERIC,
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.replay_debriefs TO authenticated;
GRANT ALL ON public.replay_debriefs TO service_role;
ALTER TABLE public.replay_debriefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own debriefs" ON public.replay_debriefs FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX replay_debriefs_user_idx ON public.replay_debriefs(user_id, created_at DESC);
CREATE TRIGGER trg_replay_debriefs_updated BEFORE UPDATE ON public.replay_debriefs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ replay_mistakes ============
CREATE TABLE public.replay_mistakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  session_id UUID NOT NULL REFERENCES public.replay_sessions(id) ON DELETE CASCADE,
  trade_id UUID REFERENCES public.replay_trades(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'med',
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.replay_mistakes TO authenticated;
GRANT ALL ON public.replay_mistakes TO service_role;
ALTER TABLE public.replay_mistakes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own mistakes" ON public.replay_mistakes FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX replay_mistakes_user_idx ON public.replay_mistakes(user_id, detected_at DESC);
CREATE INDEX replay_mistakes_session_idx ON public.replay_mistakes(session_id);
CREATE INDEX replay_mistakes_kind_idx ON public.replay_mistakes(user_id, kind);

-- ============ replay_trader_profile ============
CREATE TABLE public.replay_trader_profile (
  user_id UUID PRIMARY KEY,
  style TEXT,
  strengths TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  weaknesses TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  consistency NUMERIC NOT NULL DEFAULT 0,
  risk_discipline NUMERIC NOT NULL DEFAULT 0,
  execution_quality NUMERIC NOT NULL DEFAULT 0,
  patience NUMERIC NOT NULL DEFAULT 0,
  decision_quality NUMERIC NOT NULL DEFAULT 0,
  confidence NUMERIC NOT NULL DEFAULT 0,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.replay_trader_profile TO authenticated;
GRANT ALL ON public.replay_trader_profile TO service_role;
ALTER TABLE public.replay_trader_profile ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile" ON public.replay_trader_profile FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_replay_trader_profile_updated BEFORE UPDATE ON public.replay_trader_profile
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ replay_confidence_history ============
CREATE TABLE public.replay_confidence_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  taken_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  execution NUMERIC NOT NULL DEFAULT 0,
  risk NUMERIC NOT NULL DEFAULT 0,
  psychology NUMERIC NOT NULL DEFAULT 0,
  discipline NUMERIC NOT NULL DEFAULT 0,
  overall NUMERIC NOT NULL DEFAULT 0,
  deltas JSONB NOT NULL DEFAULT '{}'::jsonb,
  reasons JSONB NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.replay_confidence_history TO authenticated;
GRANT ALL ON public.replay_confidence_history TO service_role;
ALTER TABLE public.replay_confidence_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own confidence" ON public.replay_confidence_history FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX replay_confidence_history_user_idx ON public.replay_confidence_history(user_id, taken_at DESC);

-- ============ replay_homework ============
CREATE TABLE public.replay_homework (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  market TEXT NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  session_hint TEXT,
  difficulty TEXT NOT NULL DEFAULT 'medium',
  target_r NUMERIC NOT NULL DEFAULT 2,
  max_trades INTEGER NOT NULL DEFAULT 3,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  source_session_id UUID REFERENCES public.replay_sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.replay_homework TO authenticated;
GRANT ALL ON public.replay_homework TO service_role;
ALTER TABLE public.replay_homework ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own homework" ON public.replay_homework FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX replay_homework_user_idx ON public.replay_homework(user_id, status, created_at DESC);

-- ============ replay_recommendations ============
CREATE TABLE public.replay_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority TEXT NOT NULL DEFAULT 'medium',
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.replay_recommendations TO authenticated;
GRANT ALL ON public.replay_recommendations TO service_role;
ALTER TABLE public.replay_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own recommendations" ON public.replay_recommendations FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX replay_recommendations_user_idx ON public.replay_recommendations(user_id, created_at DESC);

-- ============ replay_coach_reports ============
CREATE TABLE public.replay_coach_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  period TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  biggest_improvement TEXT,
  biggest_weakness TEXT,
  best_session_id UUID REFERENCES public.replay_sessions(id) ON DELETE SET NULL,
  worst_session_id UUID REFERENCES public.replay_sessions(id) ON DELETE SET NULL,
  homework_recommendation TEXT,
  next_focus TEXT,
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  body JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, period, period_start)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.replay_coach_reports TO authenticated;
GRANT ALL ON public.replay_coach_reports TO service_role;
ALTER TABLE public.replay_coach_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own reports" ON public.replay_coach_reports FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX replay_coach_reports_user_idx ON public.replay_coach_reports(user_id, period_start DESC);

-- ============ replay_coach_memory ============
CREATE TABLE public.replay_coach_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  weight NUMERIC NOT NULL DEFAULT 1,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, kind, key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.replay_coach_memory TO authenticated;
GRANT ALL ON public.replay_coach_memory TO service_role;
ALTER TABLE public.replay_coach_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own memory" ON public.replay_coach_memory FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX replay_coach_memory_user_idx ON public.replay_coach_memory(user_id, kind, weight DESC);


ALTER TABLE public.replay_sessions
  ADD COLUMN IF NOT EXISTS challenge_id UUID,
  ADD COLUMN IF NOT EXISTS strategy_id UUID,
  ADD COLUMN IF NOT EXISTS initial_balance NUMERIC DEFAULT 10000,
  ADD COLUMN IF NOT EXISTS hide_future BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_random BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.replay_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  difficulty TEXT NOT NULL DEFAULT 'beginner',
  category TEXT NOT NULL DEFAULT 'discipline',
  rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  target_metric TEXT,
  target_value NUMERIC,
  xp_reward INTEGER NOT NULL DEFAULT 100,
  coin_reward INTEGER NOT NULL DEFAULT 25,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.replay_challenges TO anon, authenticated;
GRANT ALL ON public.replay_challenges TO service_role;
ALTER TABLE public.replay_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "replay_challenges readable" ON public.replay_challenges FOR SELECT USING (true);
CREATE POLICY "replay_challenges admin manage" ON public.replay_challenges
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE TRIGGER trg_replay_challenges_updated
  BEFORE UPDATE ON public.replay_challenges
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.user_replay_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge_id UUID NOT NULL REFERENCES public.replay_challenges(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.replay_sessions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'in_progress',
  progress NUMERIC NOT NULL DEFAULT 0,
  score INTEGER,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_replay_challenges TO authenticated;
GRANT ALL ON public.user_replay_challenges TO service_role;
ALTER TABLE public.user_replay_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "urc own" ON public.user_replay_challenges FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_urc_user ON public.user_replay_challenges(user_id);
CREATE TRIGGER trg_urc_updated BEFORE UPDATE ON public.user_replay_challenges
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.replay_ai_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.replay_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  model TEXT NOT NULL DEFAULT 'google/gemini-2.5-flash',
  overall_rating INTEGER,
  entry_analysis TEXT,
  exit_analysis TEXT,
  missed_opportunities TEXT,
  risk_analysis TEXT,
  psychology TEXT,
  consistency TEXT,
  suggestions TEXT,
  raw JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.replay_ai_reviews TO authenticated;
GRANT ALL ON public.replay_ai_reviews TO service_role;
ALTER TABLE public.replay_ai_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "replay_ai_reviews own" ON public.replay_ai_reviews FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_replay_ai_reviews_session ON public.replay_ai_reviews(session_id);
CREATE TRIGGER trg_replay_ai_reviews_updated BEFORE UPDATE ON public.replay_ai_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.replay_challenges (slug, title, description, icon, difficulty, category, rules, target_metric, target_value, xp_reward, coin_reward, is_featured, sort_order) VALUES
  ('max-3-trades', 'Maximum 3 Trades', 'Practice patience — take at most 3 trades this session.', 'Target', 'beginner', 'discipline', '{"max_trades":3}'::jsonb, 'trades', 3, 150, 30, true, 1),
  ('long-only', 'Long Only', 'Only take long trades this session.', 'ArrowUp', 'beginner', 'execution', '{"direction":"long"}'::jsonb, 'trades', 1, 100, 20, false, 2),
  ('short-only', 'Short Only', 'Only take short trades this session.', 'ArrowDown', 'beginner', 'execution', '{"direction":"short"}'::jsonb, 'trades', 1, 100, 20, false, 3),
  ('risk-1', '1% Risk Max', 'Every trade must risk 1% or less.', 'Shield', 'intermediate', 'risk', '{"max_risk_pct":1}'::jsonb, 'discipline', 100, 200, 40, true, 4),
  ('london', 'Trade London Session', 'Only trade during the London session.', 'Landmark', 'intermediate', 'session', '{"session":"london"}'::jsonb, 'trades', 1, 120, 25, false, 5),
  ('newyork', 'Trade New York Session', 'Only trade during the New York session.', 'Landmark', 'intermediate', 'session', '{"session":"new_york"}'::jsonb, 'trades', 1, 120, 25, false, 6),
  ('breakouts', 'Breakouts Only', 'Only take breakout setups.', 'TrendingUp', 'advanced', 'setup', '{"setup":"breakout"}'::jsonb, 'trades', 1, 150, 30, false, 7),
  ('perfect-score', 'Perfect Replay Score', 'Finish a session with a score of 90 or higher.', 'Trophy', 'advanced', 'mastery', '{"min_score":90}'::jsonb, 'score', 90, 500, 100, true, 8)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.achievements (slug, title, description, category, icon, metric, target, xp_reward, coin_reward, sort_order)
VALUES
  ('replay-100-hours', '100 Replay Hours', 'Practice 100 hours in Replay Studio.', 'consistency', 'Clock', 'replay_hours', 100, 1000, 200, 100),
  ('replay-1000-trades', '1000 Trades Practiced', 'Take 1000 trades in Replay.', 'consistency', 'Film', 'replay_trades', 1000, 1500, 300, 101),
  ('replay-perfect-score', 'Perfect Replay Score', 'Achieve a score of 100 in a replay.', 'challenges', 'Trophy', 'replay_perfect', 1, 750, 150, 102),
  ('replay-master', 'Replay Master', 'Complete 50 replay sessions.', 'levels', 'Star', 'replay_sessions', 50, 800, 160, 103)
ON CONFLICT (slug) DO NOTHING;

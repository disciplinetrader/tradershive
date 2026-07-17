
-- ============ ENUMS ============
DO $$ BEGIN
  CREATE TYPE public.challenge_scope AS ENUM ('daily','weekly','monthly','special','event');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.challenge_category AS ENUM ('learning','discipline','risk','consistency','psychology','skills','community','general');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.challenge_difficulty AS ENUM ('easy','medium','hard','elite');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.challenge_status AS ENUM ('active','completed','claimed','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.badge_tier AS ENUM ('bronze','silver','gold','diamond','legend');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.achievement_category AS ENUM ('trading','journal','challenges','consistency','levels','community','events','secret');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ CHALLENGES ============
CREATE TABLE IF NOT EXISTS public.challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  scope public.challenge_scope NOT NULL DEFAULT 'daily',
  category public.challenge_category NOT NULL DEFAULT 'general',
  difficulty public.challenge_difficulty NOT NULL DEFAULT 'easy',
  metric TEXT NOT NULL,
  target NUMERIC NOT NULL DEFAULT 1,
  criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  xp_reward INTEGER NOT NULL DEFAULT 100,
  coin_reward INTEGER NOT NULL DEFAULT 20,
  icon TEXT,
  estimated_minutes INTEGER,
  active BOOLEAN NOT NULL DEFAULT true,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.challenges TO authenticated;
GRANT ALL ON public.challenges TO service_role;
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "challenges readable by members" ON public.challenges
  FOR SELECT TO authenticated USING (active = true OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "challenges managed by admin" ON public.challenges
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER challenges_updated_at BEFORE UPDATE ON public.challenges
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ USER CHALLENGES ============
CREATE TABLE IF NOT EXISTS public.user_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge_id UUID NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  progress NUMERIC NOT NULL DEFAULT 0,
  status public.challenge_status NOT NULL DEFAULT 'active',
  period_key TEXT NOT NULL, -- e.g. 2026-07-17 for daily
  completed_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, challenge_id, period_key)
);
GRANT SELECT, INSERT, UPDATE ON public.user_challenges TO authenticated;
GRANT ALL ON public.user_challenges TO service_role;
ALTER TABLE public.user_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own user_challenges" ON public.user_challenges
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER user_challenges_updated_at BEFORE UPDATE ON public.user_challenges
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS user_challenges_user_status_idx ON public.user_challenges(user_id, status);

-- ============ XP TRANSACTIONS ============
CREATE TABLE IF NOT EXISTS public.xp_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  source TEXT NOT NULL, -- 'challenge','trade','journal','login','achievement','system'
  source_id UUID,
  balance_after INTEGER NOT NULL DEFAULT 0,
  level_after INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.xp_transactions TO authenticated;
GRANT ALL ON public.xp_transactions TO service_role;
ALTER TABLE public.xp_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own xp_tx read" ON public.xp_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own xp_tx insert" ON public.xp_transactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS xp_tx_user_idx ON public.xp_transactions(user_id, created_at DESC);

-- ============ COIN TRANSACTIONS ============
CREATE TABLE IF NOT EXISTS public.coin_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  source TEXT NOT NULL,
  source_id UUID,
  balance_after INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.coin_transactions TO authenticated;
GRANT ALL ON public.coin_transactions TO service_role;
ALTER TABLE public.coin_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own coin_tx read" ON public.coin_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own coin_tx insert" ON public.coin_transactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS coin_tx_user_idx ON public.coin_transactions(user_id, created_at DESC);

-- ============ ACHIEVEMENTS ============
CREATE TABLE IF NOT EXISTS public.achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category public.achievement_category NOT NULL DEFAULT 'trading',
  icon TEXT,
  metric TEXT NOT NULL,
  target NUMERIC NOT NULL DEFAULT 1,
  xp_reward INTEGER NOT NULL DEFAULT 100,
  coin_reward INTEGER NOT NULL DEFAULT 50,
  secret BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.achievements TO authenticated;
GRANT ALL ON public.achievements TO service_role;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "achievements readable" ON public.achievements FOR SELECT TO authenticated USING (active = true OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "achievements admin write" ON public.achievements FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER achievements_updated_at BEFORE UPDATE ON public.achievements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ USER ACHIEVEMENTS ============
CREATE TABLE IF NOT EXISTS public.user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  progress NUMERIC NOT NULL DEFAULT 0,
  unlocked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, achievement_id)
);
GRANT SELECT, INSERT, UPDATE ON public.user_achievements TO authenticated;
GRANT ALL ON public.user_achievements TO service_role;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own user_achievements" ON public.user_achievements FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER user_achievements_updated_at BEFORE UPDATE ON public.user_achievements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ BADGES ============
CREATE TABLE IF NOT EXISTS public.badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  tier public.badge_tier NOT NULL DEFAULT 'bronze',
  icon TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.badges TO authenticated;
GRANT ALL ON public.badges TO service_role;
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "badges readable" ON public.badges FOR SELECT TO authenticated USING (active = true OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "badges admin write" ON public.badges FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ USER BADGES ============
CREATE TABLE IF NOT EXISTS public.user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, badge_id)
);
GRANT SELECT, INSERT ON public.user_badges TO authenticated;
GRANT ALL ON public.user_badges TO service_role;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own user_badges" ON public.user_badges FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ DAILY CLAIMS ============
CREATE TABLE IF NOT EXISTS public.daily_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  claim_date DATE NOT NULL,
  day_index INTEGER NOT NULL DEFAULT 1, -- 1..7 rotating
  xp_reward INTEGER NOT NULL DEFAULT 10,
  coin_reward INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, claim_date)
);
GRANT SELECT, INSERT ON public.daily_claims TO authenticated;
GRANT ALL ON public.daily_claims TO service_role;
ALTER TABLE public.daily_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own daily_claims" ON public.daily_claims FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ GAMIFICATION STATS ============
CREATE TABLE IF NOT EXISTS public.gamification_stats (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  login_streak INTEGER NOT NULL DEFAULT 0,
  best_login_streak INTEGER NOT NULL DEFAULT 0,
  trading_streak INTEGER NOT NULL DEFAULT 0,
  journal_streak INTEGER NOT NULL DEFAULT 0,
  challenge_streak INTEGER NOT NULL DEFAULT 0,
  last_login_date DATE,
  last_trade_date DATE,
  last_journal_date DATE,
  total_challenges_completed INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.gamification_stats TO authenticated;
GRANT ALL ON public.gamification_stats TO service_role;
ALTER TABLE public.gamification_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own gamification_stats" ON public.gamification_stats FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER gamification_stats_updated_at BEFORE UPDATE ON public.gamification_stats FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ SEED DEFAULT CHALLENGES ============
INSERT INTO public.challenges (slug, title, description, scope, category, difficulty, metric, target, xp_reward, coin_reward, icon, estimated_minutes, sort_order) VALUES
  ('daily-log-3-trades','Log 3 Trades Today','Take at least 3 paper trades today to sharpen execution.','daily','skills','easy','paper_trades_today',3,120,25,'📊',30,1),
  ('daily-journal-3','Journal 3 Entries','Write 3 quality journal entries today.','daily','discipline','easy','journal_entries_today',3,150,30,'📓',20,2),
  ('daily-risk-1pct','Risk Exactly 1%','Keep every trade risk at ~1% today.','daily','risk','medium','trades_at_1pct_today',2,180,40,'🛡️',15,3),
  ('daily-no-revenge','No Revenge Trading','Avoid revenge trades for the whole day.','daily','psychology','medium','no_revenge_today',1,160,35,'🧘',0,4),
  ('daily-review-yesterday','Review Yesterday''s Trades','Open yesterday''s trades in journal and review.','daily','learning','easy','reviewed_yesterday',1,100,20,'🔍',10,5),
  ('weekly-3r','Achieve +3R This Week','Close +3R net across all trades this week.','weekly','skills','hard','weekly_r_gain',3,500,120,'🎯',0,10),
  ('weekly-7day-streak','7-Day Login Streak','Log in every day this week.','weekly','consistency','medium','login_streak',7,400,100,'🔥',0,11),
  ('weekly-max-3-trades','Discipline: Max 3 Trades/Day','Keep to 3 trades or fewer each day this week.','weekly','discipline','hard','max_daily_trades_week',3,450,110,'✋',0,12),
  ('monthly-perfect','Perfect Month','Journal every trade for a full month.','monthly','consistency','elite','journaled_every_trade_month',1,2000,500,'🏆',0,20),
  ('event-prop-firm','Prop Firm Challenge','Reach +8% with <5% drawdown.','special','skills','elite','prop_firm_completed',1,5000,1200,'💼',0,30)
ON CONFLICT (slug) DO NOTHING;

-- ============ SEED DEFAULT ACHIEVEMENTS ============
INSERT INTO public.achievements (slug, title, description, category, icon, metric, target, xp_reward, coin_reward, sort_order) VALUES
  ('first-trade','First Trade','Place your first paper trade.','trading','🎬','total_trades',1,50,10,1),
  ('first-win','First Win','Close your first winning trade.','trading','🥇','total_wins',1,80,20,2),
  ('first-journal','First Journal','Write your first journal entry.','journal','✍️','total_journal_entries',1,50,10,3),
  ('streak-7','7-Day Streak','Log in 7 days in a row.','consistency','🔥','login_streak',7,200,50,4),
  ('streak-30','30-Day Streak','Log in 30 days in a row.','consistency','🌋','login_streak',30,1000,300,5),
  ('trades-100','Century','Reach 100 total trades.','trading','💯','total_trades',100,300,100,6),
  ('trades-500','Veteran','Reach 500 total trades.','trading','🎖️','total_trades',500,1000,400,7),
  ('trades-1000','Legend','Reach 1,000 total trades.','trading','🏅','total_trades',1000,3000,1200,8),
  ('r-10','10R Profit','Reach +10R total.','trading','📈','total_r',10,300,120,9),
  ('r-50','50R Profit','Reach +50R total.','trading','🚀','total_r',50,1200,500,10),
  ('perfect-week','Perfect Week','Journal every trade for a week.','consistency','🌟','perfect_week',1,400,150,11),
  ('perfect-month','Perfect Month','Journal every trade for a month.','consistency','🌠','perfect_month',1,1500,600,12),
  ('challenge-master','Challenge Master','Complete 50 challenges.','challenges','🏆','challenges_completed',50,1000,400,13),
  ('journal-master','Journal Master','Write 200 journal entries.','journal','📚','total_journal_entries',200,900,350,14),
  ('risk-manager','Risk Manager','20 trades at ~1% risk.','trading','🛡️','trades_at_1pct',20,400,150,15),
  ('early-bird','Early Bird','Trade during the London open 10 times.','trading','🌅','london_session_trades',10,300,100,16),
  ('night-trader','Night Trader','Trade during the NY session 10 times.','trading','🌃','ny_session_trades',10,300,100,17),
  ('secret-diamond','Diamond Hands','Hold a winning trade to full TP without moving SL.','secret','💎','diamond_hands',1,500,200,50)
ON CONFLICT (slug) DO NOTHING;

-- ============ SEED BADGES ============
INSERT INTO public.badges (slug, title, description, tier, icon) VALUES
  ('bronze-trader','Bronze Trader','Reach the Bronze league.','bronze','🥉'),
  ('silver-trader','Silver Trader','Reach the Silver league.','silver','🥈'),
  ('gold-trader','Gold Trader','Reach the Gold league.','gold','🥇'),
  ('platinum-trader','Platinum Trader','Reach the Platinum league.','diamond','💠'),
  ('diamond-trader','Diamond Trader','Reach the Diamond league.','diamond','💎'),
  ('legend-trader','Legend','Reach the Legend league.','legend','👑')
ON CONFLICT (slug) DO NOTHING;

-- ============ AUTO-SEED GAMIFICATION STATS ON SIGNUP ============
CREATE OR REPLACE FUNCTION public.seed_gamification_stats()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.gamification_stats (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS on_profile_created_seed_gamification ON public.profiles;
CREATE TRIGGER on_profile_created_seed_gamification
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.seed_gamification_stats();

-- backfill for existing users
INSERT INTO public.gamification_stats (user_id)
SELECT id FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;

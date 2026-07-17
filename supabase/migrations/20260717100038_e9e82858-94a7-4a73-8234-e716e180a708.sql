
-- ============ social_follows ============
CREATE TABLE public.social_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(follower_id, following_id),
  CHECK (follower_id <> following_id)
);
CREATE INDEX idx_social_follows_follower ON public.social_follows(follower_id);
CREATE INDEX idx_social_follows_following ON public.social_follows(following_id);

GRANT SELECT, INSERT, DELETE ON public.social_follows TO authenticated;
GRANT ALL ON public.social_follows TO service_role;
ALTER TABLE public.social_follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Follows readable by authenticated"
  ON public.social_follows FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users manage own follows insert"
  ON public.social_follows FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "Users manage own follows delete"
  ON public.social_follows FOR DELETE TO authenticated
  USING (auth.uid() = follower_id);

-- ============ profile_customization ============
CREATE TABLE public.profile_customization (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  banner_url TEXT,
  favorite_pair TEXT,
  website TEXT,
  discord_handle TEXT,
  x_handle TEXT,
  telegram_handle TEXT,
  youtube_url TEXT,
  headline TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profile_customization TO authenticated;
GRANT INSERT, UPDATE ON public.profile_customization TO authenticated;
GRANT ALL ON public.profile_customization TO service_role;
ALTER TABLE public.profile_customization ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customization readable by authenticated"
  ON public.profile_customization FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users edit their own customization"
  ON public.profile_customization FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update their own customization"
  ON public.profile_customization FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_profile_customization_updated
  BEFORE UPDATE ON public.profile_customization
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ profile_privacy ============
CREATE TABLE public.profile_privacy (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  hide_profile BOOLEAN NOT NULL DEFAULT false,
  hide_stats BOOLEAN NOT NULL DEFAULT false,
  hide_journal BOOLEAN NOT NULL DEFAULT true,
  hide_activity BOOLEAN NOT NULL DEFAULT false,
  show_country BOOLEAN NOT NULL DEFAULT true,
  show_league BOOLEAN NOT NULL DEFAULT true,
  eligible_for_leaderboard BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profile_privacy TO authenticated;
GRANT INSERT, UPDATE ON public.profile_privacy TO authenticated;
GRANT ALL ON public.profile_privacy TO service_role;
ALTER TABLE public.profile_privacy ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Privacy readable by authenticated"
  ON public.profile_privacy FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users edit their own privacy"
  ON public.profile_privacy FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update their own privacy"
  ON public.profile_privacy FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_profile_privacy_updated
  BEFORE UPDATE ON public.profile_privacy
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ profile_views ============
CREATE TABLE public.profile_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_profile_views_profile ON public.profile_views(profile_id, viewed_at DESC);

GRANT SELECT, INSERT ON public.profile_views TO authenticated;
GRANT ALL ON public.profile_views TO service_role;
ALTER TABLE public.profile_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners can see views of their profile"
  ON public.profile_views FOR SELECT TO authenticated
  USING (auth.uid() = profile_id);
CREATE POLICY "Anyone can log a view"
  ON public.profile_views FOR INSERT TO authenticated
  WITH CHECK (viewer_id IS NULL OR viewer_id = auth.uid());

-- ============ leaderboard_snapshots ============
CREATE TABLE public.leaderboard_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period TEXT NOT NULL, -- 'weekly' | 'monthly' | 'all_time'
  period_key TEXT NOT NULL,
  category TEXT NOT NULL, -- 'xp' | 'win_rate' | 'profit_factor' | 'net_r' | 'profit' | 'consistency' | 'journal_score' | 'challenge_score' | 'achievements' | 'streak' | 'discipline'
  rank INTEGER NOT NULL,
  value DOUBLE PRECISION NOT NULL DEFAULT 0,
  scope TEXT NOT NULL DEFAULT 'global', -- 'global' | 'country:XX' | 'league:xx'
  taken_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, period, period_key, category, scope)
);
CREATE INDEX idx_snap_query ON public.leaderboard_snapshots(period, period_key, category, scope, rank);
CREATE INDEX idx_snap_user ON public.leaderboard_snapshots(user_id, category, period, taken_at DESC);

GRANT SELECT ON public.leaderboard_snapshots TO authenticated;
GRANT ALL ON public.leaderboard_snapshots TO service_role;
ALTER TABLE public.leaderboard_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Snapshots readable by authenticated"
  ON public.leaderboard_snapshots FOR SELECT TO authenticated USING (true);

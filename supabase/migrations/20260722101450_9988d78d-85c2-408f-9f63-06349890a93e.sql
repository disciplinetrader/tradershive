
-- Extend notification kinds
ALTER TYPE community_notification_kind ADD VALUE IF NOT EXISTS 'review_received';
ALTER TYPE community_notification_kind ADD VALUE IF NOT EXISTS 'mentor_feedback';
ALTER TYPE community_notification_kind ADD VALUE IF NOT EXISTS 'homework_assigned';
ALTER TYPE community_notification_kind ADD VALUE IF NOT EXISTS 'group_message';
ALTER TYPE community_notification_kind ADD VALUE IF NOT EXISTS 'group_invite';
ALTER TYPE community_notification_kind ADD VALUE IF NOT EXISTS 'live_session_reminder';
ALTER TYPE community_notification_kind ADD VALUE IF NOT EXISTS 'challenge_result';
ALTER TYPE community_notification_kind ADD VALUE IF NOT EXISTS 'idea_closed';

-- ============================================================
-- TRADE IDEAS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.trade_ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID REFERENCES public.community_posts(id) ON DELETE SET NULL,
  symbol TEXT NOT NULL,
  market TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('long','short')),
  timeframe TEXT,
  entry NUMERIC,
  stop_loss NUMERIC,
  take_profit NUMERIC,
  rr NUMERIC,
  chart_url TEXT,
  tv_url TEXT,
  replay_session_id UUID REFERENCES public.replay_sessions(id) ON DELETE SET NULL,
  journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  strategy_id UUID REFERENCES public.strategies(id) ON DELETE SET NULL,
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','win','loss','cancelled')),
  pnl_pct NUMERIC,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','followers','private')),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.trade_ideas TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trade_ideas TO authenticated;
GRANT ALL ON public.trade_ideas TO service_role;
ALTER TABLE public.trade_ideas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ideas read public" ON public.trade_ideas FOR SELECT
  USING (visibility = 'public' OR author_id = auth.uid());
CREATE POLICY "ideas write own" ON public.trade_ideas FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());
CREATE POLICY "ideas update own" ON public.trade_ideas FOR UPDATE TO authenticated
  USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());
CREATE POLICY "ideas delete own" ON public.trade_ideas FOR DELETE TO authenticated
  USING (author_id = auth.uid());
CREATE INDEX idx_ideas_author ON public.trade_ideas (author_id, created_at DESC);
CREATE INDEX idx_ideas_symbol ON public.trade_ideas (symbol, created_at DESC);
CREATE INDEX idx_ideas_status ON public.trade_ideas (status, created_at DESC);
CREATE TRIGGER trg_trade_ideas_updated BEFORE UPDATE ON public.trade_ideas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- TRADE REVIEWS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.trade_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('trade','journal','replay','idea')),
  target_id UUID NOT NULL,
  target_owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  overall_score NUMERIC,
  suggestions TEXT,
  strengths TEXT,
  weaknesses TEXT,
  is_mentor_review BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trade_reviews TO authenticated;
GRANT SELECT ON public.trade_reviews TO anon;
GRANT ALL ON public.trade_reviews TO service_role;
ALTER TABLE public.trade_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reviews read" ON public.trade_reviews FOR SELECT USING (true);
CREATE POLICY "reviews write" ON public.trade_reviews FOR INSERT TO authenticated
  WITH CHECK (reviewer_id = auth.uid());
CREATE POLICY "reviews update own" ON public.trade_reviews FOR UPDATE TO authenticated
  USING (reviewer_id = auth.uid()) WITH CHECK (reviewer_id = auth.uid());
CREATE POLICY "reviews delete own" ON public.trade_reviews FOR DELETE TO authenticated
  USING (reviewer_id = auth.uid());
CREATE INDEX idx_reviews_target ON public.trade_reviews (target_type, target_id, created_at DESC);
CREATE INDEX idx_reviews_owner ON public.trade_reviews (target_owner_id, created_at DESC);
CREATE INDEX idx_reviews_reviewer ON public.trade_reviews (reviewer_id, created_at DESC);
CREATE TRIGGER trg_reviews_updated BEFORE UPDATE ON public.trade_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- MENTOR SYSTEM
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mentor_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  headline TEXT,
  bio TEXT,
  specialties TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  markets TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  languages TEXT[] NOT NULL DEFAULT ARRAY['en']::TEXT[],
  hourly_rate NUMERIC,
  availability JSONB NOT NULL DEFAULT '{}'::jsonb,
  verified BOOLEAN NOT NULL DEFAULT false,
  rating NUMERIC NOT NULL DEFAULT 0,
  reviews_count INTEGER NOT NULL DEFAULT 0,
  mentees_count INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.mentor_profiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mentor_profiles TO authenticated;
GRANT ALL ON public.mentor_profiles TO service_role;
ALTER TABLE public.mentor_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mentors read" ON public.mentor_profiles FOR SELECT USING (true);
CREATE POLICY "mentors write own" ON public.mentor_profiles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "mentors update own" ON public.mentor_profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "mentors delete own" ON public.mentor_profiles FOR DELETE TO authenticated
  USING (user_id = auth.uid());
CREATE TRIGGER trg_mentors_updated BEFORE UPDATE ON public.mentor_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.mentor_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mentee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','paused','ended','declined')),
  plan JSONB NOT NULL DEFAULT '{}'::jsonb,
  message TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mentor_id, mentee_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mentor_assignments TO authenticated;
GRANT ALL ON public.mentor_assignments TO service_role;
ALTER TABLE public.mentor_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assign read parties" ON public.mentor_assignments FOR SELECT TO authenticated
  USING (mentor_id = auth.uid() OR mentee_id = auth.uid());
CREATE POLICY "assign create mentee" ON public.mentor_assignments FOR INSERT TO authenticated
  WITH CHECK (mentee_id = auth.uid());
CREATE POLICY "assign update parties" ON public.mentor_assignments FOR UPDATE TO authenticated
  USING (mentor_id = auth.uid() OR mentee_id = auth.uid())
  WITH CHECK (mentor_id = auth.uid() OR mentee_id = auth.uid());
CREATE INDEX idx_assign_mentor ON public.mentor_assignments (mentor_id, status);
CREATE INDEX idx_assign_mentee ON public.mentor_assignments (mentee_id, status);
CREATE TRIGGER trg_assign_updated BEFORE UPDATE ON public.mentor_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.mentor_homework (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.mentor_assignments(id) ON DELETE CASCADE,
  mentor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mentee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','submitted','reviewed','completed','skipped')),
  submission JSONB,
  feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mentor_homework TO authenticated;
GRANT ALL ON public.mentor_homework TO service_role;
ALTER TABLE public.mentor_homework ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hw read parties" ON public.mentor_homework FOR SELECT TO authenticated
  USING (mentor_id = auth.uid() OR mentee_id = auth.uid());
CREATE POLICY "hw create mentor" ON public.mentor_homework FOR INSERT TO authenticated
  WITH CHECK (mentor_id = auth.uid());
CREATE POLICY "hw update parties" ON public.mentor_homework FOR UPDATE TO authenticated
  USING (mentor_id = auth.uid() OR mentee_id = auth.uid())
  WITH CHECK (mentor_id = auth.uid() OR mentee_id = auth.uid());
CREATE INDEX idx_hw_assign ON public.mentor_homework (assignment_id, created_at DESC);
CREATE TRIGGER trg_hw_updated BEFORE UPDATE ON public.mentor_homework
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- STUDY GROUPS (create base tables first, then policies referencing each other)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.study_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  avatar_url TEXT,
  banner_url TEXT,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private','invite')),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_count INTEGER NOT NULL DEFAULT 1,
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.study_groups TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_groups TO authenticated;
GRANT ALL ON public.study_groups TO service_role;
ALTER TABLE public.study_groups ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.study_group_members (
  group_id UUID NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','mentor','member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_group_members TO authenticated;
GRANT ALL ON public.study_group_members TO service_role;
ALTER TABLE public.study_group_members ENABLE ROW LEVEL SECURITY;

-- Now policies that reference both
CREATE POLICY "groups read public" ON public.study_groups FOR SELECT
  USING (visibility <> 'private' OR owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.study_group_members m WHERE m.group_id = study_groups.id AND m.user_id = auth.uid()));
CREATE POLICY "groups create" ON public.study_groups FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "groups update owner" ON public.study_groups FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "groups delete owner" ON public.study_groups FOR DELETE TO authenticated
  USING (owner_id = auth.uid());
CREATE INDEX idx_groups_owner ON public.study_groups (owner_id);
CREATE TRIGGER trg_groups_updated BEFORE UPDATE ON public.study_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "gm read" ON public.study_group_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "gm join self" ON public.study_group_members FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.study_groups g WHERE g.id = group_id AND g.owner_id = auth.uid()));
CREATE POLICY "gm leave self" ON public.study_group_members FOR DELETE TO authenticated
  USING (user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.study_groups g WHERE g.id = group_id AND g.owner_id = auth.uid()));
CREATE INDEX idx_gm_user ON public.study_group_members (user_id);

CREATE OR REPLACE FUNCTION public.trg_group_member_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.study_groups SET member_count = member_count + 1 WHERE id = NEW.group_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.study_groups SET member_count = GREATEST(0, member_count - 1) WHERE id = OLD.group_id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_gm_count AFTER INSERT OR DELETE ON public.study_group_members
  FOR EACH ROW EXECUTE FUNCTION public.trg_group_member_count();

CREATE TABLE IF NOT EXISTS public.study_group_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  reply_to UUID REFERENCES public.study_group_messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_group_messages TO authenticated;
GRANT ALL ON public.study_group_messages TO service_role;
ALTER TABLE public.study_group_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gmsg read members" ON public.study_group_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.study_group_members m WHERE m.group_id = study_group_messages.group_id AND m.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.study_groups g WHERE g.id = study_group_messages.group_id AND g.visibility = 'public'));
CREATE POLICY "gmsg write members" ON public.study_group_messages FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.study_group_members m WHERE m.group_id = study_group_messages.group_id AND m.user_id = auth.uid()));
CREATE POLICY "gmsg delete own" ON public.study_group_messages FOR DELETE TO authenticated
  USING (user_id = auth.uid());
CREATE INDEX idx_gmsg_group ON public.study_group_messages (group_id, created_at DESC);
ALTER PUBLICATION supabase_realtime ADD TABLE public.study_group_messages;

CREATE TABLE IF NOT EXISTS public.study_group_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  added_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('replay','journal','idea','challenge','strategy','note','link')),
  ref_id UUID,
  title TEXT,
  note TEXT,
  url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_group_resources TO authenticated;
GRANT ALL ON public.study_group_resources TO service_role;
ALTER TABLE public.study_group_resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gres read" ON public.study_group_resources FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.study_group_members m WHERE m.group_id = study_group_resources.group_id AND m.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.study_groups g WHERE g.id = study_group_resources.group_id AND g.visibility = 'public'));
CREATE POLICY "gres write" ON public.study_group_resources FOR INSERT TO authenticated
  WITH CHECK (added_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.study_group_members m WHERE m.group_id = study_group_resources.group_id AND m.user_id = auth.uid()));
CREATE POLICY "gres delete own" ON public.study_group_resources FOR DELETE TO authenticated
  USING (added_by = auth.uid());
CREATE INDEX idx_gres_group ON public.study_group_resources (group_id, created_at DESC);

-- ============================================================
-- LIVE SESSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.live_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id UUID REFERENCES public.study_groups(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  instrument TEXT,
  session_type TEXT NOT NULL DEFAULT 'analysis' CHECK (session_type IN ('analysis','review','q_and_a','workshop','live_trade')),
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  stream_url TEXT,
  replay_url TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','ended','cancelled')),
  attendee_count INTEGER NOT NULL DEFAULT 0,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','group','private')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.live_sessions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_sessions TO authenticated;
GRANT ALL ON public.live_sessions TO service_role;
ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ls read" ON public.live_sessions FOR SELECT
  USING (visibility = 'public' OR host_id = auth.uid()
    OR (group_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.study_group_members m WHERE m.group_id = live_sessions.group_id AND m.user_id = auth.uid())));
CREATE POLICY "ls write" ON public.live_sessions FOR INSERT TO authenticated
  WITH CHECK (host_id = auth.uid());
CREATE POLICY "ls update host" ON public.live_sessions FOR UPDATE TO authenticated
  USING (host_id = auth.uid()) WITH CHECK (host_id = auth.uid());
CREATE POLICY "ls delete host" ON public.live_sessions FOR DELETE TO authenticated
  USING (host_id = auth.uid());
CREATE INDEX idx_ls_start ON public.live_sessions (start_at);
CREATE INDEX idx_ls_host ON public.live_sessions (host_id, start_at DESC);
CREATE TRIGGER trg_ls_updated BEFORE UPDATE ON public.live_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_sessions;

CREATE TABLE IF NOT EXISTS public.live_session_attendees (
  session_id UUID NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rsvp TEXT NOT NULL DEFAULT 'going' CHECK (rsvp IN ('going','maybe','declined')),
  attended BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_session_attendees TO authenticated;
GRANT ALL ON public.live_session_attendees TO service_role;
ALTER TABLE public.live_session_attendees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lsa read" ON public.live_session_attendees FOR SELECT TO authenticated USING (true);
CREATE POLICY "lsa self" ON public.live_session_attendees FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "lsa self update" ON public.live_session_attendees FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "lsa self delete" ON public.live_session_attendees FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.trg_live_attendee_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.rsvp = 'going' THEN
    UPDATE public.live_sessions SET attendee_count = attendee_count + 1 WHERE id = NEW.session_id;
  ELSIF TG_OP = 'DELETE' AND OLD.rsvp = 'going' THEN
    UPDATE public.live_sessions SET attendee_count = GREATEST(0, attendee_count - 1) WHERE id = OLD.session_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.rsvp <> NEW.rsvp THEN
    IF NEW.rsvp = 'going' THEN
      UPDATE public.live_sessions SET attendee_count = attendee_count + 1 WHERE id = NEW.session_id;
    ELSIF OLD.rsvp = 'going' THEN
      UPDATE public.live_sessions SET attendee_count = GREATEST(0, attendee_count - 1) WHERE id = NEW.session_id;
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_lsa_count AFTER INSERT OR UPDATE OR DELETE ON public.live_session_attendees
  FOR EACH ROW EXECUTE FUNCTION public.trg_live_attendee_count();

-- ============================================================
-- COMMUNITY CHALLENGES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.community_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('risk','profit_factor','replay_hours','journal','consistency','session','replay','win_rate','custom')),
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  metric JSONB NOT NULL DEFAULT '{}'::jsonb,
  rewards JSONB NOT NULL DEFAULT '{}'::jsonb,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','group','private')),
  group_id UUID REFERENCES public.study_groups(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','ended','cancelled')),
  participant_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.community_challenges TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_challenges TO authenticated;
GRANT ALL ON public.community_challenges TO service_role;
ALTER TABLE public.community_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cch read" ON public.community_challenges FOR SELECT
  USING (visibility = 'public' OR created_by = auth.uid());
CREATE POLICY "cch admin write" ON public.community_challenges FOR ALL TO authenticated
  USING (is_platform_admin(auth.uid()) OR created_by = auth.uid())
  WITH CHECK (is_platform_admin(auth.uid()) OR created_by = auth.uid());
CREATE INDEX idx_cch_status ON public.community_challenges (status, end_at DESC);
CREATE TRIGGER trg_cch_updated BEFORE UPDATE ON public.community_challenges
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.community_challenge_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES public.community_challenges(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score NUMERIC NOT NULL DEFAULT 0,
  rank INTEGER,
  breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (challenge_id, user_id)
);
GRANT SELECT ON public.community_challenge_entries TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_challenge_entries TO authenticated;
GRANT ALL ON public.community_challenge_entries TO service_role;
ALTER TABLE public.community_challenge_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cce read" ON public.community_challenge_entries FOR SELECT USING (true);
CREATE POLICY "cce join self" ON public.community_challenge_entries FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "cce update self admin" ON public.community_challenge_entries FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR is_platform_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR is_platform_admin(auth.uid()));
CREATE POLICY "cce leave self" ON public.community_challenge_entries FOR DELETE TO authenticated
  USING (user_id = auth.uid());
CREATE INDEX idx_cce_ch ON public.community_challenge_entries (challenge_id, score DESC);
CREATE INDEX idx_cce_user ON public.community_challenge_entries (user_id);
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_challenge_entries;

CREATE OR REPLACE FUNCTION public.trg_cch_participant_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.community_challenges SET participant_count = participant_count + 1 WHERE id = NEW.challenge_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.community_challenges SET participant_count = GREATEST(0, participant_count - 1) WHERE id = OLD.challenge_id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_cce_count AFTER INSERT OR DELETE ON public.community_challenge_entries
  FOR EACH ROW EXECUTE FUNCTION public.trg_cch_participant_count();

-- ============================================================
-- REPUTATION EVENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.reputation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  points INTEGER NOT NULL,
  ref_type TEXT,
  ref_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.reputation_events TO authenticated;
GRANT ALL ON public.reputation_events TO service_role;
ALTER TABLE public.reputation_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rep events read own" ON public.reputation_events FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "rep events insert" ON public.reputation_events FOR INSERT TO authenticated
  WITH CHECK (true);
CREATE INDEX idx_rep_user ON public.reputation_events (user_id, created_at DESC);

-- Mirror trade_ideas -> community_posts
CREATE OR REPLACE FUNCTION public.trg_idea_to_post()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_post_id UUID;
BEGIN
  IF NEW.visibility = 'public' AND NEW.post_id IS NULL THEN
    INSERT INTO public.community_posts (
      author_id, post_type, title, body_md, symbol, direction,
      hashtags, linked_replay_id, linked_journal_id, linked_strategy_id, visibility
    ) VALUES (
      NEW.author_id, 'trade_idea',
      COALESCE(NEW.symbol,'Trade Idea') || ' ' || UPPER(NEW.direction),
      COALESCE(NEW.notes,''),
      NEW.symbol, NEW.direction,
      NEW.tags, NEW.replay_session_id, NEW.journal_entry_id, NEW.strategy_id, 'public'
    ) RETURNING id INTO v_post_id;
    NEW.post_id := v_post_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_idea_mirror BEFORE INSERT ON public.trade_ideas
  FOR EACH ROW EXECUTE FUNCTION public.trg_idea_to_post();

-- Auto-create trade_review notification
CREATE OR REPLACE FUNCTION public.trg_review_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.target_owner_id IS NOT NULL AND NEW.target_owner_id <> NEW.reviewer_id THEN
    INSERT INTO public.community_notifications(user_id, actor_id, kind, message)
    VALUES (NEW.target_owner_id, NEW.reviewer_id, 'review_received',
      'left a review on your ' || NEW.target_type);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_reviews_notify AFTER INSERT ON public.trade_reviews
  FOR EACH ROW EXECUTE FUNCTION public.trg_review_notify();

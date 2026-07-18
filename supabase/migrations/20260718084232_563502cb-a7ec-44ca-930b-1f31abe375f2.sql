
CREATE TYPE public.community_post_type AS ENUM (
  'text','chart','trade_idea','journal','battle_result','tournament_result',
  'replay','strategy','question','poll','image','video','pdf','announcement'
);
CREATE TYPE public.community_report_status AS ENUM ('open','reviewing','resolved','dismissed');
CREATE TYPE public.community_notification_kind AS ENUM (
  'follow','comment','reply','like','mention','share','post_featured','post_pinned','report_resolved'
);
CREATE TYPE public.community_reaction_kind AS ENUM ('like','helpful','insightful','bullish','bearish','fire','laugh','clap');

CREATE TABLE public.community_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  post_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.community_categories TO anon, authenticated;
GRANT ALL ON public.community_categories TO service_role;
ALTER TABLE public.community_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories readable" ON public.community_categories FOR SELECT USING (is_active OR public.is_platform_admin(auth.uid()));
CREATE POLICY "admin manage categories" ON public.community_categories FOR ALL
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TABLE public.community_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  post_count INTEGER NOT NULL DEFAULT 0,
  is_trending BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.community_tags TO anon, authenticated;
GRANT INSERT ON public.community_tags TO authenticated;
GRANT ALL ON public.community_tags TO service_role;
ALTER TABLE public.community_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tags readable" ON public.community_tags FOR SELECT USING (TRUE);
CREATE POLICY "tags insert auth" ON public.community_tags FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "admin manage tags" ON public.community_tags FOR ALL
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TABLE public.community_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.community_categories(id) ON DELETE SET NULL,
  post_type public.community_post_type NOT NULL DEFAULT 'text',
  title TEXT,
  body_md TEXT,
  body_html TEXT,
  excerpt TEXT,
  symbol TEXT,
  market TEXT,
  direction TEXT,
  hashtags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  mentions UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  media JSONB NOT NULL DEFAULT '[]'::jsonb,
  poll JSONB,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  linked_trade_id UUID REFERENCES public.paper_trades(id) ON DELETE SET NULL,
  linked_journal_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  linked_replay_id UUID REFERENCES public.replay_sessions(id) ON DELETE SET NULL,
  linked_strategy_id UUID REFERENCES public.strategies(id) ON DELETE SET NULL,
  linked_battle_id UUID REFERENCES public.battles(id) ON DELETE SET NULL,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  is_draft BOOLEAN NOT NULL DEFAULT FALSE,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','followers','private')),
  like_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  bookmark_count INTEGER NOT NULL DEFAULT 0,
  share_count INTEGER NOT NULL DEFAULT 0,
  view_count INTEGER NOT NULL DEFAULT 0,
  helpful_count INTEGER NOT NULL DEFAULT 0,
  trending_score NUMERIC NOT NULL DEFAULT 0,
  published_at TIMESTAMPTZ DEFAULT now(),
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cposts_author ON public.community_posts(author_id, created_at DESC);
CREATE INDEX idx_cposts_cat ON public.community_posts(category_id, created_at DESC);
CREATE INDEX idx_cposts_pub ON public.community_posts(is_published, is_deleted, published_at DESC);
CREATE INDEX idx_cposts_trending ON public.community_posts(trending_score DESC) WHERE is_published AND NOT is_deleted;
CREATE INDEX idx_cposts_symbol ON public.community_posts(symbol) WHERE symbol IS NOT NULL;
CREATE INDEX idx_cposts_hashtags ON public.community_posts USING GIN(hashtags);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_posts TO authenticated;
GRANT SELECT ON public.community_posts TO anon;
GRANT ALL ON public.community_posts TO service_role;
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "posts public read" ON public.community_posts FOR SELECT
  USING (NOT is_deleted AND is_published AND NOT is_draft AND visibility='public');
CREATE POLICY "posts author read" ON public.community_posts FOR SELECT TO authenticated USING (author_id=auth.uid());
CREATE POLICY "posts followers read" ON public.community_posts FOR SELECT TO authenticated
  USING (NOT is_deleted AND is_published AND visibility='followers'
    AND EXISTS (SELECT 1 FROM public.social_follows WHERE follower_id=auth.uid() AND following_id=author_id));
CREATE POLICY "posts admin read" ON public.community_posts FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));
CREATE POLICY "posts author write" ON public.community_posts FOR INSERT TO authenticated WITH CHECK (author_id=auth.uid());
CREATE POLICY "posts author update" ON public.community_posts FOR UPDATE TO authenticated USING (author_id=auth.uid()) WITH CHECK (author_id=auth.uid());
CREATE POLICY "posts author delete" ON public.community_posts FOR DELETE TO authenticated USING (author_id=auth.uid());
CREATE POLICY "posts admin all" ON public.community_posts FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TABLE public.community_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.community_comments(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body_md TEXT NOT NULL,
  body_html TEXT,
  mentions UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  like_count INTEGER NOT NULL DEFAULT 0,
  reply_count INTEGER NOT NULL DEFAULT 0,
  is_edited BOOLEAN NOT NULL DEFAULT FALSE,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ccomm_post ON public.community_comments(post_id, created_at ASC);
CREATE INDEX idx_ccomm_parent ON public.community_comments(parent_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_comments TO authenticated;
GRANT SELECT ON public.community_comments TO anon;
GRANT ALL ON public.community_comments TO service_role;
ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comments read" ON public.community_comments FOR SELECT USING (NOT is_deleted);
CREATE POLICY "comments author insert" ON public.community_comments FOR INSERT TO authenticated WITH CHECK (author_id=auth.uid());
CREATE POLICY "comments author update" ON public.community_comments FOR UPDATE TO authenticated USING (author_id=auth.uid()) WITH CHECK (author_id=auth.uid());
CREATE POLICY "comments author delete" ON public.community_comments FOR DELETE TO authenticated USING (author_id=auth.uid());
CREATE POLICY "comments admin all" ON public.community_comments FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TABLE public.community_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID REFERENCES public.community_posts(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES public.community_comments(id) ON DELETE CASCADE,
  kind public.community_reaction_kind NOT NULL DEFAULT 'like',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((post_id IS NOT NULL) <> (comment_id IS NOT NULL)),
  UNIQUE(user_id, post_id, comment_id, kind)
);
CREATE INDEX idx_creact_post ON public.community_reactions(post_id);
CREATE INDEX idx_creact_comment ON public.community_reactions(comment_id);
CREATE INDEX idx_creact_user ON public.community_reactions(user_id);
GRANT SELECT, INSERT, DELETE ON public.community_reactions TO authenticated;
GRANT ALL ON public.community_reactions TO service_role;
ALTER TABLE public.community_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reactions read" ON public.community_reactions FOR SELECT USING (TRUE);
CREATE POLICY "reactions own write" ON public.community_reactions FOR INSERT TO authenticated WITH CHECK (user_id=auth.uid());
CREATE POLICY "reactions own delete" ON public.community_reactions FOR DELETE TO authenticated USING (user_id=auth.uid());

CREATE TABLE public.community_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, post_id)
);
CREATE INDEX idx_cbook_user ON public.community_bookmarks(user_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.community_bookmarks TO authenticated;
GRANT ALL ON public.community_bookmarks TO service_role;
ALTER TABLE public.community_bookmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bookmarks own" ON public.community_bookmarks FOR ALL TO authenticated
  USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());

CREATE TABLE public.community_followers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_muted BOOLEAN NOT NULL DEFAULT FALSE,
  is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(follower_id, following_id),
  CHECK (follower_id <> following_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_followers TO authenticated;
GRANT ALL ON public.community_followers TO service_role;
ALTER TABLE public.community_followers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cfollowers read" ON public.community_followers FOR SELECT TO authenticated
  USING (follower_id=auth.uid() OR following_id=auth.uid());
CREATE POLICY "cfollowers own" ON public.community_followers FOR ALL TO authenticated
  USING (follower_id=auth.uid()) WITH CHECK (follower_id=auth.uid());

CREATE TABLE public.community_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID REFERENCES public.community_posts(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES public.community_comments(id) ON DELETE CASCADE,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  details TEXT,
  status public.community_report_status NOT NULL DEFAULT 'open',
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  resolution TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.community_reports TO authenticated;
GRANT ALL ON public.community_reports TO service_role;
ALTER TABLE public.community_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reports own read" ON public.community_reports FOR SELECT TO authenticated
  USING (reporter_id=auth.uid() OR public.is_platform_admin(auth.uid()));
CREATE POLICY "reports own insert" ON public.community_reports FOR INSERT TO authenticated WITH CHECK (reporter_id=auth.uid());
CREATE POLICY "reports admin update" ON public.community_reports FOR UPDATE TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TABLE public.community_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  kind public.community_notification_kind NOT NULL,
  post_id UUID REFERENCES public.community_posts(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES public.community_comments(id) ON DELETE CASCADE,
  message TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cnotif_user ON public.community_notifications(user_id, is_read, created_at DESC);
GRANT SELECT, UPDATE, DELETE ON public.community_notifications TO authenticated;
GRANT ALL ON public.community_notifications TO service_role;
ALTER TABLE public.community_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cnotif own" ON public.community_notifications FOR SELECT TO authenticated USING (user_id=auth.uid());
CREATE POLICY "cnotif own update" ON public.community_notifications FOR UPDATE TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
CREATE POLICY "cnotif own delete" ON public.community_notifications FOR DELETE TO authenticated USING (user_id=auth.uid());

CREATE TABLE public.community_reputation (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  reputation_score INTEGER NOT NULL DEFAULT 0,
  posts_count INTEGER NOT NULL DEFAULT 0,
  comments_count INTEGER NOT NULL DEFAULT 0,
  likes_received INTEGER NOT NULL DEFAULT 0,
  helpful_received INTEGER NOT NULL DEFAULT 0,
  insightful_received INTEGER NOT NULL DEFAULT 0,
  strategies_shared INTEGER NOT NULL DEFAULT 0,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_mentor BOOLEAN NOT NULL DEFAULT FALSE,
  is_educator BOOLEAN NOT NULL DEFAULT FALSE,
  is_top_contributor BOOLEAN NOT NULL DEFAULT FALSE,
  is_battle_champion BOOLEAN NOT NULL DEFAULT FALSE,
  is_monthly_champion BOOLEAN NOT NULL DEFAULT FALSE,
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.community_reputation TO anon, authenticated;
GRANT ALL ON public.community_reputation TO service_role;
ALTER TABLE public.community_reputation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reputation read" ON public.community_reputation FOR SELECT USING (TRUE);
CREATE POLICY "reputation admin write" ON public.community_reputation FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TRIGGER trg_cposts_updated BEFORE UPDATE ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ccomments_updated BEFORE UPDATE ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ccategories_updated BEFORE UPDATE ON public.community_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_creports_updated BEFORE UPDATE ON public.community_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.trg_community_reaction_counts()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE delta INTEGER;
BEGIN
  IF TG_OP='INSERT' THEN delta:=1; ELSE delta:=-1; END IF;
  IF (TG_OP='INSERT' AND NEW.post_id IS NOT NULL) OR (TG_OP='DELETE' AND OLD.post_id IS NOT NULL) THEN
    UPDATE public.community_posts SET
      like_count = GREATEST(0, like_count + CASE WHEN COALESCE(NEW.kind,OLD.kind)='like' THEN delta ELSE 0 END),
      helpful_count = GREATEST(0, helpful_count + CASE WHEN COALESCE(NEW.kind,OLD.kind)='helpful' THEN delta ELSE 0 END)
      WHERE id = COALESCE(NEW.post_id, OLD.post_id);
  END IF;
  IF (TG_OP='INSERT' AND NEW.comment_id IS NOT NULL) OR (TG_OP='DELETE' AND OLD.comment_id IS NOT NULL) THEN
    UPDATE public.community_comments SET like_count = GREATEST(0, like_count + delta)
      WHERE id = COALESCE(NEW.comment_id, OLD.comment_id);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_creact_counts AFTER INSERT OR DELETE ON public.community_reactions
  FOR EACH ROW EXECUTE FUNCTION public.trg_community_reaction_counts();

CREATE OR REPLACE FUNCTION public.trg_community_comment_counts()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    UPDATE public.community_posts SET comment_count=comment_count+1 WHERE id=NEW.post_id;
    IF NEW.parent_id IS NOT NULL THEN
      UPDATE public.community_comments SET reply_count=reply_count+1 WHERE id=NEW.parent_id;
    END IF;
  ELSIF TG_OP='DELETE' THEN
    UPDATE public.community_posts SET comment_count=GREATEST(0,comment_count-1) WHERE id=OLD.post_id;
    IF OLD.parent_id IS NOT NULL THEN
      UPDATE public.community_comments SET reply_count=GREATEST(0,reply_count-1) WHERE id=OLD.parent_id;
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_ccomm_counts AFTER INSERT OR DELETE ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.trg_community_comment_counts();

CREATE OR REPLACE FUNCTION public.trg_community_bookmark_counts()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP='INSERT' THEN UPDATE public.community_posts SET bookmark_count=bookmark_count+1 WHERE id=NEW.post_id;
  ELSIF TG_OP='DELETE' THEN UPDATE public.community_posts SET bookmark_count=GREATEST(0,bookmark_count-1) WHERE id=OLD.post_id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_cbook_counts AFTER INSERT OR DELETE ON public.community_bookmarks
  FOR EACH ROW EXECUTE FUNCTION public.trg_community_bookmark_counts();

CREATE OR REPLACE FUNCTION public.community_recompute_trending(_post_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p RECORD; age_hours NUMERIC; score NUMERIC;
BEGIN
  SELECT like_count, comment_count, bookmark_count, helpful_count, view_count, share_count, published_at
    INTO p FROM public.community_posts WHERE id=_post_id;
  IF NOT FOUND THEN RETURN; END IF;
  age_hours := GREATEST(1, EXTRACT(EPOCH FROM (now()-COALESCE(p.published_at,now())))/3600);
  score := ((p.like_count*1.0)+(p.helpful_count*3.0)+(p.comment_count*2.0)
           +(p.bookmark_count*2.5)+(p.share_count*4.0)+(p.view_count*0.05))
           / POWER(age_hours+2, 1.5);
  UPDATE public.community_posts SET trending_score=score WHERE id=_post_id;
END $$;

CREATE OR REPLACE FUNCTION public.trg_recompute_post_trending_reaction()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pid UUID;
BEGIN
  pid := COALESCE(NEW.post_id, OLD.post_id);
  IF pid IS NOT NULL THEN PERFORM public.community_recompute_trending(pid); END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_trending_from_reaction AFTER INSERT OR DELETE ON public.community_reactions
  FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_post_trending_reaction();

CREATE OR REPLACE FUNCTION public.trg_recompute_post_trending_comment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.community_recompute_trending(COALESCE(NEW.post_id, OLD.post_id));
  RETURN NULL;
END $$;
CREATE TRIGGER trg_trending_from_comment AFTER INSERT OR DELETE ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_post_trending_comment();

CREATE OR REPLACE FUNCTION public.trg_recompute_post_trending_bookmark()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.community_recompute_trending(COALESCE(NEW.post_id, OLD.post_id));
  RETURN NULL;
END $$;
CREATE TRIGGER trg_trending_from_bookmark AFTER INSERT OR DELETE ON public.community_bookmarks
  FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_post_trending_bookmark();

CREATE OR REPLACE FUNCTION public.community_recompute_reputation(_user_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  posts_c INTEGER; comments_c INTEGER; likes_c INTEGER; helpful_c INTEGER;
  insightful_c INTEGER; strategies_c INTEGER; score INTEGER;
BEGIN
  SELECT COUNT(*) INTO posts_c FROM public.community_posts WHERE author_id=_user_id AND NOT is_deleted AND is_published;
  SELECT COUNT(*) INTO comments_c FROM public.community_comments WHERE author_id=_user_id AND NOT is_deleted;
  SELECT COALESCE(SUM(like_count),0) INTO likes_c FROM public.community_posts WHERE author_id=_user_id AND NOT is_deleted;
  SELECT COUNT(*) INTO helpful_c FROM public.community_reactions r
    JOIN public.community_posts p ON p.id=r.post_id WHERE p.author_id=_user_id AND r.kind='helpful';
  SELECT COUNT(*) INTO insightful_c FROM public.community_reactions r
    JOIN public.community_posts p ON p.id=r.post_id WHERE p.author_id=_user_id AND r.kind='insightful';
  SELECT COUNT(*) INTO strategies_c FROM public.community_posts WHERE author_id=_user_id AND post_type='strategy' AND NOT is_deleted;
  score := (posts_c*5)+(comments_c*2)+(likes_c*1)+(helpful_c*5)+(insightful_c*4)+(strategies_c*10);
  INSERT INTO public.community_reputation(user_id, reputation_score, posts_count, comments_count,
    likes_received, helpful_received, insightful_received, strategies_shared, updated_at)
  VALUES (_user_id, score, posts_c, comments_c, likes_c, helpful_c, insightful_c, strategies_c, now())
  ON CONFLICT (user_id) DO UPDATE SET
    reputation_score=EXCLUDED.reputation_score, posts_count=EXCLUDED.posts_count,
    comments_count=EXCLUDED.comments_count, likes_received=EXCLUDED.likes_received,
    helpful_received=EXCLUDED.helpful_received, insightful_received=EXCLUDED.insightful_received,
    strategies_shared=EXCLUDED.strategies_shared, is_top_contributor=(EXCLUDED.reputation_score>=500),
    updated_at=now();
END $$;

CREATE OR REPLACE FUNCTION public.trg_reputation_on_post()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.community_recompute_reputation(COALESCE(NEW.author_id, OLD.author_id));
  RETURN NULL;
END $$;
CREATE TRIGGER trg_rep_post AFTER INSERT OR UPDATE OR DELETE ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.trg_reputation_on_post();
CREATE TRIGGER trg_rep_comment AFTER INSERT OR UPDATE OR DELETE ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.trg_reputation_on_post();

CREATE OR REPLACE FUNCTION public.trg_community_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE target_uid UUID;
BEGIN
  IF TG_TABLE_NAME='community_reactions' AND TG_OP='INSERT' THEN
    IF NEW.post_id IS NOT NULL THEN
      SELECT author_id INTO target_uid FROM public.community_posts WHERE id=NEW.post_id;
    ELSE
      SELECT author_id INTO target_uid FROM public.community_comments WHERE id=NEW.comment_id;
    END IF;
    IF target_uid IS NOT NULL AND target_uid<>NEW.user_id THEN
      INSERT INTO public.community_notifications(user_id,actor_id,kind,post_id,comment_id,message)
      VALUES (target_uid,NEW.user_id,'like',NEW.post_id,NEW.comment_id,'reacted to your post');
    END IF;
  ELSIF TG_TABLE_NAME='community_comments' AND TG_OP='INSERT' THEN
    IF NEW.parent_id IS NOT NULL THEN
      SELECT author_id INTO target_uid FROM public.community_comments WHERE id=NEW.parent_id;
      IF target_uid IS NOT NULL AND target_uid<>NEW.author_id THEN
        INSERT INTO public.community_notifications(user_id,actor_id,kind,post_id,comment_id,message)
        VALUES (target_uid,NEW.author_id,'reply',NEW.post_id,NEW.id,'replied to your comment');
      END IF;
    END IF;
    SELECT author_id INTO target_uid FROM public.community_posts WHERE id=NEW.post_id;
    IF target_uid IS NOT NULL AND target_uid<>NEW.author_id THEN
      INSERT INTO public.community_notifications(user_id,actor_id,kind,post_id,comment_id,message)
      VALUES (target_uid,NEW.author_id,'comment',NEW.post_id,NEW.id,'commented on your post');
    END IF;
  ELSIF TG_TABLE_NAME='community_followers' AND TG_OP='INSERT' THEN
    IF NEW.following_id<>NEW.follower_id THEN
      INSERT INTO public.community_notifications(user_id,actor_id,kind,message)
      VALUES (NEW.following_id,NEW.follower_id,'follow','started following you');
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_cnotif_reaction AFTER INSERT ON public.community_reactions
  FOR EACH ROW EXECUTE FUNCTION public.trg_community_notify();
CREATE TRIGGER trg_cnotif_comment AFTER INSERT ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.trg_community_notify();
CREATE TRIGGER trg_cnotif_follow AFTER INSERT ON public.community_followers
  FOR EACH ROW EXECUTE FUNCTION public.trg_community_notify();

CREATE OR REPLACE FUNCTION public.trg_ccat_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP='INSERT' AND NEW.category_id IS NOT NULL THEN
    UPDATE public.community_categories SET post_count=post_count+1 WHERE id=NEW.category_id;
  ELSIF TG_OP='DELETE' AND OLD.category_id IS NOT NULL THEN
    UPDATE public.community_categories SET post_count=GREATEST(0,post_count-1) WHERE id=OLD.category_id;
  ELSIF TG_OP='UPDATE' AND NEW.category_id IS DISTINCT FROM OLD.category_id THEN
    IF OLD.category_id IS NOT NULL THEN
      UPDATE public.community_categories SET post_count=GREATEST(0,post_count-1) WHERE id=OLD.category_id;
    END IF;
    IF NEW.category_id IS NOT NULL THEN
      UPDATE public.community_categories SET post_count=post_count+1 WHERE id=NEW.category_id;
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_ccat_count AFTER INSERT OR UPDATE OR DELETE ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.trg_ccat_count();

ALTER PUBLICATION supabase_realtime ADD TABLE public.community_posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_notifications;

INSERT INTO public.community_categories(slug,name,description,icon,color,sort_order) VALUES
  ('forex','Forex','Currency markets, majors, minors, exotics','LineChart','#3B82F6',10),
  ('crypto','Crypto','Bitcoin, altcoins, DeFi','Bitcoin','#F59E0B',20),
  ('gold','Gold','XAUUSD & precious metals','Coins','#EAB308',30),
  ('indices','Indices','SPX, NAS, DJI, DAX','BarChart3','#10B981',40),
  ('stocks','Stocks','Equities & earnings','TrendingUp','#8B5CF6',50),
  ('futures','Futures','ES, NQ, CL, GC','Activity','#EF4444',60),
  ('options','Options','Strategies & flow','SlidersHorizontal','#EC4899',70),
  ('price-action','Price Action','Naked charts & structure','LineChart','#22D3EE',80),
  ('smc','SMC','Smart money concepts','GitBranch','#0EA5E9',90),
  ('ict','ICT','Inner circle concepts','Layers','#6366F1',100),
  ('scalping','Scalping','Intraday & scalps','Zap','#F97316',110),
  ('swing','Swing Trading','Multi-day setups','Wind','#14B8A6',120),
  ('psychology','Psychology','Mindset & discipline','Brain','#A855F7',130),
  ('risk','Risk Management','Sizing & drawdown','Shield','#DC2626',140),
  ('prop-firms','Prop Firms','Challenges & funded','Building','#059669',150),
  ('battle-arena','Battle Arena','Battle discussions','Swords','#7C3AED',160),
  ('championship','Monthly Championship','Season leaderboards','Trophy','#F59E0B',170),
  ('education','Education','Guides & tutorials','GraduationCap','#0891B2',180)
ON CONFLICT (slug) DO NOTHING;

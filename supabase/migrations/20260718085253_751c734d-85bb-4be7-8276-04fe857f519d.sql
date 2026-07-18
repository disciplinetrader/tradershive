
DO $$ BEGIN
  CREATE TYPE public.share_source_type AS ENUM (
    'trading_workspace','journal','battle','championship','replay',
    'strategy','statistics','ai_review','achievement','challenge','profile','custom'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.share_event_type AS ENUM ('created','viewed','clicked','liked','bookmarked','reshared','removed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Main share record
CREATE TABLE IF NOT EXISTS public.shared_content (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID REFERENCES public.community_posts(id) ON DELETE CASCADE,
  source_type public.share_source_type NOT NULL,
  source_id UUID,
  source_ref TEXT, -- non-uuid ref (e.g. period key like "2025-11")
  title TEXT,
  summary TEXT,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  cover_url TEXT,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','followers','private','draft')),
  is_removed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shared_content_user_idx    ON public.shared_content(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS shared_content_post_idx    ON public.shared_content(post_id);
CREATE INDEX IF NOT EXISTS shared_content_source_idx  ON public.shared_content(source_type, source_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_content TO authenticated;
GRANT ALL ON public.shared_content TO service_role;
ALTER TABLE public.shared_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shared_content owner all" ON public.shared_content
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "shared_content read public post" ON public.shared_content
  FOR SELECT USING (
    is_removed = false AND visibility IN ('public','followers')
    AND EXISTS (SELECT 1 FROM public.community_posts p
                WHERE p.id = post_id AND p.is_deleted = false AND p.is_published = true)
  );
CREATE POLICY "shared_content admin all" ON public.shared_content
  FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER shared_content_updated_at BEFORE UPDATE ON public.shared_content
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Assets (images, charts, pdfs)
CREATE TABLE IF NOT EXISTS public.shared_content_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content_id UUID NOT NULL REFERENCES public.shared_content(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('image','chart','pdf','video','link')),
  url TEXT NOT NULL,
  caption TEXT,
  width INTEGER,
  height INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shared_content_assets_content_idx ON public.shared_content_assets(content_id, sort_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_content_assets TO authenticated;
GRANT ALL ON public.shared_content_assets TO service_role;
ALTER TABLE public.shared_content_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assets owner all" ON public.shared_content_assets
  FOR ALL USING (EXISTS (SELECT 1 FROM public.shared_content c WHERE c.id = content_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.shared_content c WHERE c.id = content_id AND c.user_id = auth.uid()));
CREATE POLICY "assets read public" ON public.shared_content_assets
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.shared_content c
    WHERE c.id = content_id AND c.is_removed = false AND c.visibility IN ('public','followers')
  ));

-- Backlinks (a share can link to multiple things)
CREATE TABLE IF NOT EXISTS public.shared_content_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content_id UUID NOT NULL REFERENCES public.shared_content(id) ON DELETE CASCADE,
  target_type public.share_source_type NOT NULL,
  target_id UUID,
  target_ref TEXT,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shared_content_links_content_idx ON public.shared_content_links(content_id);
CREATE INDEX IF NOT EXISTS shared_content_links_target_idx  ON public.shared_content_links(target_type, target_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_content_links TO authenticated;
GRANT ALL ON public.shared_content_links TO service_role;
ALTER TABLE public.shared_content_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "links owner all" ON public.shared_content_links
  FOR ALL USING (EXISTS (SELECT 1 FROM public.shared_content c WHERE c.id = content_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.shared_content c WHERE c.id = content_id AND c.user_id = auth.uid()));
CREATE POLICY "links read public" ON public.shared_content_links
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.shared_content c
    WHERE c.id = content_id AND c.is_removed = false AND c.visibility IN ('public','followers')
  ));

-- Free-form metadata
CREATE TABLE IF NOT EXISTS public.shared_content_metadata (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content_id UUID NOT NULL REFERENCES public.shared_content(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (content_id, key)
);
CREATE INDEX IF NOT EXISTS shared_content_metadata_content_idx ON public.shared_content_metadata(content_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_content_metadata TO authenticated;
GRANT ALL ON public.shared_content_metadata TO service_role;
ALTER TABLE public.shared_content_metadata ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meta owner all" ON public.shared_content_metadata
  FOR ALL USING (EXISTS (SELECT 1 FROM public.shared_content c WHERE c.id = content_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.shared_content c WHERE c.id = content_id AND c.user_id = auth.uid()));
CREATE POLICY "meta read public" ON public.shared_content_metadata
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.shared_content c
    WHERE c.id = content_id AND c.is_removed = false AND c.visibility IN ('public','followers')
  ));

-- Analytics
CREATE TABLE IF NOT EXISTS public.share_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content_id UUID REFERENCES public.shared_content(id) ON DELETE CASCADE,
  post_id UUID REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type public.share_event_type NOT NULL,
  source_type public.share_source_type,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS share_events_content_idx ON public.share_events(content_id, created_at DESC);
CREATE INDEX IF NOT EXISTS share_events_user_idx    ON public.share_events(user_id, created_at DESC);
GRANT SELECT, INSERT ON public.share_events TO authenticated;
GRANT ALL ON public.share_events TO service_role;
ALTER TABLE public.share_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "share_events insert self" ON public.share_events
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "share_events read own" ON public.share_events
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "share_events read owner-of-content" ON public.share_events
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.shared_content c WHERE c.id = content_id AND c.user_id = auth.uid()));
CREATE POLICY "share_events admin all" ON public.share_events
  FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.shared_content;
ALTER PUBLICATION supabase_realtime ADD TABLE public.share_events;

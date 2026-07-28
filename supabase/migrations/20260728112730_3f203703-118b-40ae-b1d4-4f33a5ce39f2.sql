
-- ============ email_preferences ============
CREATE TABLE public.email_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  master_enabled BOOLEAN NOT NULL DEFAULT true,
  welcome_series BOOLEAN NOT NULL DEFAULT true,
  weekly_report BOOLEAN NOT NULL DEFAULT true,
  monthly_report BOOLEAN NOT NULL DEFAULT true,
  achievements BOOLEAN NOT NULL DEFAULT true,
  product_updates BOOLEAN NOT NULL DEFAULT true,
  reengagement BOOLEAN NOT NULL DEFAULT true,
  marketing BOOLEAN NOT NULL DEFAULT false,
  billing BOOLEAN NOT NULL DEFAULT true,
  unsubscribe_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex') UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.email_preferences TO authenticated;
GRANT ALL ON public.email_preferences TO service_role;
ALTER TABLE public.email_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own email prefs read"   ON public.email_preferences FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own email prefs insert" ON public.email_preferences FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own email prefs update" ON public.email_preferences FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_email_prefs_touch BEFORE UPDATE ON public.email_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ email_queue ============
CREATE TABLE public.email_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  to_email TEXT NOT NULL,
  category TEXT NOT NULL,           -- transactional | product | engagement | marketing | billing | security
  template TEXT NOT NULL,
  subject TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | processing | sent | failed | cancelled | skipped
  priority SMALLINT NOT NULL DEFAULT 5,
  attempts SMALLINT NOT NULL DEFAULT 0,
  max_attempts SMALLINT NOT NULL DEFAULT 5,
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  last_error TEXT,
  dedupe_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX email_queue_status_sched_idx ON public.email_queue(status, scheduled_for) WHERE status IN ('pending','processing');
CREATE INDEX email_queue_user_idx ON public.email_queue(user_id);
GRANT ALL ON public.email_queue TO service_role;
ALTER TABLE public.email_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "queue admin read" ON public.email_queue FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));
CREATE TRIGGER trg_email_queue_touch BEFORE UPDATE ON public.email_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ email_events ============
CREATE TABLE public.email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id UUID REFERENCES public.email_queue(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  to_email TEXT NOT NULL,
  category TEXT NOT NULL,
  template TEXT NOT NULL,
  subject TEXT,
  status TEXT NOT NULL,             -- queued | sent | delivered | opened | clicked | bounced | complained | failed | skipped | suppressed
  provider TEXT NOT NULL DEFAULT 'console',
  provider_message_id TEXT,
  error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX email_events_user_created_idx ON public.email_events(user_id, created_at DESC);
CREATE INDEX email_events_status_idx ON public.email_events(status, created_at DESC);
CREATE INDEX email_events_template_idx ON public.email_events(template, created_at DESC);
GRANT ALL ON public.email_events TO service_role;
GRANT SELECT ON public.email_events TO authenticated;
ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events own read"   ON public.email_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "events admin read" ON public.email_events FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

-- ============ email_suppressions ============
CREATE TABLE public.email_suppressions (
  email TEXT PRIMARY KEY,
  reason TEXT NOT NULL,             -- bounce | complaint | unsubscribe | manual
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.email_suppressions TO service_role;
ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "suppr admin read" ON public.email_suppressions FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

-- ============ Auto-seed preferences on new user ============
CREATE OR REPLACE FUNCTION public.seed_email_preferences() RETURNS TRIGGER
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.email_preferences(user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_seed_email_prefs ON public.profiles;
CREATE TRIGGER trg_seed_email_prefs AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.seed_email_preferences();

-- Backfill existing users
INSERT INTO public.email_preferences(user_id)
SELECT id FROM public.profiles ON CONFLICT DO NOTHING;

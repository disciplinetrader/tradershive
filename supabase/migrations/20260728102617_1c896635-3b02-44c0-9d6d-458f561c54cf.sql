
-- ============ 1. Support tables ============
CREATE TABLE IF NOT EXISTS public.bug_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','triaged','in_progress','resolved','closed','duplicate')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  url TEXT,
  browser TEXT,
  device TEXT,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  internal_notes TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bug_reports TO authenticated;
GRANT ALL ON public.bug_reports TO service_role;
ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bug_reports_owner_select" ON public.bug_reports FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "bug_reports_owner_insert" ON public.bug_reports FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "bug_reports_admin_select" ON public.bug_reports FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'support:manage'));
CREATE POLICY "bug_reports_admin_update" ON public.bug_reports FOR UPDATE TO authenticated USING (public.has_permission(auth.uid(), 'support:manage')) WITH CHECK (public.has_permission(auth.uid(), 'support:manage'));
CREATE POLICY "bug_reports_admin_delete" ON public.bug_reports FOR DELETE TO authenticated USING (public.has_permission(auth.uid(), 'support:manage'));
CREATE INDEX idx_bug_reports_status ON public.bug_reports(status, created_at DESC);
CREATE INDEX idx_bug_reports_assignee ON public.bug_reports(assignee_id) WHERE assignee_id IS NOT NULL;
CREATE TRIGGER trg_bug_reports_updated BEFORE UPDATE ON public.bug_reports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.feature_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','considering','planned','in_progress','shipped','declined')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  vote_count INTEGER NOT NULL DEFAULT 0,
  assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  internal_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feature_requests TO authenticated;
GRANT ALL ON public.feature_requests TO service_role;
ALTER TABLE public.feature_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feature_requests_public_read" ON public.feature_requests FOR SELECT TO authenticated USING (status <> 'declined' OR user_id = auth.uid() OR public.has_permission(auth.uid(),'support:manage'));
CREATE POLICY "feature_requests_owner_insert" ON public.feature_requests FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "feature_requests_admin_update" ON public.feature_requests FOR UPDATE TO authenticated USING (public.has_permission(auth.uid(),'support:manage')) WITH CHECK (public.has_permission(auth.uid(),'support:manage'));
CREATE POLICY "feature_requests_admin_delete" ON public.feature_requests FOR DELETE TO authenticated USING (public.has_permission(auth.uid(),'support:manage'));
CREATE INDEX idx_feature_requests_status ON public.feature_requests(status, vote_count DESC);
CREATE TRIGGER trg_feature_requests_updated BEFORE UPDATE ON public.feature_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','open','replied','resolved','spam')),
  assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_address INET,
  user_agent TEXT,
  internal_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_messages TO authenticated;
GRANT INSERT ON public.contact_messages TO anon;
GRANT ALL ON public.contact_messages TO service_role;
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contact_messages_anon_insert" ON public.contact_messages FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "contact_messages_auth_insert" ON public.contact_messages FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "contact_messages_admin_select" ON public.contact_messages FOR SELECT TO authenticated USING (public.has_permission(auth.uid(),'support:manage'));
CREATE POLICY "contact_messages_admin_update" ON public.contact_messages FOR UPDATE TO authenticated USING (public.has_permission(auth.uid(),'support:manage')) WITH CHECK (public.has_permission(auth.uid(),'support:manage'));
CREATE POLICY "contact_messages_admin_delete" ON public.contact_messages FOR DELETE TO authenticated USING (public.has_permission(auth.uid(),'support:manage'));
CREATE INDEX idx_contact_messages_status ON public.contact_messages(status, created_at DESC);
CREATE TRIGGER trg_contact_messages_updated BEFORE UPDATE ON public.contact_messages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.user_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  category TEXT,
  feedback TEXT NOT NULL,
  page_url TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewed','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.user_feedback TO authenticated;
GRANT UPDATE, DELETE ON public.user_feedback TO service_role;
GRANT ALL ON public.user_feedback TO service_role;
ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_feedback_owner_insert" ON public.user_feedback FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "user_feedback_owner_select" ON public.user_feedback FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "user_feedback_admin_select" ON public.user_feedback FOR SELECT TO authenticated USING (public.has_permission(auth.uid(),'support:manage'));
CREATE POLICY "user_feedback_admin_update" ON public.user_feedback FOR UPDATE TO authenticated USING (public.has_permission(auth.uid(),'support:manage')) WITH CHECK (public.has_permission(auth.uid(),'support:manage'));

-- ============ 2. Admin notifications ============
CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','error','critical')),
  title TEXT NOT NULL,
  message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT,
  read_by UUID[] NOT NULL DEFAULT '{}',
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.admin_notifications TO authenticated;
GRANT ALL ON public.admin_notifications TO service_role;
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_notifications_admin_select" ON public.admin_notifications FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));
CREATE POLICY "admin_notifications_admin_update" ON public.admin_notifications FOR UPDATE TO authenticated USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE INDEX idx_admin_notifications_recent ON public.admin_notifications(created_at DESC) WHERE dismissed_at IS NULL;

CREATE OR REPLACE FUNCTION public.trg_admin_audit_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.action ILIKE '%delete%' OR NEW.action ILIKE '%ban%' OR NEW.action ILIKE '%role%' THEN
    INSERT INTO public.admin_notifications(kind, severity, title, message, metadata, source)
    VALUES (
      'audit_event',
      CASE WHEN NEW.action ILIKE '%delete%' OR NEW.action ILIKE '%ban%' THEN 'warning' ELSE 'info' END,
      'Admin action: ' || NEW.action,
      COALESCE(NEW.target_type, '') || ' ' || COALESCE(NEW.target_id::text, ''),
      COALESCE(NEW.metadata, '{}'::jsonb),
      'admin_audit_logs'
    );
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_audit_admin_notify ON public.admin_audit_logs;
CREATE TRIGGER trg_audit_admin_notify AFTER INSERT ON public.admin_audit_logs FOR EACH ROW EXECUTE FUNCTION public.trg_admin_audit_notify();

-- ============ 3. Subscription scaffolding (Stripe-shaped, unused for now) ============
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  interval TEXT NOT NULL DEFAULT 'month' CHECK (interval IN ('month','year','lifetime')),
  trial_days INTEGER NOT NULL DEFAULT 0,
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  stripe_price_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscription_plans TO authenticated, anon;
GRANT ALL ON public.subscription_plans TO service_role;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans_public_read" ON public.subscription_plans FOR SELECT USING (is_active = true);
CREATE POLICY "plans_admin_write" ON public.subscription_plans FOR ALL TO authenticated USING (public.has_permission(auth.uid(),'settings:manage')) WITH CHECK (public.has_permission(auth.uid(),'settings:manage'));
CREATE TRIGGER trg_plans_updated BEFORE UPDATE ON public.subscription_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'trialing' CHECK (status IN ('trialing','active','past_due','canceled','expired','paused','lifetime')),
  trial_end TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_subscriptions TO authenticated;
GRANT ALL ON public.user_subscriptions TO service_role;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_subs_owner_read" ON public.user_subscriptions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "user_subs_admin_all" ON public.user_subscriptions FOR ALL TO authenticated USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE UNIQUE INDEX idx_user_subs_active_one ON public.user_subscriptions(user_id) WHERE status IN ('trialing','active','past_due','paused','lifetime');
CREATE INDEX idx_user_subs_status ON public.user_subscriptions(status, current_period_end);
CREATE TRIGGER trg_user_subs_updated BEFORE UPDATE ON public.user_subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  subscription_id UUID REFERENCES public.user_subscriptions(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  amount_cents INTEGER,
  currency TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  stripe_event_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscription_events TO authenticated;
GRANT ALL ON public.subscription_events TO service_role;
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sub_events_owner_read" ON public.subscription_events FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "sub_events_admin_read" ON public.subscription_events FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));
CREATE INDEX idx_sub_events_user_time ON public.subscription_events(user_id, created_at DESC);

-- ============ 4. Security events ============
CREATE TABLE IF NOT EXISTS public.admin_security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','error','critical')),
  ip_address INET,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.admin_security_events TO authenticated;
GRANT ALL ON public.admin_security_events TO service_role;
ALTER TABLE public.admin_security_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sec_events_admin_read" ON public.admin_security_events FOR SELECT TO authenticated USING (public.has_permission(auth.uid(),'logs:view'));
CREATE POLICY "sec_events_self_insert" ON public.admin_security_events FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE INDEX idx_sec_events_recent ON public.admin_security_events(created_at DESC);
CREATE INDEX idx_sec_events_kind ON public.admin_security_events(kind, created_at DESC);

-- ============ 5. Admin saved table views ============
CREATE TABLE IF NOT EXISTS public.admin_saved_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  name TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, scope, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_saved_views TO authenticated;
GRANT ALL ON public.admin_saved_views TO service_role;
ALTER TABLE public.admin_saved_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "saved_views_owner_all" ON public.admin_saved_views FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER trg_saved_views_updated BEFORE UPDATE ON public.admin_saved_views FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ 6. Extra permissions ============
INSERT INTO public.admin_permissions(key, label, group_name, description) VALUES
  ('revenue:view','View revenue','Billing','Read revenue KPIs and Stripe events'),
  ('security:view','View security events','Security','Read security event log'),
  ('database:view','View database insights','System','Read table sizes, slow queries, index usage'),
  ('subscriptions:view','View subscriptions','Billing','Read user subscriptions'),
  ('subscriptions:manage','Manage subscriptions','Billing','Grant/extend/cancel subscriptions'),
  ('ai:read_conversations','Read AI conversations','AI','Read AI chat sessions and messages'),
  ('ai:manage','Manage AI system','AI','Manage AI cache, retries, kill switch'),
  ('ai:view_usage','View AI usage','AI','Read AI usage aggregates'),
  ('settings:manage','Manage settings','System','Edit system settings'),
  ('roles:manage','Manage roles','People','Grant and revoke platform roles')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('super_admin','dashboard:view'),
  ('super_admin','users:view'),('super_admin','users:edit'),('super_admin','users:suspend'),('super_admin','users:delete'),('super_admin','users:reset'),('super_admin','users:grant'),('super_admin','users:role'),
  ('super_admin','trades:view'),('super_admin','trades:manage'),
  ('super_admin','journal:view'),('super_admin','journal:manage'),
  ('super_admin','challenges:view'),('super_admin','challenges:manage'),
  ('super_admin','achievements:view'),('super_admin','achievements:manage'),
  ('super_admin','leaderboard:manage'),
  ('super_admin','reports:view'),
  ('super_admin','content:manage'),('super_admin','announcements:manage'),
  ('super_admin','settings:view'),('super_admin','settings:manage'),
  ('super_admin','logs:view'),
  ('super_admin','storage:view'),('super_admin','storage:manage'),
  ('super_admin','roles:manage'),('super_admin','flags:manage'),
  ('super_admin','notifications:manage'),('super_admin','support:manage'),
  ('super_admin','revenue:view'),('super_admin','security:view'),('super_admin','database:view'),
  ('super_admin','subscriptions:view'),('super_admin','subscriptions:manage'),
  ('super_admin','ai:read_conversations'),('super_admin','ai:manage'),
  ('admin','revenue:view'),('admin','security:view'),('admin','database:view'),
  ('admin','subscriptions:view'),('admin','subscriptions:manage'),
  ('admin','ai:read_conversations'),('admin','ai:manage'),
  ('admin','settings:manage'),
  ('analyst','revenue:view'),('analyst','subscriptions:view'),('analyst','ai:view_usage'),
  ('developer','database:view'),('developer','flags:manage'),
  ('support','support:manage'),('support','users:edit'),('support','subscriptions:view'),
  ('moderator','security:view')
ON CONFLICT DO NOTHING;

-- ============ 7. Helper RPCs ============
CREATE OR REPLACE FUNCTION public.admin_growth_series(_days INTEGER DEFAULT 30)
RETURNS TABLE(day DATE, new_users BIGINT, active_users BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN QUERY
  WITH days AS (
    SELECT generate_series(
      (CURRENT_DATE - (_days - 1))::date,
      CURRENT_DATE::date,
      '1 day'::interval
    )::date AS d
  )
  SELECT
    d AS day,
    COALESCE((SELECT COUNT(*) FROM public.profiles p WHERE p.created_at::date = d), 0) AS new_users,
    COALESCE((SELECT COUNT(DISTINCT p.id) FROM public.profiles p WHERE p.updated_at::date = d), 0) AS active_users
  FROM days
  ORDER BY d;
END $$;
REVOKE ALL ON FUNCTION public.admin_growth_series(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_growth_series(INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_ai_usage_series(_days INTEGER DEFAULT 14)
RETURNS TABLE(day DATE, requests BIGINT, tokens BIGINT, cost_cents BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN QUERY
  WITH days AS (
    SELECT generate_series(
      (CURRENT_DATE - (_days - 1))::date,
      CURRENT_DATE::date,
      '1 day'::interval
    )::date AS d
  )
  SELECT
    d AS day,
    COALESCE((SELECT COUNT(*) FROM public.ai_usage_logs l WHERE l.created_at::date = d), 0) AS requests,
    COALESCE((SELECT SUM(COALESCE(l.total_tokens,0))::BIGINT FROM public.ai_usage_logs l WHERE l.created_at::date = d), 0) AS tokens,
    COALESCE((SELECT SUM(COALESCE((l.cost_usd*100)::bigint,0)) FROM public.ai_usage_logs l WHERE l.created_at::date = d), 0) AS cost_cents
  FROM days
  ORDER BY d;
END $$;
REVOKE ALL ON FUNCTION public.admin_ai_usage_series(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_ai_usage_series(INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_table_sizes()
RETURNS TABLE(table_name TEXT, row_estimate BIGINT, total_bytes BIGINT, total_pretty TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN QUERY
  SELECT
    c.relname::TEXT,
    c.reltuples::BIGINT,
    pg_total_relation_size(c.oid)::BIGINT,
    pg_size_pretty(pg_total_relation_size(c.oid))::TEXT
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
  ORDER BY pg_total_relation_size(c.oid) DESC
  LIMIT 200;
END $$;
REVOKE ALL ON FUNCTION public.admin_table_sizes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_table_sizes() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_dashboard_kpis()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  today_start TIMESTAMPTZ := date_trunc('day', now());
  month_start TIMESTAMPTZ := date_trunc('month', now());
  result JSONB;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  SELECT jsonb_build_object(
    'total_users',           (SELECT COUNT(*) FROM public.profiles WHERE deleted_at IS NULL),
    'active_today',          (SELECT COUNT(DISTINCT id) FROM public.profiles WHERE updated_at >= today_start),
    'mau',                   (SELECT COUNT(DISTINCT id) FROM public.profiles WHERE updated_at >= now() - INTERVAL '30 days'),
    'new_today',             (SELECT COUNT(*) FROM public.profiles WHERE created_at >= today_start),
    'new_this_month',        (SELECT COUNT(*) FROM public.profiles WHERE created_at >= month_start),
    'premium_users',         (SELECT COUNT(*) FROM public.profiles WHERE is_premium = true),
    'active_subs',           (SELECT COUNT(*) FROM public.user_subscriptions WHERE status IN ('active','trialing','lifetime')),
    'trial_subs',            (SELECT COUNT(*) FROM public.user_subscriptions WHERE status = 'trialing'),
    'total_replays',         (SELECT COUNT(*) FROM public.replay_sessions),
    'total_trades',          (SELECT COUNT(*) FROM public.paper_trades),
    'ai_requests_today',     (SELECT COUNT(*) FROM public.ai_usage_logs WHERE created_at >= today_start),
    'ai_tokens_today',       COALESCE((SELECT SUM(total_tokens) FROM public.ai_usage_logs WHERE created_at >= today_start), 0),
    'open_tickets',          (SELECT COUNT(*) FROM public.support_tickets WHERE status = 'open'),
    'open_bugs',             (SELECT COUNT(*) FROM public.bug_reports WHERE status IN ('open','triaged','in_progress')),
    'unread_notifications',  (SELECT COUNT(*) FROM public.admin_notifications WHERE dismissed_at IS NULL AND NOT (auth.uid() = ANY(read_by))),
    'error_events_24h',      (SELECT COUNT(*) FROM public.admin_security_events WHERE severity IN ('error','critical') AND created_at >= now() - INTERVAL '24 hours')
  ) INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_dashboard_kpis() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_kpis() TO authenticated;

-- ============ 8. Seed subscription plans (informational only) ============
INSERT INTO public.subscription_plans(code, name, description, price_cents, interval, trial_days, features, sort_order) VALUES
  ('free','Free','Core paper trading and journaling', 0, 'month', 0, '{"paper":true,"journal":true,"ai_requests_per_day":10}'::jsonb, 0),
  ('pro_monthly','Pro Monthly','Full platform with AI Coach', 1900, 'month', 7, '{"paper":true,"journal":true,"replay":true,"ai":true,"community":true}'::jsonb, 1),
  ('pro_yearly','Pro Yearly','Full platform - annual', 19000, 'year', 7, '{"paper":true,"journal":true,"replay":true,"ai":true,"community":true}'::jsonb, 2),
  ('lifetime','Lifetime','One-time lifetime access', 49900, 'lifetime', 0, '{"paper":true,"journal":true,"replay":true,"ai":true,"community":true,"lifetime":true}'::jsonb, 3)
ON CONFLICT (code) DO NOTHING;


-- Soft delete columns
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS admin_notes TEXT;
ALTER TABLE public.paper_trades ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS moderation_status TEXT DEFAULT 'ok';

-- User moderation
CREATE TABLE IF NOT EXISTS public.user_moderation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('active','suspended','banned')),
  reason TEXT,
  until TIMESTAMPTZ,
  moderator_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_moderation_user ON public.user_moderation(user_id);
GRANT SELECT ON public.user_moderation TO authenticated;
GRANT ALL ON public.user_moderation TO service_role;
ALTER TABLE public.user_moderation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own moderation" ON public.user_moderation
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'moderator'));

-- Permission catalog
CREATE TABLE IF NOT EXISTS public.admin_permissions (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  group_name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_permissions TO authenticated;
GRANT ALL ON public.admin_permissions TO service_role;
ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in reads permissions catalog" ON public.admin_permissions FOR SELECT USING (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role public.app_role NOT NULL,
  permission_key TEXT NOT NULL REFERENCES public.admin_permissions(key) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(role, permission_key)
);
GRANT SELECT ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in reads role permissions" ON public.role_permissions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Super admin manages role permissions" ON public.role_permissions
  FOR ALL USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE OR REPLACE FUNCTION public.has_permission(_user_id UUID, _permission TEXT)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role = ur.role
    WHERE ur.user_id = _user_id AND rp.permission_key = _permission
  ) OR public.has_role(_user_id, 'super_admin')
$$;
REVOKE EXECUTE ON FUNCTION public.has_permission(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(UUID, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('super_admin','admin','moderator','support','content_manager','developer','analyst')
  )
$$;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(UUID) TO authenticated, service_role;

-- Audit logs
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  resource_id TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_admin ON public.admin_audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON public.admin_audit_logs(resource, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.admin_audit_logs(created_at DESC);
GRANT SELECT ON public.admin_audit_logs TO authenticated;
GRANT ALL ON public.admin_audit_logs TO service_role;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read audit logs" ON public.admin_audit_logs FOR SELECT USING (public.is_platform_admin(auth.uid()));

-- Feature flags
CREATE TABLE IF NOT EXISTS public.feature_flags (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT false,
  rollout_percent INTEGER NOT NULL DEFAULT 100 CHECK (rollout_percent BETWEEN 0 AND 100),
  audience JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.feature_flags TO authenticated, anon;
GRANT ALL ON public.feature_flags TO service_role;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public reads feature flags" ON public.feature_flags FOR SELECT USING (true);
CREATE POLICY "Admin manages feature flags" ON public.feature_flags
  FOR ALL USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'developer'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'developer'));

-- Announcements
CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('banner','popup','notification','news','maintenance','release')),
  title TEXT NOT NULL,
  body TEXT,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','success','warning','critical')),
  cta_label TEXT,
  cta_url TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  published BOOLEAN NOT NULL DEFAULT false,
  audience JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read live announcements" ON public.announcements FOR SELECT
  USING (published = true OR public.is_platform_admin(auth.uid()));
CREATE POLICY "Admin manages announcements" ON public.announcements
  FOR ALL USING (public.has_permission(auth.uid(),'announcements:manage'))
  WITH CHECK (public.has_permission(auth.uid(),'announcements:manage'));

-- System settings
CREATE TABLE IF NOT EXISTS public.system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  label TEXT,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.system_settings TO authenticated;
GRANT ALL ON public.system_settings TO service_role;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in reads settings" ON public.system_settings FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Super admin manages settings" ON public.system_settings
  FOR ALL USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE TABLE IF NOT EXISTS public.system_settings_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  previous_value JSONB,
  new_value JSONB NOT NULL,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_settings_history_key ON public.system_settings_history(key, created_at DESC);
GRANT SELECT ON public.system_settings_history TO authenticated;
GRANT ALL ON public.system_settings_history TO service_role;
ALTER TABLE public.system_settings_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin reads settings history" ON public.system_settings_history FOR SELECT USING (public.is_platform_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.snapshot_system_setting() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.system_settings_history (key, previous_value, new_value, changed_by)
  VALUES (NEW.key, CASE WHEN TG_OP='UPDATE' THEN OLD.value ELSE NULL END, NEW.value, NEW.updated_by);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_snapshot_setting ON public.system_settings;
CREATE TRIGGER trg_snapshot_setting AFTER INSERT OR UPDATE OF value ON public.system_settings
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_system_setting();

-- Maintenance windows
CREATE TABLE IF NOT EXISTS public.maintenance_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.maintenance_windows TO authenticated, anon;
GRANT ALL ON public.maintenance_windows TO service_role;
ALTER TABLE public.maintenance_windows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public reads maintenance" ON public.maintenance_windows FOR SELECT USING (true);
CREATE POLICY "Admin manages maintenance" ON public.maintenance_windows
  FOR ALL USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'developer'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'developer'));

-- CMS
CREATE TABLE IF NOT EXISTS public.content_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  body TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('faq','help','terms','privacy','tutorial','guide','banner','feature')),
  published BOOLEAN NOT NULL DEFAULT false,
  version INTEGER NOT NULL DEFAULT 1,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.content_pages TO authenticated, anon;
GRANT ALL ON public.content_pages TO service_role;
ALTER TABLE public.content_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public reads published pages" ON public.content_pages
  FOR SELECT USING (published = true OR public.is_platform_admin(auth.uid()));
CREATE POLICY "Content manager writes pages" ON public.content_pages
  FOR ALL USING (public.has_permission(auth.uid(),'content:manage'))
  WITH CHECK (public.has_permission(auth.uid(),'content:manage'));

-- Notification campaigns
CREATE TABLE IF NOT EXISTS public.notification_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT,
  channel TEXT NOT NULL CHECK (channel IN ('in_app','push','email')),
  audience JSONB NOT NULL DEFAULT '{}'::jsonb,
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','sending','sent','cancelled')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.notification_campaigns TO authenticated;
GRANT ALL ON public.notification_campaigns TO service_role;
ALTER TABLE public.notification_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin reads campaigns" ON public.notification_campaigns FOR SELECT USING (public.is_platform_admin(auth.uid()));
CREATE POLICY "Admin manages campaigns" ON public.notification_campaigns
  FOR ALL USING (public.has_permission(auth.uid(),'notifications:manage'))
  WITH CHECK (public.has_permission(auth.uid(),'notifications:manage'));

CREATE TABLE IF NOT EXISTS public.notification_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.notification_campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_recipients_user ON public.notification_recipients(user_id, read_at);
GRANT SELECT, UPDATE ON public.notification_recipients TO authenticated;
GRANT ALL ON public.notification_recipients TO service_role;
ALTER TABLE public.notification_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User reads own recipient rows" ON public.notification_recipients
  FOR SELECT USING (auth.uid() = user_id OR public.is_platform_admin(auth.uid()));
CREATE POLICY "User marks own read" ON public.notification_recipients
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Support tickets
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','resolved','closed')),
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.support_tickets(status, created_at DESC);
GRANT SELECT, INSERT ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User reads own tickets" ON public.support_tickets FOR SELECT
  USING (auth.uid() = user_id OR public.is_platform_admin(auth.uid()));
CREATE POLICY "User creates own tickets" ON public.support_tickets FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Support manages tickets" ON public.support_tickets FOR UPDATE
  USING (public.has_permission(auth.uid(),'support:manage')) WITH CHECK (public.has_permission(auth.uid(),'support:manage'));

-- Reports
CREATE TABLE IF NOT EXISTS public.system_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  row_count INTEGER,
  generated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  file_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.system_reports TO authenticated;
GRANT ALL ON public.system_reports TO service_role;
ALTER TABLE public.system_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin reads reports" ON public.system_reports FOR SELECT USING (public.is_platform_admin(auth.uid()));
CREATE POLICY "Admin creates reports" ON public.system_reports FOR INSERT WITH CHECK (public.is_platform_admin(auth.uid()));

-- Seed permissions
INSERT INTO public.admin_permissions (key, label, group_name, description) VALUES
  ('dashboard:view','View admin dashboard','Dashboard','Access executive overview'),
  ('users:view','View users','Users','List and view users'),
  ('users:edit','Edit users','Users','Edit user profile fields'),
  ('users:suspend','Suspend / ban users','Users','Suspend or ban a user'),
  ('users:delete','Delete users','Users','Soft-delete or restore a user'),
  ('users:reset','Reset user data','Users','Reset XP, coins, challenges, accounts'),
  ('users:grant','Grant XP, coins, achievements','Users','Grant rewards to users'),
  ('users:role','Manage user roles','Users','Assign roles to users'),
  ('trades:view','View trades','Trading','View all paper trades'),
  ('trades:manage','Manage trades','Trading','Edit / soft delete trades'),
  ('journal:view','View journal','Journal','View all journal entries'),
  ('journal:manage','Moderate journal','Journal','Hide, restore or delete entries'),
  ('challenges:view','View challenges','Challenges','View challenge catalog'),
  ('challenges:manage','Manage challenges','Challenges','Create, edit, delete challenges'),
  ('achievements:view','View achievements','Achievements','View catalog'),
  ('achievements:manage','Manage achievements','Achievements','Create, edit, delete achievements'),
  ('leaderboard:manage','Manage leaderboards','Leaderboards','Reset seasons, promote / demote'),
  ('reports:view','View reports','Reports','Generate and view reports'),
  ('content:manage','Manage content','Content','Create and edit CMS pages'),
  ('announcements:manage','Manage announcements','Content','Publish announcements'),
  ('settings:view','View system settings','System','View system settings'),
  ('settings:manage','Manage system settings','System','Edit system settings'),
  ('logs:view','View audit logs','System','View admin audit trail'),
  ('storage:view','View storage','System','Browse storage buckets'),
  ('storage:manage','Manage storage','System','Delete stored files'),
  ('roles:manage','Manage roles & permissions','System','Assign permissions to roles'),
  ('flags:manage','Manage feature flags','System','Toggle feature flags'),
  ('notifications:manage','Send notifications','Notifications','Send bulk notifications'),
  ('support:manage','Manage support tickets','Support','Reply and resolve tickets')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key)
SELECT 'admin'::public.app_role, key FROM public.admin_permissions
  WHERE key NOT IN ('roles:manage','settings:manage')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('moderator','dashboard:view'),('moderator','users:view'),('moderator','users:suspend'),
  ('moderator','journal:view'),('moderator','journal:manage'),
  ('moderator','trades:view'),('moderator','trades:manage'),
  ('moderator','logs:view'),('moderator','support:manage'),
  ('support','dashboard:view'),('support','users:view'),('support','users:edit'),
  ('support','users:reset'),('support','support:manage'),
  ('content_manager','dashboard:view'),('content_manager','content:manage'),
  ('content_manager','announcements:manage'),('content_manager','notifications:manage'),
  ('content_manager','challenges:view'),('content_manager','challenges:manage'),
  ('content_manager','achievements:view'),('content_manager','achievements:manage'),
  ('developer','dashboard:view'),('developer','flags:manage'),('developer','logs:view'),
  ('developer','storage:view'),('developer','storage:manage'),('developer','settings:view'),
  ('analyst','dashboard:view'),('analyst','users:view'),('analyst','trades:view'),
  ('analyst','journal:view'),('analyst','reports:view'),('analyst','logs:view')
ON CONFLICT DO NOTHING;

INSERT INTO public.feature_flags (key, label, description, enabled, rollout_percent) VALUES
  ('ai_coach','AI Coach','Personal AI trading coach', false, 0),
  ('guilds','Guilds','Team-based competitions', false, 0),
  ('marketplace','Marketplace','Buy & sell strategies', false, 0),
  ('battle_arena','Battle Arena','Head-to-head duels', false, 0),
  ('broker_connect','Broker Connections','Connect real broker accounts', false, 0),
  ('trading_replay','Trading Replay','Historical bar-by-bar replay', false, 0),
  ('import_trades','Import Trades','CSV / broker import', true, 100),
  ('public_profiles','Public Profiles','Public trader profiles', true, 100)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.system_settings (key, value, label) VALUES
  ('platform.name','"TradersHIVE Arena"'::jsonb,'Platform name'),
  ('platform.maintenance_mode','false'::jsonb,'Maintenance mode'),
  ('platform.registration_enabled','true'::jsonb,'Registration enabled'),
  ('platform.email_verification','true'::jsonb,'Require email verification'),
  ('platform.default_currency','"USD"'::jsonb,'Default currency'),
  ('platform.default_timezone','"UTC"'::jsonb,'Default timezone'),
  ('gamification.xp_multiplier','1'::jsonb,'XP multiplier'),
  ('gamification.coin_multiplier','1'::jsonb,'Coin multiplier'),
  ('risk.max_leverage','500'::jsonb,'Max leverage'),
  ('risk.max_risk_per_trade','5'::jsonb,'Max % risk per trade')
ON CONFLICT (key) DO NOTHING;

CREATE TRIGGER trg_user_moderation_upd BEFORE UPDATE ON public.user_moderation FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_flags_upd BEFORE UPDATE ON public.feature_flags FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ann_upd BEFORE UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_settings_upd BEFORE UPDATE ON public.system_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_content_upd BEFORE UPDATE ON public.content_pages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_camp_upd BEFORE UPDATE ON public.notification_campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_tickets_upd BEFORE UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

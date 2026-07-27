
-- 1) user_roles: super_admin only for INSERT/DELETE, and only super_admin sees all
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Super admin can insert roles" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Super admin can delete roles" ON public.user_roles
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Super admin can view all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- 2) profiles: block self-escalation on privileged columns via trigger
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  -- service_role bypasses; allow trusted server paths to modify these
  IF v_role = 'service_role' THEN
    RETURN NEW;
  END IF;
  NEW.is_premium := OLD.is_premium;
  NEW.coins := OLD.coins;
  NEW.xp := OLD.xp;
  NEW.level := OLD.level;
  NEW.league := OLD.league;
  NEW.rank := OLD.rank;
  NEW.streak := OLD.streak;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_protect_profile_privileged ON public.profiles;
CREATE TRIGGER trg_protect_profile_privileged
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileged_columns();

-- 3) provider_credentials: super_admin only
DROP POLICY IF EXISTS "pc_admin_all" ON public.provider_credentials;
CREATE POLICY "pc_super_admin_all" ON public.provider_credentials
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- 4) notification_campaigns: super_admin only
DROP POLICY IF EXISTS "Admin manages campaigns" ON public.notification_campaigns;
DROP POLICY IF EXISTS "Admin reads campaigns" ON public.notification_campaigns;
CREATE POLICY "Super admin manages campaigns" ON public.notification_campaigns
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- 5) profile_customization: default-private social handles (opt-in via profile_privacy.show_socials)
ALTER TABLE public.profile_privacy
  ADD COLUMN IF NOT EXISTS show_socials boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "Public customization view access" ON public.profile_customization;
CREATE POLICY "Public customization view access" ON public.profile_customization
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profile_privacy pp
      WHERE pp.user_id = profile_customization.user_id
        AND pp.hide_profile = false
        AND pp.show_socials = true
    )
  );

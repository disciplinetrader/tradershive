
-- 1) profiles: restrict SELECT to authenticated (removes anon email exposure)
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles viewable by authenticated"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);
REVOKE SELECT ON public.profiles FROM anon;

-- 2) profile_privacy: only owner can read
DROP POLICY IF EXISTS "Privacy readable by authenticated" ON public.profile_privacy;
CREATE POLICY "Owners read own privacy"
  ON public.profile_privacy FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 3) admin_permissions: only platform admins can read
DROP POLICY IF EXISTS "Signed-in reads permissions catalog" ON public.admin_permissions;
CREATE POLICY "Admins read permissions catalog"
  ON public.admin_permissions FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- 4) system_settings: only platform admins can read
DROP POLICY IF EXISTS "Signed-in reads settings" ON public.system_settings;
CREATE POLICY "Admins read settings"
  ON public.system_settings FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

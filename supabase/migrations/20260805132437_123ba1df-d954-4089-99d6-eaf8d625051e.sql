-- 1. Narrow, high-privilege admin check (super_admin / admin only)
CREATE OR REPLACE FUNCTION public.is_privileged_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('super_admin','admin')
  )
$$;

-- 2. community_reputation: no anonymous read
DROP POLICY IF EXISTS "reputation read" ON public.community_reputation;
CREATE POLICY "reputation read authenticated"
  ON public.community_reputation FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.community_reputation FROM anon;

-- 3. Scope high-sensitivity tables to the narrow admin set
DROP POLICY IF EXISTS "Admins read audit logs" ON public.admin_audit_logs;
CREATE POLICY "Privileged admins read audit logs"
  ON public.admin_audit_logs FOR SELECT TO authenticated
  USING (public.is_privileged_admin(auth.uid()));
REVOKE ALL ON public.admin_audit_logs FROM anon;

DROP POLICY IF EXISTS "user_subs_admin_all" ON public.user_subscriptions;
CREATE POLICY "user_subs_privileged_admin_all"
  ON public.user_subscriptions FOR ALL TO authenticated
  USING (public.is_privileged_admin(auth.uid()))
  WITH CHECK (public.is_privileged_admin(auth.uid()));
REVOKE ALL ON public.user_subscriptions FROM anon;

DROP POLICY IF EXISTS "Profiles viewable by platform admins" ON public.profiles;
CREATE POLICY "Profiles viewable by privileged admins"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.is_privileged_admin(auth.uid()));

REVOKE ALL ON public.admin_security_events FROM anon;

-- 4. provider_credentials: server-side (service_role) only; no client role reach
REVOKE ALL ON public.provider_credentials FROM anon;
REVOKE ALL ON public.provider_credentials FROM authenticated;
GRANT ALL ON public.provider_credentials TO service_role;
DROP POLICY IF EXISTS "pc_super_admin_all" ON public.provider_credentials;
CREATE POLICY "pc_super_admin_all"
  ON public.provider_credentials FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));
-- 1. Remove anonymous EXECUTE on SECURITY DEFINER admin check
REVOKE EXECUTE ON FUNCTION public.is_privileged_admin(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_privileged_admin(uuid) TO authenticated, service_role;

-- 2. community_reputation: only top-tier admins may write
DROP POLICY IF EXISTS "reputation admin write" ON public.community_reputation;
CREATE POLICY "reputation privileged admin write" ON public.community_reputation
  FOR ALL TO authenticated
  USING (public.is_privileged_admin(auth.uid()))
  WITH CHECK (public.is_privileged_admin(auth.uid()));

-- 3. provider_market_assignments: use standard privileged admin check
DROP POLICY IF EXISTS "provider_market_assignments admin writes" ON public.provider_market_assignments;
CREATE POLICY "provider_market_assignments admin writes" ON public.provider_market_assignments
  FOR ALL TO authenticated
  USING (public.is_privileged_admin(auth.uid()))
  WITH CHECK (public.is_privileged_admin(auth.uid()));

-- 4. role_permissions: restrict matrix reads to privileged admins
DROP POLICY IF EXISTS "Admins read role permissions" ON public.role_permissions;
CREATE POLICY "Privileged admins read role permissions" ON public.role_permissions
  FOR SELECT TO authenticated
  USING (public.is_privileged_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admin manages role permissions" ON public.role_permissions;
CREATE POLICY "Super admin manages role permissions" ON public.role_permissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));
-- 1. Profiles: replace overly permissive SELECT policy with owner + admin only
DROP POLICY IF EXISTS "Profiles viewable by authenticated" ON public.profiles;

CREATE POLICY "Profiles viewable by owner"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Profiles viewable by platform admins"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- 2. battle_logs: drop redundant permissive service_role INSERT policy
--    (service_role bypasses RLS entirely, so the policy adds no protection
--    while tripping the always-true linter.)
DROP POLICY IF EXISTS "battle_logs service writes" ON public.battle_logs;

-- 3. Revoke EXECUTE on SECURITY DEFINER functions that should never be
--    callable directly from the Data API. Trigger functions still fire
--    from their triggers; admin_ai_usage_series stays available to admins
--    via server-side calls with elevated context.
REVOKE EXECUTE ON FUNCTION public.trg_admin_audit_notify() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_email_preferences() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_ai_usage_series(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ai_usage_series(integer) TO service_role;

-- 1) profiles: hide email + admin_notes via column privileges
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (
  id, username, display_name, avatar_url, country, timezone,
  experience, preferred_market, trading_style, bio, level, xp, coins,
  league, rank, streak, last_active_at, created_at, updated_at,
  first_name, last_name, onboarded, is_premium, goals,
  preferred_markets, accepted_terms_at, deleted_at
) ON public.profiles TO authenticated;
GRANT SELECT (
  id, username, display_name, avatar_url, country, bio,
  level, xp, league, rank, streak
) ON public.profiles TO anon;

-- Owner reads their own full row (incl. email) via a SECURITY DEFINER RPC
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS SETOF public.profiles
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT * FROM public.profiles WHERE id = auth.uid() $$;
REVOKE ALL ON FUNCTION public.get_my_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;

-- 2) role_permissions: admins only
DROP POLICY IF EXISTS "Signed-in reads role permissions" ON public.role_permissions;
CREATE POLICY "Admins read role permissions" ON public.role_permissions
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- 3) community_tags: replace WITH CHECK(true) with authenticated-only guard
DROP POLICY IF EXISTS "tags insert auth" ON public.community_tags;
CREATE POLICY "tags insert auth" ON public.community_tags
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- 4) Revoke EXECUTE on internal SECURITY DEFINER functions from anon/authenticated.
DO $$
DECLARE
  r RECORD;
  keep TEXT[] := ARRAY[
    'has_role','has_permission','is_platform_admin',
    'is_battle_host','is_battle_participant',
    'join_battle','join_battle_by_code',
    'register_for_championship','cancel_championship_registration',
    'get_my_profile'
  ];
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef
  LOOP
    IF NOT (r.proname = ANY(keep)) THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
                     r.proname, r.args);
    END IF;
  END LOOP;
END $$;


-- 1) Profiles: hide email + admin_notes from other authenticated users via column privileges.
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (
  id, username, display_name, avatar_url, country, timezone,
  experience, preferred_market, trading_style, bio,
  level, xp, coins, league, rank, streak, last_active_at,
  created_at, updated_at, first_name, last_name, onboarded,
  is_premium, goals, preferred_markets, accepted_terms_at, deleted_at
) ON public.profiles TO authenticated;
-- owner-only columns are readable through public.get_my_profile() (SECURITY DEFINER).
-- Preserve write paths (RLS still restricts by auth.uid()).
GRANT INSERT, UPDATE, DELETE ON public.profiles TO authenticated;

-- 2) Reputation events: users can only insert their own rows.
DROP POLICY IF EXISTS "rep events insert" ON public.reputation_events;
CREATE POLICY "rep events insert"
  ON public.reputation_events
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 3) SECURITY DEFINER functions: revoke public/anon EXECUTE.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;
END $$;

-- Grant EXECUTE to authenticated only for user-callable RPC helpers.
GRANT EXECUTE ON FUNCTION
  public.has_role(uuid, public.app_role),
  public.has_permission(uuid, text),
  public.is_platform_admin(uuid),
  public.get_my_profile(),
  public.join_championship_live(uuid),
  public.join_battle(uuid),
  public.join_battle_by_code(text),
  public.cancel_championship_registration(uuid),
  public.register_for_championship(uuid),
  public.bump_ai_rate_limit(uuid, text, timestamptz, integer)
TO authenticated;

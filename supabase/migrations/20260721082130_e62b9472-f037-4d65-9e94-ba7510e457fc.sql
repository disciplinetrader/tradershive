
-- Restrict sensitive profile columns from being readable by all authenticated users.
-- Revoke column-level SELECT on email and admin_notes from authenticated/anon.
REVOKE SELECT (email, admin_notes) ON public.profiles FROM authenticated;
REVOKE SELECT (email, admin_notes) ON public.profiles FROM anon;

-- Re-grant SELECT on all non-sensitive columns to authenticated so existing reads keep working.
GRANT SELECT (
  id, username, display_name, avatar_url, country, timezone,
  experience, preferred_market, trading_style, bio, level, xp, coins,
  league, rank, streak, last_active_at, created_at, updated_at,
  first_name, last_name, onboarded, is_premium, goals, preferred_markets,
  accepted_terms_at, deleted_at
) ON public.profiles TO authenticated;

-- Service role retains full access (used by admin server code).
GRANT ALL ON public.profiles TO service_role;

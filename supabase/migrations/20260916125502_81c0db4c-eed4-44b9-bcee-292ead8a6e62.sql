
DROP POLICY IF EXISTS "Follows readable by authenticated" ON public.social_follows;

CREATE POLICY "Follows readable to the people involved"
ON public.social_follows FOR SELECT TO authenticated
USING (auth.uid() = follower_id OR auth.uid() = following_id);

CREATE OR REPLACE FUNCTION public.social_follow_counts(_user uuid)
RETURNS TABLE(followers integer, following integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT count(*)::int FROM public.social_follows WHERE following_id = _user),
    (SELECT count(*)::int FROM public.social_follows WHERE follower_id = _user);
$$;

GRANT EXECUTE ON FUNCTION public.social_follow_counts(uuid) TO authenticated;

DROP POLICY IF EXISTS "assignments readable to authenticated" ON public.provider_market_assignments;

CREATE POLICY "assignments readable to admins"
ON public.provider_market_assignments FOR SELECT TO authenticated
USING (public.is_platform_admin(auth.uid()));

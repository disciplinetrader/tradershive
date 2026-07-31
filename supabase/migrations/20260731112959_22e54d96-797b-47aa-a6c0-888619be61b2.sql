DROP POLICY IF EXISTS "read participants" ON public.championship_participants;

CREATE POLICY "read own participation" ON public.championship_participants
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_platform_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.championship_participant_count(_champ uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int FROM public.championship_participants WHERE championship_id = _champ;
$$;

REVOKE ALL ON FUNCTION public.championship_participant_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.championship_participant_count(uuid) TO authenticated, service_role;
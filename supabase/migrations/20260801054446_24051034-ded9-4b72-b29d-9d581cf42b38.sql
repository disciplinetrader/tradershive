CREATE OR REPLACE FUNCTION public.is_study_group_visible(_group_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.study_groups g
    WHERE g.id = _group_id
      AND (
        g.visibility <> 'private'
        OR g.owner_id = _user_id
        OR EXISTS (
          SELECT 1 FROM public.study_group_members m
          WHERE m.group_id = g.id AND m.user_id = _user_id
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_study_group_visible(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_study_group_visible(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "gm read" ON public.study_group_members;
CREATE POLICY "gm read" ON public.study_group_members
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_study_group_visible(group_id, auth.uid())
);
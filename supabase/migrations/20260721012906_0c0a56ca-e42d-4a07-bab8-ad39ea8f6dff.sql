
-- 1. profiles: revoke sensitive column access from authenticated/anon
REVOKE SELECT (email, admin_notes) ON public.profiles FROM authenticated;
REVOKE SELECT (email, admin_notes) ON public.profiles FROM anon;

-- 2. battle_chat: hide soft-deleted messages
DROP POLICY IF EXISTS "Read chat of public or joined battles" ON public.battle_chat;
CREATE POLICY "Read chat of public or joined battles" ON public.battle_chat
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND EXISTS (
      SELECT 1 FROM public.battles b
      WHERE b.id = battle_chat.battle_id
        AND (b.visibility = 'public'::battle_visibility
             OR b.host_id = auth.uid()
             OR public.is_battle_participant(b.id, auth.uid())
             OR public.is_platform_admin(auth.uid()))
    )
  );

-- 3. provider_credentials: explicit admin-only policy (defence in depth)
DROP POLICY IF EXISTS "pc_admin_all" ON public.provider_credentials;
CREATE POLICY "pc_admin_all" ON public.provider_credentials
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

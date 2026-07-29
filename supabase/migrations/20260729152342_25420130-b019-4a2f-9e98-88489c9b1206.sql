
-- 1) Achievements & badges: use is_platform_admin() instead of has_role(admin)
DROP POLICY IF EXISTS "achievements admin write" ON public.achievements;
DROP POLICY IF EXISTS "achievements readable" ON public.achievements;
CREATE POLICY "achievements admin write" ON public.achievements
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE POLICY "achievements readable" ON public.achievements
  FOR SELECT
  USING (active = true OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "badges admin write" ON public.badges;
DROP POLICY IF EXISTS "badges readable" ON public.badges;
CREATE POLICY "badges admin write" ON public.badges
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE POLICY "badges readable" ON public.badges
  FOR SELECT
  USING (active = true OR public.is_platform_admin(auth.uid()));

-- 2) contact_messages: enforce email format + reasonable length limits on anon/auth inserts
DROP POLICY IF EXISTS contact_messages_anon_insert ON public.contact_messages;
DROP POLICY IF EXISTS contact_messages_auth_insert ON public.contact_messages;

CREATE POLICY contact_messages_anon_insert ON public.contact_messages
  FOR INSERT TO anon
  WITH CHECK (
    user_id IS NULL
    AND length(btrim(name)) BETWEEN 1 AND 200
    AND length(btrim(message)) BETWEEN 1 AND 5000
    AND length(btrim(email)) BETWEEN 3 AND 320
    AND btrim(email) ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  );

CREATE POLICY contact_messages_auth_insert ON public.contact_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    (user_id IS NULL OR user_id = auth.uid())
    AND length(btrim(name)) BETWEEN 1 AND 200
    AND length(btrim(message)) BETWEEN 1 AND 5000
    AND length(btrim(email)) BETWEEN 3 AND 320
    AND btrim(email) ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  );

-- 3) Storage: fix strategy public-read policies (previous version used storage.foldername(s.name)
-- referencing the strategies.name column instead of the storage object path). Validate path
-- structure and match the owning strategy's user_id explicitly.
DROP POLICY IF EXISTS "strategy-covers_read_public" ON storage.objects;
DROP POLICY IF EXISTS "strategy-files_read_public" ON storage.objects;
DROP POLICY IF EXISTS "strategy-images_read_public" ON storage.objects;

CREATE POLICY "strategy-covers_read_public" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'strategy-covers'
    AND array_length(storage.foldername(name), 1) >= 1
    AND EXISTS (
      SELECT 1 FROM public.strategies s
      WHERE s.user_id::text = (storage.foldername(storage.objects.name))[1]
        AND s.status = 'public'::strategy_status
    )
  );

CREATE POLICY "strategy-files_read_public" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'strategy-files'
    AND array_length(storage.foldername(name), 1) >= 1
    AND EXISTS (
      SELECT 1 FROM public.strategies s
      WHERE s.user_id::text = (storage.foldername(storage.objects.name))[1]
        AND s.status = 'public'::strategy_status
    )
  );

CREATE POLICY "strategy-images_read_public" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'strategy-images'
    AND array_length(storage.foldername(name), 1) >= 1
    AND EXISTS (
      SELECT 1 FROM public.strategies s
      WHERE s.user_id::text = (storage.foldername(storage.objects.name))[1]
        AND s.status = 'public'::strategy_status
    )
  );

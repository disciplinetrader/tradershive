
CREATE POLICY "battle_logs service writes"
  ON public.battle_logs FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "provider_market_assignments admin writes"
  ON public.provider_market_assignments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE OR REPLACE VIEW public.profile_customization_public
WITH (security_invoker = on) AS
  SELECT pc.user_id, pc.banner_url, pc.headline, pc.favorite_pair, pc.created_at, pc.updated_at
  FROM public.profile_customization pc
  WHERE NOT EXISTS (
    SELECT 1 FROM public.profile_privacy pp
    WHERE pp.user_id = pc.user_id AND pp.hide_profile = true
  );

GRANT SELECT ON public.profile_customization_public TO authenticated;

DROP POLICY IF EXISTS "Customization readable by authenticated" ON public.profile_customization;

CREATE POLICY "Owners read their customization"
  ON public.profile_customization FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Public customization view access"
  ON public.profile_customization FOR SELECT TO authenticated
  USING (
    NOT EXISTS (
      SELECT 1 FROM public.profile_privacy pp
      WHERE pp.user_id = profile_customization.user_id AND pp.hide_profile = true
    )
  );

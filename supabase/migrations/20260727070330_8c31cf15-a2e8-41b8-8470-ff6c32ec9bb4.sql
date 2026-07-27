-- mentor_profiles: restrict SELECT to authenticated users
DROP POLICY IF EXISTS "mentors read" ON public.mentor_profiles;
CREATE POLICY "mentors read" ON public.mentor_profiles
  FOR SELECT TO authenticated USING (true);

-- profile_customization: respect profile_privacy.hide_profile
DROP POLICY IF EXISTS "Customization readable by authenticated" ON public.profile_customization;
CREATE POLICY "Customization readable by authenticated"
  ON public.profile_customization
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR NOT EXISTS (
      SELECT 1 FROM public.profile_privacy pp
      WHERE pp.user_id = public.profile_customization.user_id
        AND pp.hide_profile = true
    )
  );

-- trade_reviews: restrict SELECT to reviewer or target owner
DROP POLICY IF EXISTS "reviews read" ON public.trade_reviews;
CREATE POLICY "reviews read" ON public.trade_reviews
  FOR SELECT TO authenticated
  USING (
    reviewer_id = auth.uid()
    OR target_owner_id = auth.uid()
  );

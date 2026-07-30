-- 1. community_posts: replace blanket ALL admin policy with scoped policies
DROP POLICY IF EXISTS "posts admin all" ON public.community_posts;

CREATE POLICY "posts admin update" ON public.community_posts
  FOR UPDATE TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "posts admin delete" ON public.community_posts
  FOR DELETE TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- 2. profile_customization: strict opt-in for public socials
DROP POLICY IF EXISTS "Public customization view access" ON public.profile_customization;

CREATE POLICY "Public customization view access" ON public.profile_customization
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profile_privacy pp
      WHERE pp.user_id = profile_customization.user_id
        AND pp.hide_profile = false
        AND pp.show_socials = true
    )
  );

ALTER TABLE public.profile_privacy ALTER COLUMN show_socials SET DEFAULT false;
ALTER TABLE public.profile_privacy ALTER COLUMN hide_profile SET DEFAULT false;

-- 3. trade_reviews: pin target fields after creation
CREATE OR REPLACE FUNCTION public.protect_trade_review_target()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.target_id IS DISTINCT FROM OLD.target_id
     OR NEW.target_owner_id IS DISTINCT FROM OLD.target_owner_id
     OR NEW.target_type IS DISTINCT FROM OLD.target_type
     OR NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id THEN
    RAISE EXCEPTION 'A review cannot be re-targeted after creation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS protect_trade_review_target ON public.trade_reviews;
CREATE TRIGGER protect_trade_review_target
  BEFORE UPDATE ON public.trade_reviews
  FOR EACH ROW EXECUTE FUNCTION public.protect_trade_review_target();
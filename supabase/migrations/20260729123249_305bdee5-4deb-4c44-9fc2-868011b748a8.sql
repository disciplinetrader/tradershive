
-- 1. Fix always-true RLS on contact_messages
DROP POLICY IF EXISTS contact_messages_anon_insert ON public.contact_messages;
DROP POLICY IF EXISTS contact_messages_auth_insert ON public.contact_messages;

CREATE POLICY contact_messages_anon_insert ON public.contact_messages
  FOR INSERT TO anon
  WITH CHECK (
    length(btrim(message)) > 0
    AND length(btrim(email)) > 0
    AND length(btrim(name)) > 0
    AND user_id IS NULL
  );

CREATE POLICY contact_messages_auth_insert ON public.contact_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    length(btrim(message)) > 0
    AND length(btrim(email)) > 0
    AND length(btrim(name)) > 0
    AND (user_id IS NULL OR user_id = auth.uid())
  );

-- 2. Security definer view: ensure historical_coverage runs as invoker
ALTER VIEW public.historical_coverage SET (security_invoker = on);

-- 3. share_events: require user_id = auth.uid() strictly for self-insert
DROP POLICY IF EXISTS "share_events insert self" ON public.share_events;
CREATE POLICY "share_events insert self" ON public.share_events
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

-- 4. trade_reviews: tighten insert/update to prevent spoofed targets
DROP POLICY IF EXISTS "reviews write" ON public.trade_reviews;
DROP POLICY IF EXISTS "reviews update own" ON public.trade_reviews;

CREATE POLICY "reviews write" ON public.trade_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    reviewer_id = auth.uid()
    AND target_owner_id IS NOT NULL
    AND target_owner_id <> auth.uid()
    AND target_type IN ('trade','strategy','playbook','journal_entry','replay_session','paper_trade')
  );

CREATE POLICY "reviews update own" ON public.trade_reviews
  FOR UPDATE TO authenticated
  USING (reviewer_id = auth.uid())
  WITH CHECK (
    reviewer_id = auth.uid()
    AND target_owner_id IS NOT NULL
    AND target_owner_id <> auth.uid()
    AND target_type IN ('trade','strategy','playbook','journal_entry','replay_session','paper_trade')
  );

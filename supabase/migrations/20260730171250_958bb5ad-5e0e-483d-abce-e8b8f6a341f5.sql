-- 1. Internal trigger helper must not be callable through the API
REVOKE EXECUTE ON FUNCTION public.protect_trade_review_target() FROM PUBLIC, anon, authenticated;

-- 2. Standardise moderation override on is_platform_admin()
DROP POLICY IF EXISTS "shared_content admin all" ON public.shared_content;
CREATE POLICY "shared_content admin all" ON public.shared_content
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "share_events admin all" ON public.share_events;
CREATE POLICY "share_events admin all" ON public.share_events
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- 3. Battle chat: server-side content integrity for non-admin authors
CREATE OR REPLACE FUNCTION public.enforce_battle_chat_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_platform_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Regular users may only author plain user messages
  NEW.kind := 'user';
  NEW.user_id := COALESCE(auth.uid(), NEW.user_id);

  -- Strip system-impersonating metadata keys
  IF NEW.metadata IS NOT NULL THEN
    NEW.metadata := (NEW.metadata::jsonb) - 'system' - 'kind' - 'official' - 'admin' - 'role';
  END IF;

  IF NEW.message IS NOT NULL AND length(NEW.message) > 2000 THEN
    RAISE EXCEPTION 'Chat message too long';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_battle_chat_integrity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_battle_chat_integrity ON public.battle_chat;
CREATE TRIGGER trg_battle_chat_integrity
  BEFORE INSERT OR UPDATE ON public.battle_chat
  FOR EACH ROW EXECUTE FUNCTION public.enforce_battle_chat_integrity();
-- 1. historical_candles: remove anonymous read
DROP POLICY IF EXISTS "hc_read" ON public.historical_candles;
REVOKE SELECT ON public.historical_candles FROM anon;

-- 2. function search_path + revoke anon execute
ALTER FUNCTION public.calculate_elo_change(integer, integer, numeric, integer) SET search_path = public;
ALTER FUNCTION public.record_practice_activity(uuid, text, jsonb) SET search_path = public;
REVOKE ALL ON FUNCTION public.record_practice_activity(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_practice_activity(uuid, text, jsonb) TO authenticated, service_role;

-- 3. battle_chat: lock down which columns a regular member may change
CREATE OR REPLACE FUNCTION public.enforce_battle_chat_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_platform_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Immutable after posting for non-admins (hosts may only soft-delete).
    NEW.id := OLD.id;
    NEW.battle_id := OLD.battle_id;
    NEW.user_id := OLD.user_id;
    NEW.kind := OLD.kind;
    NEW.mentions := OLD.mentions;
    NEW.created_at := OLD.created_at;

    IF OLD.user_id IS DISTINCT FROM auth.uid() THEN
      -- Hosts/moderators may only moderate, never rewrite content or reactions.
      NEW.message := OLD.message;
      NEW.reactions := OLD.reactions;
    END IF;

    IF NEW.message IS NOT NULL AND length(NEW.message) > 2000 THEN
      RAISE EXCEPTION 'Chat message too long';
    END IF;

    RETURN NEW;
  END IF;

  NEW.kind := 'user';
  NEW.user_id := COALESCE(auth.uid(), NEW.user_id);

  IF NEW.metadata IS NOT NULL THEN
    NEW.metadata := (NEW.metadata::jsonb) - 'system' - 'kind' - 'official' - 'admin' - 'role';
  END IF;

  IF NEW.message IS NOT NULL AND length(NEW.message) > 2000 THEN
    RAISE EXCEPTION 'Chat message too long';
  END IF;

  RETURN NEW;
END;
$function$;

-- 4. community_challenges: creator is always the caller
ALTER TABLE public.community_challenges ALTER COLUMN created_by SET DEFAULT auth.uid();

CREATE OR REPLACE FUNCTION public.enforce_community_challenge_creator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.is_platform_admin(auth.uid()) THEN
      NEW.created_by := auth.uid();
    ELSE
      NEW.created_by := COALESCE(NEW.created_by, auth.uid());
    END IF;
  ELSE
    NEW.created_by := OLD.created_by;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_cch_creator ON public.community_challenges;
CREATE TRIGGER trg_cch_creator
BEFORE INSERT OR UPDATE ON public.community_challenges
FOR EACH ROW EXECUTE FUNCTION public.enforce_community_challenge_creator();

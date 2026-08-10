-- Battle chat has never been able to accept a message.
--
-- `enforce_battle_chat_integrity()` fires BEFORE INSERT and reads
-- `NEW.metadata`, but `public.battle_chat` has no `metadata` column. PL/pgSQL
-- resolves record fields at runtime, so every insert aborts with
--
--     42703  record "new" has no field "metadata"
--
-- The UPDATE branch returns before reaching that line, which is why moderation
-- and reactions work and only posting is broken — and why this looked like a
-- front-end problem. It fails identically for the `sendBattleChat` server fn
-- and for a direct client insert, because the trigger is below both.
--
-- Introduced 2026-07-30 (20260730171250) and carried forward verbatim by
-- 20260805110114. Chat has been dead for every battle since.
--
-- The block is vestigial, not merely misplaced: no column exists to sanitise,
-- and nothing in the application writes one. `sendBattleChat` inserts
-- battle_id, user_id, message, mentions and kind. So it is removed rather than
-- satisfied by adding a column — adding `metadata` to make a guard work when
-- the guard protects nothing would leave a writable, unvalidated jsonb field on
-- a user-facing table for no reason.
--
-- Everything else in the function is carried over unchanged.

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

  -- The `NEW.metadata` sanitising block that used to sit here is gone; see the
  -- header. If a metadata column is ever added, restore it in the same change.

  IF NEW.message IS NOT NULL AND length(NEW.message) > 2000 THEN
    RAISE EXCEPTION 'Chat message too long';
  END IF;

  RETURN NEW;
END;
$function$;

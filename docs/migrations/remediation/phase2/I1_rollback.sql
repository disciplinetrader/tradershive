-- =============================================================================
-- Phase 2 · Increment 1 ROLLBACK. Run as postgres, newest block first.
-- Restores the pre-I1 state captured on the rehearsal at 2026-09-17.
-- =============================================================================

-- R-I1d — drop award_xp_coins
DROP FUNCTION IF EXISTS public.award_xp_coins(uuid, integer, integer, text, uuid, text);

-- R-I1c — drop idempotency indexes
DROP INDEX IF EXISTS public.xp_transactions_source_idem;
DROP INDEX IF EXISTS public.coin_transactions_source_idem;

-- R-I1b — restore the original protect trigger body (production md5 e3beb795…)
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  IF v_role = 'service_role' THEN
    RETURN NEW;
  END IF;
  NEW.is_premium := OLD.is_premium;
  NEW.coins := OLD.coins;
  NEW.xp := OLD.xp;
  NEW.level := OLD.level;
  NEW.league := OLD.league;
  NEW.rank := OLD.rank;
  NEW.streak := OLD.streak;
  RETURN NEW;
END $fn$;

-- R-I1a — restore table-level UPDATE on profiles to authenticated
DO $r$
BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'R-I1a: run as postgres (%).', current_user; END IF;
  -- The original state was a plain table-level UPDATE grant (all columns).
  -- Granting table UPDATE supersedes the column-scoped grants from I1a; drop the
  -- residual column grants first so the ACL matches the pre-I1 shape exactly.
  REVOKE UPDATE ON public.profiles FROM authenticated;
  GRANT UPDATE ON public.profiles TO authenticated;
END $r$;

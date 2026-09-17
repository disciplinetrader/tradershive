-- =============================================================================
-- Phase 2 · Increment 1 — profile competitive integrity + authoritative rewards
-- Closes: C-5 (self-set ELO/wins/streaks), B-4 revert-half (rewards never land),
--         S-6 (protect trigger legacy role GUC).
-- STATUS: for REHEARSAL first. Not for production until the full package is
--         approved. Run as postgres, one block per call. Rollback: I1_rollback.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- I1a — profiles: restrict authenticated UPDATE to user-editable columns only.
--   Table-level UPDATE currently lets a user set elo/xp/coins/etc. directly.
--   Replace it with column-scoped UPDATE. finalize_battle / award_xp_coins run
--   as postgres (SECURITY DEFINER owner) and are unaffected by this grant.
--   User-editable set derived from the only client writers (source audit):
--     settings.index.tsx (display_name, timezone), onboarding.tsx
--     (onboarded, experience, preferred_markets, preferred_market,
--     trading_style, goals), AvatarUpload.tsx (avatar_url),
--     TimezoneSuggestionModal.tsx (timezone). Descriptive columns
--     (username, bio, country, first_name, last_name, accepted_terms_at,
--     last_active_at, updated_at) kept editable as a safety margin.
-- ---------------------------------------------------------------------------
DO $i1a$
BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'I1a: run as postgres (%).', current_user; END IF;
  IF NOT has_table_privilege('authenticated','public.profiles','UPDATE') THEN
    RAISE EXCEPTION 'I1a: precondition failed — authenticated lacks table UPDATE on profiles; state differs from capture.';
  END IF;

  REVOKE UPDATE ON public.profiles FROM authenticated;
  GRANT UPDATE (
    username, display_name, avatar_url, bio, country, timezone,
    experience, preferred_market, preferred_markets, trading_style, goals,
    onboarded, accepted_terms_at, first_name, last_name, last_active_at, updated_at
  ) ON public.profiles TO authenticated;

  -- Post-conditions: competitive columns blocked, editable columns allowed.
  IF has_column_privilege('authenticated','public.profiles','elo','UPDATE')
     OR has_column_privilege('authenticated','public.profiles','xp','UPDATE')
     OR has_column_privilege('authenticated','public.profiles','coins','UPDATE')
     OR has_column_privilege('authenticated','public.profiles','battle_wins','UPDATE')
     OR has_column_privilege('authenticated','public.profiles','best_battle_streak','UPDATE')
     OR has_column_privilege('authenticated','public.profiles','is_premium','UPDATE')
     OR has_column_privilege('authenticated','public.profiles','peak_elo','UPDATE')
     OR has_column_privilege('authenticated','public.profiles','battles_played','UPDATE')
     OR has_column_privilege('authenticated','public.profiles','current_battle_streak','UPDATE')
     OR has_column_privilege('authenticated','public.profiles','level','UPDATE')
     OR has_column_privilege('authenticated','public.profiles','league','UPDATE')
     OR has_column_privilege('authenticated','public.profiles','rank','UPDATE')
     OR has_column_privilege('authenticated','public.profiles','streak','UPDATE') THEN
    RAISE EXCEPTION 'I1a: post-condition failed — a competitive column is still UPDATE-able by authenticated.';
  END IF;
  IF NOT has_column_privilege('authenticated','public.profiles','display_name','UPDATE')
     OR NOT has_column_privilege('authenticated','public.profiles','timezone','UPDATE')
     OR NOT has_column_privilege('authenticated','public.profiles','onboarded','UPDATE')
     OR NOT has_column_privilege('authenticated','public.profiles','preferred_markets','UPDATE') THEN
    RAISE EXCEPTION 'I1a: post-condition failed — a user-editable column lost UPDATE.';
  END IF;
END $i1a$;


-- ---------------------------------------------------------------------------
-- I1b — protect_profile_privileged_columns: robust role detection + wider set.
--   Replaces the legacy `request.jwt.claim.role` GUC check (S-6) with
--   current_user, which is 'postgres' inside SECURITY DEFINER functions owned
--   by postgres (award_xp_coins, finalize_battle), 'service_role' for the
--   service key, and 'authenticated'/'anon' for client calls. Extends the
--   reverted set to the competitive columns as defence-in-depth behind I1a.
--   Bypasses for elevated roles so finalize_battle's ELO write still works.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  -- Elevated / trusted execution contexts may write privileged columns.
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;
  -- Everyone else: privileged columns are frozen to their old values.
  NEW.is_premium            := OLD.is_premium;
  NEW.coins                 := OLD.coins;
  NEW.xp                    := OLD.xp;
  NEW.level                 := OLD.level;
  NEW.league                := OLD.league;
  NEW.rank                  := OLD.rank;
  NEW.streak                := OLD.streak;
  NEW.elo                   := OLD.elo;
  NEW.peak_elo              := OLD.peak_elo;
  NEW.battle_wins           := OLD.battle_wins;
  NEW.battles_played        := OLD.battles_played;
  NEW.current_battle_streak := OLD.current_battle_streak;
  NEW.best_battle_streak    := OLD.best_battle_streak;
  RETURN NEW;
END $fn$;


-- ---------------------------------------------------------------------------
-- I1c — idempotency backstop for the reward ledger.
--   Partial unique indexes so a repeated (user, source, source_id) award can
--   never double-write, even under a race the FOR UPDATE lock in award_xp_coins
--   would otherwise have to catch alone. NULL source_id (ad-hoc/manual awards)
--   is intentionally not constrained.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS xp_transactions_source_idem
  ON public.xp_transactions (user_id, source, source_id)
  WHERE source_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS coin_transactions_source_idem
  ON public.coin_transactions (user_id, source, source_id)
  WHERE source_id IS NOT NULL;


-- ---------------------------------------------------------------------------
-- I1d — award_xp_coins: the single authoritative reward path.
--   service_role only. Idempotent on (user, source, source_id). Mirrors the
--   app's leveling (xpForLevel = round(100 * 1.15^(level-1)); profiles.xp is
--   the within-level remainder) and league thresholds. Emits only valid
--   `league` enum values (bronze..master); the app's 'legend' key has no
--   enum member (recorded as a separate finding) and is unreachable here.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.award_xp_coins(
  _user_id uuid, _xp integer, _coins integer, _source text, _source_id uuid, _reason text
) RETURNS TABLE(applied boolean, xp integer, level integer, coins integer, league public.league)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_xp int; v_level int; v_coins int; v_league public.league; v_cost int;
BEGIN
  -- Serialize per user, then check idempotency inside the lock (closes the race).
  SELECT GREATEST(COALESCE(p.level,1),1), GREATEST(COALESCE(p.xp,0),0), COALESCE(p.coins,0)
    INTO v_level, v_xp, v_coins
    FROM public.profiles p WHERE p.id = _user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'award_xp_coins: profile % not found', _user_id; END IF;

  IF _source_id IS NOT NULL AND (
       EXISTS (SELECT 1 FROM public.xp_transactions   t WHERE t.user_id=_user_id AND t.source=_source AND t.source_id=_source_id)
    OR EXISTS (SELECT 1 FROM public.coin_transactions c WHERE c.user_id=_user_id AND c.source=_source AND c.source_id=_source_id)
     ) THEN
    SELECT p.xp,p.level,p.coins,p.league INTO v_xp,v_level,v_coins,v_league FROM public.profiles p WHERE p.id=_user_id;
    RETURN QUERY SELECT false, v_xp, v_level, v_coins, v_league; RETURN;
  END IF;

  v_xp := v_xp + GREATEST(_xp, 0);
  IF _xp > 0 THEN
    LOOP
      v_cost := round(100 * power(1.15, GREATEST(0, v_level - 1)))::int;
      EXIT WHEN v_xp < v_cost;
      v_xp := v_xp - v_cost;
      v_level := v_level + 1;
    END LOOP;
  END IF;
  v_coins := GREATEST(0, v_coins + _coins);
  v_league := (CASE
      WHEN v_level >= 75 THEN 'master'
      WHEN v_level >= 50 THEN 'diamond'
      WHEN v_level >= 30 THEN 'platinum'
      WHEN v_level >= 15 THEN 'gold'
      WHEN v_level >= 5  THEN 'silver'
      ELSE 'bronze' END)::public.league;

  UPDATE public.profiles SET xp=v_xp, level=v_level, coins=v_coins, league=v_league WHERE id=_user_id;

  IF _xp <> 0 THEN
    INSERT INTO public.xp_transactions(user_id, delta, reason, source, source_id, balance_after, level_after)
    VALUES (_user_id, _xp, _reason, _source, _source_id, v_xp, v_level);
  END IF;
  IF _coins <> 0 THEN
    INSERT INTO public.coin_transactions(user_id, delta, reason, source, source_id, balance_after)
    VALUES (_user_id, _coins, _reason, _source, _source_id, v_coins);
  END IF;
  RETURN QUERY SELECT true, v_xp, v_level, v_coins, v_league;
END $fn$;

REVOKE ALL ON FUNCTION public.award_xp_coins(uuid, integer, integer, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_xp_coins(uuid, integer, integer, text, uuid, text) TO service_role;

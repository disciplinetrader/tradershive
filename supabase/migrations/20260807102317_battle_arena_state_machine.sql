-- ============================================================
-- Battle Arena — state machine repair + scheduling
--
-- Problem this fixes: nothing ever advanced a battle's status.
-- `tick_battles()` owned every transition (upcoming -> open -> filling ->
-- ready -> countdown -> live -> completed) but had no caller: no pg_cron
-- schedule, no HTTP hook, and the `tickBattles` server fn was never invoked
-- from the app. The only battles that ever reached `live` were 1v1 matches,
-- via a hardcoded auto-start in joinBattle that skips the state machine.
--
-- Changes:
--   1. tick_battle(uuid)  — NEW. Per-battle, time-gated, idempotent, safe for
--                           any authenticated viewer to call. Drives the
--                           10-second countdown, which a 1-minute cron cannot.
--   2. tick_battles()     — rewritten to loop over tick_battle() so the cron
--                           and the client apply identical logic. Adds the
--                           missing open/filling -> ready promotion.
--   3. join_battle(uuid)  — promotes from `upcoming` (not just `open`), drops
--                           the stale ROWTYPE snapshot, is idempotent on
--                           re-join, and no longer rejects the host and
--                           invite-code redeemers from private battles.
--   4. finalize_battle()  — takes a row lock and returns early when already
--                           completed. Its ELO/XP writes are increments and
--                           were previously double-applicable.
--   5. cron.schedule      — 'battle-tick', every minute.
-- ============================================================


-- ============================================================
-- 1. tick_battle — single-battle state machine
--
-- Every transition is gated on a timestamp comparison and includes the
-- expected status in its WHERE clause, so this is a compare-and-swap:
-- concurrent callers (several viewers polling at once, plus the cron) cannot
-- double-apply a transition. A caller that loses the race stops and lets the
-- next poll pick the battle up.
--
-- Returns the battle's status after ticking so the client can skip a refetch
-- when nothing changed.
--
-- Statuses deliberately NOT handled here: 'draft', 'paused', 'failed',
-- 'cancelled', 'completed'. None matches any branch below, so each is an
-- explicit no-op, and tick_battles() excludes them from its candidate set.
--
-- 'cancelled' and 'completed' are terminal by design. 'draft', 'paused' and
-- 'failed' are currently unreachable — nothing in the application or in any
-- migration writes them to battles.status; they exist only as enum labels and
-- UI strings. Note that if 'paused' ever becomes reachable (e.g. a pause
-- control on the live battle screen) it would become a permanent stall: a
-- paused battle would never resume AND would never finalize past its end_at,
-- because finalization only runs from the 'live' branch. Adding a pause
-- feature therefore requires adding resume/finalize handling here at the same
-- time. finalize_battle() can still be called directly as a manual recovery.
-- ============================================================
CREATE OR REPLACE FUNCTION public.tick_battle(_battle_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_battle public.battles%ROWTYPE;
  v_count  INTEGER;
BEGIN
  SELECT * INTO v_battle FROM public.battles WHERE id = _battle_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- upcoming -> open (lobby opens one hour before the scheduled start)
  IF v_battle.status = 'upcoming' AND v_battle.start_at <= (now() + interval '1 hour') THEN
    UPDATE public.battles SET status = 'open', updated_at = now()
      WHERE id = _battle_id AND status = 'upcoming';
    IF NOT FOUND THEN RETURN v_battle.status::text; END IF;
    v_battle.status := 'open';
  END IF;

  -- open/filling -> ready (enough competitors have joined)
  --
  -- Previously missing entirely. Without it a battle that filled up while
  -- still `upcoming` could never reach `ready`, so `ready -> countdown` never
  -- fired and the battle never started.
  IF v_battle.status IN ('open', 'filling') THEN
    SELECT COUNT(*) INTO v_count
      FROM public.battle_participants WHERE battle_id = _battle_id;

    IF v_count >= COALESCE(v_battle.min_participants, 2) THEN
      UPDATE public.battles SET status = 'ready', updated_at = now()
        WHERE id = _battle_id AND status IN ('open', 'filling');
      IF NOT FOUND THEN RETURN v_battle.status::text; END IF;
      v_battle.status := 'ready';
    END IF;
  END IF;

  -- ready -> countdown (within 30 seconds of the scheduled start)
  IF v_battle.status = 'ready' AND v_battle.start_at <= (now() + interval '30 seconds') THEN
    UPDATE public.battles
       SET status = 'countdown', countdown_started_at = now(), updated_at = now()
      WHERE id = _battle_id AND status = 'ready';
    IF NOT FOUND THEN RETURN v_battle.status::text; END IF;
    v_battle.status              := 'countdown';
    v_battle.countdown_started_at := now();
  END IF;

  -- countdown -> live (after the 10-second countdown has actually elapsed).
  -- Deliberately cannot fire in the same call that started the countdown.
  IF v_battle.status = 'countdown'
     AND v_battle.countdown_started_at IS NOT NULL
     AND v_battle.countdown_started_at <= (now() - interval '10 seconds') THEN
    UPDATE public.battles SET status = 'live', updated_at = now()
      WHERE id = _battle_id AND status = 'countdown';
    IF NOT FOUND THEN RETURN v_battle.status::text; END IF;
    v_battle.status := 'live';
  END IF;

  -- live -> completed. finalize_battle takes its own lock and is idempotent.
  IF v_battle.status = 'live' AND v_battle.end_at <= now() THEN
    PERFORM public.finalize_battle(_battle_id);
    SELECT status INTO v_battle.status FROM public.battles WHERE id = _battle_id;
  END IF;

  RETURN v_battle.status::text;
END $function$;

GRANT EXECUTE ON FUNCTION public.tick_battle(uuid) TO authenticated;


-- ============================================================
-- 2. tick_battles — cron entry point
--
-- Now a thin loop over tick_battle() so there is exactly one implementation
-- of the state machine. The matchmaking-queue block is carried over verbatim.
-- ============================================================
CREATE OR REPLACE FUNCTION public.tick_battles()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM public.battles
     WHERE status IN ('upcoming', 'open', 'filling', 'ready', 'countdown', 'live')
     ORDER BY start_at ASC
  LOOP
    PERFORM public.tick_battle(r.id);
  END LOOP;

  -- Matchmaking Queue Processing
  -- Very simple: if 2 people in queue for same type/ranked, start a battle
  FOR r IN
    SELECT battle_type, is_ranked, count(*) as cnt
    FROM public.matchmaking_queue
    GROUP BY battle_type, is_ranked
    HAVING count(*) >= 2
  LOOP
    DECLARE
      v_battle_id UUID;
      v_user_1 UUID;
      v_user_2 UUID;
    BEGIN
      SELECT user_id INTO v_user_1 FROM public.matchmaking_queue
        WHERE battle_type = r.battle_type AND is_ranked = r.is_ranked LIMIT 1;
      SELECT user_id INTO v_user_2 FROM public.matchmaking_queue
        WHERE battle_type = r.battle_type AND is_ranked = r.is_ranked AND user_id != v_user_1 LIMIT 1;

      INSERT INTO public.battles(name, host_id, battle_type, ranked, start_at, end_at, status, visibility, starting_balance, min_participants, max_participants)
      VALUES (
        'Matchmaking: ' || r.battle_type,
        v_user_1,
        r.battle_type,
        r.is_ranked,
        now() + interval '5 minutes',
        now() + interval '35 minutes',
        'open',
        'public',
        10000, 2, 10
      ) RETURNING id INTO v_battle_id;

      DELETE FROM public.matchmaking_queue WHERE user_id IN (v_user_1, v_user_2);

      INSERT INTO public.battle_notifications(user_id, kind, title, body, battle_id)
      VALUES
        (v_user_1, 'match_found', 'Match Found!', 'Your battle arena is ready.', v_battle_id),
        (v_user_2, 'match_found', 'Match Found!', 'Your battle arena is ready.', v_battle_id);
    END;
  END LOOP;
END $function$;


-- ============================================================
-- 3. join_battle
--
-- Signature gains a defaulted `_invite_ok` flag, so the old 1-arg call sites
-- keep working. Dropped first because adding a defaulted parameter via
-- CREATE OR REPLACE would create an ambiguous overload for 1-arg calls.
-- ============================================================
DROP FUNCTION IF EXISTS public.join_battle(uuid);

CREATE OR REPLACE FUNCTION public.join_battle(_battle_id uuid, _invite_ok boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_battle     public.battles%ROWTYPE;
  v_uid        UUID := auth.uid();
  v_count      INTEGER;
  v_account_id UUID;
  v_status     public.battle_status;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_battle FROM public.battles WHERE id = _battle_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Battle not found'; END IF;

  -- Idempotent re-join. Must come first: the old version fell through to the
  -- paper_accounts INSERT before ON CONFLICT swallowed the participant row,
  -- leaking an orphaned account on every repeat call.
  IF EXISTS (
    SELECT 1 FROM public.battle_participants
     WHERE battle_id = _battle_id AND user_id = v_uid
  ) THEN
    RETURN v_battle.id;
  END IF;

  -- Visibility. The host always gets in (they just created it), and
  -- join_battle_by_code passes _invite_ok after validating the code.
  IF v_battle.visibility = 'private'
     AND NOT _invite_ok
     AND v_battle.host_id <> v_uid THEN
    RAISE EXCEPTION 'Private battle — use invite code';
  END IF;

  IF v_battle.status NOT IN ('draft', 'upcoming', 'open', 'filling', 'ready') THEN
    IF NOT (v_battle.status = 'live' AND v_battle.allow_late_join) THEN
      RAISE EXCEPTION 'Battle already started and late join is disabled';
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.battle_participants WHERE battle_id = v_battle.id;
  IF v_count >= v_battle.max_participants THEN RAISE EXCEPTION 'Battle is full'; END IF;

  INSERT INTO public.paper_accounts(user_id, name, starting_balance, balance, equity, battle_id, max_trade_risk_pct, max_daily_risk_pct)
  VALUES (v_uid, 'Battle: ' || v_battle.name, v_battle.starting_balance, v_battle.starting_balance, v_battle.starting_balance,
          v_battle.id, v_battle.max_risk_pct, v_battle.max_daily_loss_pct)
  RETURNING id INTO v_account_id;

  INSERT INTO public.battle_participants(battle_id, user_id, paper_account_id, status)
  VALUES (v_battle.id, v_uid, v_account_id, 'joined')
  ON CONFLICT (battle_id, user_id) DO NOTHING;

  -- Authoritative recount AFTER the insert. The old version tested
  -- `v_count + 1` against a count read before the insert.
  SELECT COUNT(*) INTO v_count FROM public.battle_participants WHERE battle_id = v_battle.id;

  -- Lobby promotion. `upcoming` is included because join_battle already
  -- accepts joins in that state; the old version only promoted from `open`,
  -- so battles that filled before their lobby opened were stranded.
  IF v_battle.status IN ('upcoming', 'open') THEN
    UPDATE public.battles SET status = 'filling', updated_at = now() WHERE id = _battle_id;
    v_status := 'filling';
  ELSE
    v_status := v_battle.status;
  END IF;

  -- Read from v_status, not the stale v_battle.status snapshot, which could
  -- never equal 'filling' in the same call that set it.
  IF v_status = 'filling' AND v_count >= COALESCE(v_battle.min_participants, 2) THEN
    UPDATE public.battles SET status = 'ready', updated_at = now() WHERE id = _battle_id;
  END IF;

  RETURN v_battle.id;
END $function$;

GRANT EXECUTE ON FUNCTION public.join_battle(uuid, boolean) TO authenticated;


CREATE OR REPLACE FUNCTION public.join_battle_by_code(_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_battle_id UUID;
BEGIN
  SELECT id INTO v_battle_id FROM public.battles
   WHERE invite_code = _code AND status IN ('draft', 'upcoming', 'open', 'filling', 'ready');
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid invite code or battle already full'; END IF;
  -- The code has now been validated, so the private-visibility gate is satisfied.
  RETURN public.join_battle(v_battle_id, true);
END $function$;


-- ============================================================
-- 4. finalize_battle — idempotency guard only
--
-- Body is otherwise unchanged. The guard matters because the function
-- increments profiles.elo / battles_played / battle_wins / streaks and
-- inserts elo_history; none of that is reversible or repeat-safe. Callers
-- that could previously overlap: the host's Finalize button, the settlement
-- route, and now the cron.
-- ============================================================
CREATE OR REPLACE FUNCTION public.finalize_battle(_battle_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_battle public.battles%ROWTYPE;
  r RECORD;
  v_winner_id UUID;
BEGIN
  -- FOR UPDATE serialises concurrent finalizers; the status check makes the
  -- loser of that race a no-op instead of a second award.
  SELECT * INTO v_battle FROM public.battles WHERE id = _battle_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_battle.status = 'completed' THEN RETURN; END IF;

  -- Recompute everyone one last time
  FOR r IN SELECT user_id FROM public.battle_participants WHERE battle_id = _battle_id LOOP
    PERFORM public.recompute_battle_ranking(_battle_id, r.user_id);
  END LOOP;

  -- Store results
  DELETE FROM public.battle_results WHERE battle_id = _battle_id;
  INSERT INTO public.battle_results(
    battle_id, user_id, final_rank, pnl, r_multiple, win_rate,
    trades_count, max_drawdown, xp_awarded, coins_awarded
  )
  SELECT
    battle_id, user_id, rank, pnl, r_multiple, win_rate,
    trades_count, max_drawdown,
    CASE WHEN rank = 1 THEN 500 WHEN rank = 2 THEN 300 WHEN rank = 3 THEN 150 ELSE 50 END,
    CASE WHEN rank = 1 THEN 200 WHEN rank = 2 THEN 100 WHEN rank = 3 THEN 50 ELSE 20 END
  FROM public.battle_rankings WHERE battle_id = _battle_id;

  SELECT user_id INTO v_winner_id FROM public.battle_results WHERE battle_id = _battle_id AND final_rank = 1 LIMIT 1;

  UPDATE public.battles SET status = 'completed', winner_user_id = v_winner_id, updated_at = now()
    WHERE id = _battle_id;

  -- ELO Calculation for Ranked Battles
  IF v_battle.ranked THEN
    FOR r IN SELECT user_id, final_rank FROM public.battle_results WHERE battle_id = _battle_id LOOP
      DECLARE
        v_elo_change INTEGER := -5;
        v_current_elo INTEGER;
      BEGIN
        IF r.final_rank = 1 THEN v_elo_change := 25;
        ELSIF r.final_rank = 2 THEN v_elo_change := 10;
        END IF;

        SELECT elo INTO v_current_elo FROM public.profiles WHERE id = r.user_id;

        UPDATE public.profiles SET
          elo = GREATEST(0, COALESCE(elo, 1000) + v_elo_change),
          peak_elo = GREATEST(peak_elo, COALESCE(elo, 1000) + v_elo_change),
          battles_played = battles_played + 1,
          battle_wins = battle_wins + CASE WHEN r.final_rank = 1 THEN 1 ELSE 0 END,
          current_battle_streak = CASE WHEN r.final_rank = 1 THEN current_battle_streak + 1 ELSE 0 END,
          best_battle_streak = GREATEST(best_battle_streak, CASE WHEN r.final_rank = 1 THEN current_battle_streak + 1 ELSE 0 END)
        WHERE id = r.user_id;

        INSERT INTO public.elo_history(user_id, battle_id, elo_before, elo_after, elo_change)
        VALUES (r.user_id, _battle_id, v_current_elo, v_current_elo + v_elo_change, v_elo_change);
      END;
    END LOOP;
  END IF;

  -- Notifications
  FOR r IN SELECT * FROM public.battle_results WHERE battle_id = _battle_id LOOP
    INSERT INTO public.battle_notifications(battle_id, user_id, kind, title, body)
    VALUES (_battle_id, r.user_id, 'battle_completed',
            'Battle Arena Finished',
            'You finished in rank #' || r.final_rank || '. Check your results page!');
  END LOOP;
END $function$;


-- ============================================================
-- 5. Scheduling — deliberately NOT in this migration
--
-- This project's cron jobs are not kept in migration history. Five already
-- exist, all created out-of-band and all following one convention:
-- pg_cron -> net.http_post -> https://<project>.lovable.app/api/public/hooks/<name>.
--
-- `battle-tick` follows that convention: route at
-- src/routes/api/public/hooks/battle-tick.ts, scheduled with a net.http_post
-- job alongside the others. Scheduling SQL lives with the deploy steps, not
-- here, so this migration stays purely schema.
--
-- Note for whoever schedules it: `battle-settlement-every-minute` must be
-- unscheduled at the same time. tick_battles() finalizes every live battle
-- past its end_at, so leaving settlement running points a second finalizer at
-- the same rows. The FOR UPDATE + status guard added to finalize_battle above
-- makes that survivable rather than corrupting, but it should not be relied on
-- as the primary defence.
-- ============================================================

-- BA-1 — Fix matchmaking block: missing participant creation, account creation,
-- lobby promotion, and queue concurrency.
--
-- This migration adds:
-- 1. _join_battle_as — shared helper that creates paper_accounts + battle_participants
-- for an explicit user_id, callable from service_role contexts.
-- 2. join_battle rewritten as a thin wrapper delegating participant creation to the helper.
-- 3. Matchmaking block in tick_battles() reordered: participants before queue DELETE,
-- FOR UPDATE SKIP LOCKED for concurrency, lobby promotion after both joins.


-- ============================================================
-- 1. Shared helper: _join_battle_as
-- ============================================================
--
-- CALLER CONTRACT — this function trusts the caller for three things:
--
-- 1. BATTLE EXISTS AND IS JOINABLE. The caller must have verified the battle
-- row exists and its status is in ('draft', 'upcoming', 'open', 'filling',
-- 'ready') or ('live' with allow_late_join). This function does not check.
--
-- 2. CAPACITY IS NOT EXCEEDED. The caller must have verified that the current
-- participant count is below max_participants before calling. This function
-- does not check.
--
-- 3. VISIBILITY IS AUTHORISED. The caller must have verified that the battle
-- is not private, or that the user has a valid invite. This function does
-- not check.
--
-- WHO CHECKS WHAT:
-- join_battle: checks battle existence, visibility, status, capacity
-- before calling _join_battle_as.
-- tick_battles() matchmaking: creates the battle itself (so existence is
-- guaranteed) and relies on max_participants being larger than 2 by construction.
-- It does not check capacity explicitly — the battle is created
-- with exactly 2 slots consumed, max 10, so the check is
-- algebraically satisfied.
--
-- WHAT THIS FUNCTION DOES:
-- - INSERT INTO paper_accounts for _user_id, using the battle's own
-- starting_balance, max_risk_pct, max_daily_loss_pct
-- - INSERT INTO battle_participants linking that account, status 'joined'
-- ON CONFLICT (battle_id, user_id) DO NOTHING
--
-- WHAT THIS FUNCTION DOES NOT DO:
-- - Check battle status or visibility
-- - Check max_participants capacity
-- - Promote lobby status (open -> filling -> ready)
-- - Send notifications
--
-- AUTH: SECURITY DEFINER, does not reference auth.uid(). Callable from
-- service_role (cron) and authenticated contexts alike.
--
-- IDEMPOTENT: this function checks for an existing participant row before
-- creating anything. A second call for the same (battle_id, user_id) returns
-- immediately without creating a duplicate paper_account. Callers do not need
-- their own idempotency guard.

CREATE OR REPLACE FUNCTION public._join_battle_as(_battle_id uuid, _user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
 v_account_id UUID;
BEGIN
 -- Idempotency guard: if the participant row already exists, the account
 -- is already linked and nothing needs to be created.
 IF EXISTS (
 SELECT 1 FROM public.battle_participants
 WHERE battle_id = _battle_id AND user_id = _user_id
 ) THEN
 RETURN _battle_id;
 END IF;

 INSERT INTO public.paper_accounts(user_id, name, starting_balance, balance, equity, battle_id, max_trade_risk_pct, max_daily_risk_pct)
 SELECT _user_id, 'Battle: ' || name, starting_balance, starting_balance, starting_balance,
 id, max_risk_pct, max_daily_loss_pct
 FROM public.battles WHERE id = _battle_id
 RETURNING id INTO v_account_id;

 INSERT INTO public.battle_participants(battle_id, user_id, paper_account_id, status)
 VALUES (_battle_id, _user_id, v_account_id, 'joined')
 ON CONFLICT (battle_id, user_id) DO NOTHING;

 RETURN _battle_id;
END $function$;

GRANT EXECUTE ON FUNCTION public._join_battle_as(uuid, uuid) TO service_role;


-- ============================================================
-- 2. join_battle — rewritten as thin wrapper
-- ============================================================
--
-- Participant creation moved to _join_battle_as. This function retains
-- auth checks, visibility check, status check, capacity check, lobby
-- promotion, and returns the battle_id.

CREATE OR REPLACE FUNCTION public.join_battle(_battle_id uuid, _invite_ok boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
 v_battle public.battles%ROWTYPE;
 v_uid UUID := auth.uid();
 v_count INTEGER;
 v_status public.battle_status;
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

 -- Delegate participant + account creation to the shared helper.
 PERFORM public._join_battle_as(_battle_id, v_uid);

 -- Authoritative recount AFTER the insert.
 SELECT COUNT(*) INTO v_count FROM public.battle_participants WHERE battle_id = _battle_id;

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


-- ============================================================
-- 3. tick_battles — matchmaking block rewrite
-- ============================================================
--
-- Changes:
-- - Participants created BEFORE queue DELETE and notifications
-- - SELECT ... FOR UPDATE SKIP LOCKED for concurrency safety
-- - ORDER BY joined_at ASC for deterministic FIFO pairing
-- - NULL pair check: CONTINUE if either SELECT returns NULL
-- - EXCEPTION handler per pair: one bad pair does not roll back the
-- entire tick or affect battles processed earlier in the loop
-- - Lobby promotion after both participants are created

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
 BEGIN
 PERFORM public.tick_battle(r.id);
 EXCEPTION WHEN OTHERS THEN
 RAISE NOTICE 'tick_battles: tick_battle(%) failed: %', r.id, SQLERRM;
 END;
 END LOOP;

 -- Matchmaking Queue Processing
 -- FIFO pairing: oldest queued users are paired first.
 -- FOR UPDATE SKIP LOCKED prevents concurrent ticks from selecting the same rows.
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
 -- Locked selection. Concurrent ticks skip locked rows.
 SELECT user_id INTO v_user_1 FROM public.matchmaking_queue
 WHERE battle_type = r.battle_type AND is_ranked = r.is_ranked
 ORDER BY joined_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED;

 SELECT user_id INTO v_user_2 FROM public.matchmaking_queue
 WHERE battle_type = r.battle_type AND is_ranked = r.is_ranked
 AND user_id != v_user_1
 ORDER BY joined_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED;

 -- If either was taken by a concurrent tick, skip this pair.
 IF v_user_1 IS NULL OR v_user_2 IS NULL THEN
 CONTINUE;
 END IF;

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

 -- Create both participants BEFORE touching the queue or sending notifications.
 -- If either _join_battle_as raises, the whole pair rolls back and the users
 -- stay in the queue for the next tick.
 PERFORM public._join_battle_as(v_battle_id, v_user_1);
 PERFORM public._join_battle_as(v_battle_id, v_user_2);

 -- Lobby promotion. Matchmade battles start as 'open'; both participants
 -- are now in, so promote to 'filling' then 'ready' if min_participants met.
 DECLARE
 v_count INTEGER;
 v_status public.battle_status;
 BEGIN
 SELECT COUNT(*) INTO v_count FROM public.battle_participants WHERE battle_id = v_battle_id;

 UPDATE public.battles SET status = 'filling', updated_at = now() WHERE id = v_battle_id;
 v_status := 'filling';

 IF v_count >= COALESCE((SELECT min_participants FROM public.battles WHERE id = v_battle_id), 2) THEN
 UPDATE public.battles SET status = 'ready', updated_at = now() WHERE id = v_battle_id;
 END IF;
 END;

 -- Only after both joins and promotion succeed: remove from queue and notify.
 DELETE FROM public.matchmaking_queue WHERE user_id IN (v_user_1, v_user_2);

 INSERT INTO public.battle_notifications(user_id, kind, title, body, battle_id)
 VALUES
 (v_user_1, 'match_found', 'Match Found!', 'Your battle arena is ready.', v_battle_id),
 (v_user_2, 'match_found', 'Match Found!', 'Your battle arena is ready.', v_battle_id);
 EXCEPTION WHEN OTHERS THEN
 -- One bad pair must not roll back the entire tick or affect other battles
 -- processed earlier in this run. Log and continue.
 RAISE NOTICE 'tick_battles: matchmaking pair (type=%, ranked=%) failed: %', r.battle_type, r.is_ranked, SQLERRM;
 END;
 END LOOP;
END $function$;

GRANT EXECUTE ON FUNCTION public.tick_battles() TO service_role;

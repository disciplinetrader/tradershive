-- auth_guard_battle -- permissions-only migration for battle RPCs.
--
-- recompute_battle_ranking: permissions only, no body change.
-- finalize_battle: CREATE OR REPLACE with added ownership check.

-- ============================================================
-- recompute_battle_ranking -- permissions
-- ============================================================
--
-- Callers: finalize_battle (internal, SECURITY DEFINER) and
-- trg_recompute_battle_ranking (trigger on paper_trades, also
-- SECURITY DEFINER). Neither caller needs EXECUTE grant at the
-- invoker level -- the trigger path bypasses grant checks because
-- the trigger function's owner holds EXECUTE on the inner function
-- through role ownership. Only service_role needs the grant for
-- any external callers.

REVOKE EXECUTE ON FUNCTION public.recompute_battle_ranking(uuid, uuid)
 FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.recompute_battle_ranking(uuid, uuid)
 TO service_role;

-- ============================================================
-- finalize_battle -- permissions + ownership check
-- ============================================================
--
-- Callers:
-- - service_role: cron jobs (battle-settlement.ts, tick_battle)
-- auth.uid() IS NULL -> ownership check is skipped
-- - authenticated: manual host finalize (battle-arena.functions.ts:530)
-- auth.uid() IS NOT NULL -> host_id check enforced
--
-- Dependency: the NULL branch is safe only because the REVOKE above
-- removes anon from the EXECUTE grant set. If the grant is ever
-- re-opened to anon, the NULL branch becomes an unauthenticated path
-- that bypasses the ownership check.

REVOKE EXECUTE ON FUNCTION public.finalize_battle(uuid)
 FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.finalize_battle(uuid)
 TO service_role, authenticated;

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

 -- Ownership check for authenticated callers.
 -- service_role (cron jobs battle-settlement.ts, tick_battle) passes
 -- auth.uid() IS NULL and skips this check. This is safe only because
 -- the REVOKE removes anon from the EXECUTE grant set -- if the grant
 -- is ever re-opened to anon, the NULL branch becomes an unauthenticated
 -- path that bypasses ownership.
 IF auth.uid() IS NOT NULL AND auth.uid() <> v_battle.host_id THEN
 RAISE EXCEPTION 'finalize_battle: user % is not the host of battle %', auth.uid(), _battle_id;
 END IF;
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

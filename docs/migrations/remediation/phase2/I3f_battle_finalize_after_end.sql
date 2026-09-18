-- =============================================================================
-- Phase 2 · Increment 3f — let end-of-battle settlement complete (B-1).
-- Run as postgres. Rollback: I3f_rollback.sql. Builds on I3a.
--
-- tick_battle (SECURITY DEFINER) calls finalize_battle once a live battle passes
-- end_at, but auth.uid() inside finalize_battle is still the ticking VIEWER, not
-- the host — so the host guard raised and the whole tick errored. End-of-battle
-- settlement (and, since I3a, the reward payout) therefore never completed from
-- a non-host's page; it depended on the host's own tab or on cron (which had
-- been dead for 12 days). Fix: the host guard now only blocks an EARLY finalize.
-- Once end_at has passed, any caller's tick — or cron — may settle the battle;
-- a non-host still cannot end it before its scheduled end.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.finalize_battle(_battle_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
 v_battle public.battles%ROWTYPE; r RECORD; v_winner_id UUID;
 v_participant_count INTEGER := 0; v_eligible BOOLEAN := false;
BEGIN
 SELECT * INTO v_battle FROM public.battles WHERE id = _battle_id FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;

 -- Only the host may end a battle EARLY. After end_at, a non-host tick or cron
 -- is allowed to settle it (B-1). service_role/cron pass auth.uid() IS NULL.
 IF auth.uid() IS NOT NULL AND auth.uid() <> v_battle.host_id AND now() < v_battle.end_at THEN
 RAISE EXCEPTION 'finalize_battle: only the host may end battle % before its scheduled end', _battle_id;
 END IF;
 IF v_battle.status = 'completed' THEN RETURN; END IF;

 FOR r IN SELECT user_id FROM public.battle_participants WHERE battle_id = _battle_id LOOP
 PERFORM public.recompute_battle_ranking(_battle_id, r.user_id);
 END LOOP;

 SELECT count(DISTINCT user_id) INTO v_participant_count
   FROM public.battle_participants WHERE battle_id = _battle_id;
 v_eligible := COALESCE(v_battle.ranked, false) AND v_participant_count >= 2;

 DELETE FROM public.battle_results WHERE battle_id = _battle_id;
 INSERT INTO public.battle_results(
 battle_id, user_id, final_rank, pnl, r_multiple, win_rate,
 trades_count, max_drawdown, xp_awarded, coins_awarded)
 SELECT battle_id, user_id, rank, pnl, r_multiple, win_rate, trades_count, max_drawdown,
 CASE WHEN NOT v_eligible THEN 0 WHEN rank=1 THEN 500 WHEN rank=2 THEN 300 WHEN rank=3 THEN 150 ELSE 50 END,
 CASE WHEN NOT v_eligible THEN 0 WHEN rank=1 THEN 200 WHEN rank=2 THEN 100 WHEN rank=3 THEN 50 ELSE 20 END
 FROM public.battle_rankings WHERE battle_id = _battle_id;

 SELECT user_id INTO v_winner_id FROM public.battle_results WHERE battle_id = _battle_id AND final_rank = 1 LIMIT 1;
 UPDATE public.battles SET status = 'completed', winner_user_id = v_winner_id, updated_at = now() WHERE id = _battle_id;

 IF v_eligible THEN
 FOR r IN SELECT user_id, final_rank FROM public.battle_results WHERE battle_id = _battle_id LOOP
 DECLARE v_elo_change INTEGER := -5; v_current_elo INTEGER;
 BEGIN
 IF r.final_rank = 1 THEN v_elo_change := 25; ELSIF r.final_rank = 2 THEN v_elo_change := 10; END IF;
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

 IF v_eligible THEN
 FOR r IN SELECT user_id, final_rank, xp_awarded, coins_awarded
            FROM public.battle_results WHERE battle_id = _battle_id LOOP
 PERFORM public.award_xp_coins(
   r.user_id, r.xp_awarded, r.coins_awarded, 'battle', _battle_id,
   'Battle Arena rank #' || r.final_rank);
 END LOOP;
 END IF;

 FOR r IN SELECT * FROM public.battle_results WHERE battle_id = _battle_id LOOP
 INSERT INTO public.battle_notifications(battle_id, user_id, kind, title, body)
 VALUES (_battle_id, r.user_id, 'battle_completed', 'Battle Arena Finished',
 'You finished in rank #' || r.final_rank || '. Check your results page!');
 END LOOP;
END $function$;

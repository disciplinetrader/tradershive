-- =============================================================================
-- Phase 2 · Increment 3a — pay battle rewards on finalize (B-4 payout-half),
-- gated for score/economy integrity. Run as postgres. Rollback: I3a_rollback.sql.
--
-- finalize_battle previously RECORDED xp_awarded/coins_awarded in battle_results
-- but never credited them, and moved ELO for any ranked battle. Both are now
-- gated on eligibility = ranked AND >= 2 distinct participants, so a self-hosted
-- solo (or two-account-but-single-participant) ranked battle can neither farm
-- XP/coins nor move ELO. Unranked and replay battles record results but pay
-- nothing and do not touch ELO. Ineligible battles now record 0 awarded so the
-- results page matches what was actually paid.
--
-- Payout goes through award_xp_coins (service-role, idempotent on
-- (user_id,'battle',_battle_id)); the FOR UPDATE + status='completed' guard
-- already makes a re-run a no-op, and the idempotency index is belt-and-braces.
-- =============================================================================

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
 v_participant_count INTEGER := 0;
 v_eligible BOOLEAN := false;
BEGIN
 SELECT * INTO v_battle FROM public.battles WHERE id = _battle_id FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;

 IF auth.uid() IS NOT NULL AND auth.uid() <> v_battle.host_id THEN
 RAISE EXCEPTION 'finalize_battle: user % is not the host of battle %', auth.uid(), _battle_id;
 END IF;
 IF v_battle.status = 'completed' THEN RETURN; END IF;

 -- Recompute everyone one last time
 FOR r IN SELECT user_id FROM public.battle_participants WHERE battle_id = _battle_id LOOP
 PERFORM public.recompute_battle_ranking(_battle_id, r.user_id);
 END LOOP;

 -- Reward/ELO eligibility: ranked AND a real field (>= 2 distinct participants).
 SELECT count(DISTINCT user_id) INTO v_participant_count
   FROM public.battle_participants WHERE battle_id = _battle_id;
 v_eligible := COALESCE(v_battle.ranked, false) AND v_participant_count >= 2;

 -- Store results. Awards are 0 for ineligible battles so the recorded number
 -- equals what is actually credited below.
 DELETE FROM public.battle_results WHERE battle_id = _battle_id;
 INSERT INTO public.battle_results(
 battle_id, user_id, final_rank, pnl, r_multiple, win_rate,
 trades_count, max_drawdown, xp_awarded, coins_awarded
 )
 SELECT
 battle_id, user_id, rank, pnl, r_multiple, win_rate,
 trades_count, max_drawdown,
 CASE WHEN NOT v_eligible THEN 0
      WHEN rank = 1 THEN 500 WHEN rank = 2 THEN 300 WHEN rank = 3 THEN 150 ELSE 50 END,
 CASE WHEN NOT v_eligible THEN 0
      WHEN rank = 1 THEN 200 WHEN rank = 2 THEN 100 WHEN rank = 3 THEN 50 ELSE 20 END
 FROM public.battle_rankings WHERE battle_id = _battle_id;

 SELECT user_id INTO v_winner_id FROM public.battle_results WHERE battle_id = _battle_id AND final_rank = 1 LIMIT 1;

 UPDATE public.battles SET status = 'completed', winner_user_id = v_winner_id, updated_at = now()
 WHERE id = _battle_id;

 -- ELO only for an eligible ranked field.
 IF v_eligible THEN
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

 -- Pay XP/coins for an eligible battle. Idempotent per (user, 'battle', battle).
 IF v_eligible THEN
 FOR r IN SELECT user_id, final_rank, xp_awarded, coins_awarded
            FROM public.battle_results WHERE battle_id = _battle_id LOOP
 PERFORM public.award_xp_coins(
   r.user_id, r.xp_awarded, r.coins_awarded, 'battle', _battle_id,
   'Battle Arena rank #' || r.final_rank);
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


CREATE OR REPLACE FUNCTION public.finalize_battle(_battle_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
  v_winner UUID;
BEGIN
  FOR r IN SELECT user_id FROM public.battle_participants WHERE battle_id = _battle_id LOOP
    PERFORM public.recompute_battle_ranking(_battle_id, r.user_id);
  END LOOP;

  DELETE FROM public.battle_results WHERE battle_id = _battle_id;
  INSERT INTO public.battle_results(battle_id, user_id, final_rank, pnl, r_multiple, win_rate, trades_count, max_drawdown, xp_awarded, coins_awarded)
  SELECT battle_id, user_id, rank, pnl, r_multiple, win_rate, trades_count, max_drawdown,
    CASE WHEN rank = 1 THEN 200 WHEN rank = 2 THEN 100 WHEN rank = 3 THEN 50 ELSE 25 END,
    CASE WHEN rank = 1 THEN 100 WHEN rank = 2 THEN 50 WHEN rank = 3 THEN 25 ELSE 10 END
  FROM public.battle_rankings WHERE battle_id = _battle_id;

  SELECT user_id INTO v_winner FROM public.battle_results WHERE battle_id = _battle_id AND final_rank = 1 LIMIT 1;

  UPDATE public.battles SET status = 'completed', winner_user_id = v_winner, updated_at = now()
    WHERE id = _battle_id;

  FOR r IN SELECT * FROM public.battle_results WHERE battle_id = _battle_id LOOP
    INSERT INTO public.xp_transactions(user_id, delta, reason, source, source_id)
    VALUES (r.user_id, r.xp_awarded, 'battle_finish', 'battle', _battle_id);
    INSERT INTO public.coin_transactions(user_id, delta, reason, source, source_id)
    VALUES (r.user_id, r.coins_awarded, 'battle_finish', 'battle', _battle_id);
    INSERT INTO public.battle_notifications(battle_id, user_id, kind, title, body)
    VALUES (_battle_id, r.user_id, 'battle_ended',
            'Battle ended — you finished #' || r.final_rank,
            'You earned ' || r.xp_awarded || ' XP and ' || r.coins_awarded || ' coins.');
  END LOOP;
END $$;

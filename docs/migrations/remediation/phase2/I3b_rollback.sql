-- =============================================================================
-- Phase 2 · Increment 3b ROLLBACK. Run as postgres.
-- Restores finalize_championship to its pre-I3b definition (direct ledger inserts
-- that never credit profiles; no participant gate). Idempotent CREATE OR REPLACE.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.finalize_championship(_champ uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v public.championships%ROWTYPE; r RECORD; v_top10 UUID[]; v_winner UUID; v_runner UUID; v_third UUID; v_stats JSONB;
BEGIN
  SELECT * INTO v FROM public.championships WHERE id=_champ;
  IF v.status = 'completed' THEN RETURN; END IF;

  FOR r IN SELECT DISTINCT user_id FROM public.championship_participants WHERE championship_id=_champ LOOP
    PERFORM public.recompute_championship_ranking(_champ, r.user_id);
  END LOOP;

  DELETE FROM public.championship_results WHERE championship_id=_champ;
  INSERT INTO public.championship_results(championship_id, user_id, final_rank, pnl, r_multiple, win_rate,
    profit_factor, max_drawdown, consistency_score, total_trades, score, xp_awarded, coins_awarded, title_awarded)
  SELECT championship_id, user_id, rank, pnl, r_multiple, win_rate, profit_factor, max_drawdown,
    consistency_score, total_trades, score,
    CASE WHEN rank=1 THEN 5000 WHEN rank<=3 THEN 2500 WHEN rank<=10 THEN 1000 WHEN rank<=100 THEN 400 ELSE 100 END,
    CASE WHEN rank=1 THEN 2500 WHEN rank<=3 THEN 1200 WHEN rank<=10 THEN 500 WHEN rank<=100 THEN 200 ELSE 50 END,
    CASE WHEN rank=1 THEN 'Champion' WHEN rank<=3 THEN 'Podium' WHEN rank<=10 THEN 'Top 10' WHEN rank<=100 THEN 'Top 100' ELSE NULL END
  FROM public.championship_rankings WHERE championship_id=_champ AND rank IS NOT NULL AND eligible;

  DELETE FROM public.championship_rewards WHERE championship_id=_champ;
  FOR r IN SELECT * FROM public.championship_results WHERE championship_id=_champ LOOP
    INSERT INTO public.championship_rewards(championship_id, user_id, kind, label, xp, coins, metadata)
      VALUES (_champ, r.user_id,
        CASE WHEN r.final_rank=1 THEN 'champion' WHEN r.final_rank<=3 THEN 'podium'
             WHEN r.final_rank<=10 THEN 'top10' WHEN r.final_rank<=100 THEN 'top100' ELSE 'participation' END,
        COALESCE(r.title_awarded, 'Participant'), r.xp_awarded, r.coins_awarded,
        jsonb_build_object('rank', r.final_rank));
    INSERT INTO public.xp_transactions(user_id, delta, reason, source, source_id)
      VALUES (r.user_id, r.xp_awarded, 'championship_finish', 'championship', _champ);
    INSERT INTO public.coin_transactions(user_id, delta, reason, source, source_id)
      VALUES (r.user_id, r.coins_awarded, 'championship_finish', 'championship', _champ);
  END LOOP;

  SELECT user_id INTO v_winner FROM public.championship_results WHERE championship_id=_champ AND final_rank=1 LIMIT 1;
  SELECT user_id INTO v_runner FROM public.championship_results WHERE championship_id=_champ AND final_rank=2 LIMIT 1;
  SELECT user_id INTO v_third FROM public.championship_results WHERE championship_id=_champ AND final_rank=3 LIMIT 1;
  SELECT COALESCE(array_agg(user_id ORDER BY final_rank), ARRAY[]::UUID[]) INTO v_top10
    FROM public.championship_results WHERE championship_id=_champ AND final_rank <= 10;

  SELECT jsonb_build_object('pnl', pnl, 'r', r_multiple, 'win_rate', win_rate, 'trades', total_trades,
    'profit_factor', profit_factor, 'max_drawdown', max_drawdown, 'consistency', consistency_score)
    INTO v_stats FROM public.championship_results WHERE championship_id=_champ AND final_rank=1;

  INSERT INTO public.championship_hall_of_fame(championship_id, champion_user_id, runner_up_user_id, third_user_id, top10_user_ids, winning_stats)
    VALUES (_champ, v_winner, v_runner, v_third, v_top10, COALESCE(v_stats,'{}'::jsonb))
    ON CONFLICT (championship_id) DO UPDATE SET champion_user_id=EXCLUDED.champion_user_id,
      runner_up_user_id=EXCLUDED.runner_up_user_id, third_user_id=EXCLUDED.third_user_id,
      top10_user_ids=EXCLUDED.top10_user_ids, winning_stats=EXCLUDED.winning_stats, finalized_at=now();

  FOR r IN SELECT * FROM public.championship_results WHERE championship_id=_champ LOOP
    INSERT INTO public.championship_rating(user_id, rating, championships_joined, championships_won,
      top3_finishes, top10_finishes, top100_finishes, best_finish, highest_profit, lifetime_xp, avg_rank)
    VALUES (r.user_id,
      1000 + (CASE WHEN r.final_rank=1 THEN 200 WHEN r.final_rank<=3 THEN 120 WHEN r.final_rank<=10 THEN 60 WHEN r.final_rank<=100 THEN 20 ELSE 5 END),
      1, CASE WHEN r.final_rank=1 THEN 1 ELSE 0 END,
      CASE WHEN r.final_rank<=3 THEN 1 ELSE 0 END,
      CASE WHEN r.final_rank<=10 THEN 1 ELSE 0 END,
      CASE WHEN r.final_rank<=100 THEN 1 ELSE 0 END,
      r.final_rank, GREATEST(0, r.pnl), r.xp_awarded, r.final_rank)
    ON CONFLICT (user_id) DO UPDATE SET
      rating = public.championship_rating.rating +
        (CASE WHEN r.final_rank=1 THEN 200 WHEN r.final_rank<=3 THEN 120 WHEN r.final_rank<=10 THEN 60 WHEN r.final_rank<=100 THEN 20 ELSE 5 END),
      championships_joined = public.championship_rating.championships_joined + 1,
      championships_won = public.championship_rating.championships_won + CASE WHEN r.final_rank=1 THEN 1 ELSE 0 END,
      top3_finishes = public.championship_rating.top3_finishes + CASE WHEN r.final_rank<=3 THEN 1 ELSE 0 END,
      top10_finishes = public.championship_rating.top10_finishes + CASE WHEN r.final_rank<=10 THEN 1 ELSE 0 END,
      top100_finishes = public.championship_rating.top100_finishes + CASE WHEN r.final_rank<=100 THEN 1 ELSE 0 END,
      best_finish = LEAST(COALESCE(public.championship_rating.best_finish, r.final_rank), r.final_rank),
      highest_profit = GREATEST(public.championship_rating.highest_profit, r.pnl),
      lifetime_xp = public.championship_rating.lifetime_xp + r.xp_awarded,
      avg_rank = ((COALESCE(public.championship_rating.avg_rank,0) * public.championship_rating.championships_joined) + r.final_rank)
                 / (public.championship_rating.championships_joined + 1),
      updated_at = now();
  END LOOP;

  UPDATE public.championships SET status='completed', winner_user_id=v_winner, updated_at=now() WHERE id=_champ;
  PERFORM public.emit_championship_activity(_champ, v_winner, 'end', 'Championship ended', '{}'::jsonb, 'success');
END $function$;

-- 1. Add columns to battle_rankings and battle_results
ALTER TABLE public.battle_rankings 
ADD COLUMN IF NOT EXISTS rule_breaches_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS target_reached_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.battle_results 
ADD COLUMN IF NOT EXISTS rule_breaches_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS target_reached_at TIMESTAMP WITH TIME ZONE;

-- 2. Update recompute_battle_ranking
CREATE OR REPLACE FUNCTION public.recompute_battle_ranking(_battle_id uuid, _user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pnl NUMERIC := 0;
  v_r NUMERIC := 0;
  v_wins INTEGER := 0;
  v_total INTEGER := 0;
  v_wr NUMERIC := 0;
  v_dd NUMERIC := 0;
  v_score NUMERIC := 0;
  v_win_condition public.battle_win_condition;
  v_starting NUMERIC;
  v_running NUMERIC := 0;
  v_peak NUMERIC := 0;
  v_breach_count INTEGER := 0;
  v_target_reached_at TIMESTAMP WITH TIME ZONE := NULL;
  v_profit_target_value NUMERIC;
  r RECORD;
BEGIN
  -- Get battle config
  SELECT win_condition, starting_balance, target_value INTO v_win_condition, v_starting, v_profit_target_value
    FROM public.battles WHERE id = _battle_id;

  -- 1. Basic Stats
  SELECT
    COALESCE(SUM(pnl), 0),
    COALESCE(SUM(rr_realized), 0),
    COUNT(*) FILTER (WHERE pnl > 0),
    COUNT(*)
    INTO v_pnl, v_r, v_wins, v_total
    FROM public.paper_trades
    WHERE battle_id = _battle_id AND user_id = _user_id AND status = 'closed';

  IF v_total > 0 THEN v_wr := (v_wins::NUMERIC / v_total) * 100; END IF;

  -- 2. Max drawdown and Target Reached timestamp
  v_running := 0; v_peak := 0; v_dd := 0;
  FOR r IN
    SELECT pnl, closed_at FROM public.paper_trades
      WHERE battle_id = _battle_id AND user_id = _user_id AND status = 'closed'
      ORDER BY closed_at ASC NULLS LAST
  LOOP
    v_running := v_running + COALESCE(r.pnl, 0);
    IF v_running > v_peak THEN v_peak := v_running; END IF;
    IF (v_peak - v_running) > v_dd THEN v_dd := v_peak - v_running; END IF;
    
    -- Record target completion time if reached for the first time
    -- Only if pnl reached the target_value
    IF v_target_reached_at IS NULL AND v_profit_target_value IS NOT NULL AND v_running >= v_profit_target_value THEN
      v_target_reached_at := r.closed_at;
    END IF;
  END LOOP;

  -- 3. Rule Breaches
  -- Count 'rule_violation' events for this battle/user
  SELECT COUNT(*) INTO v_breach_count
    FROM public.battle_events
    WHERE battle_id = _battle_id AND user_id = _user_id AND event_type = 'rule_violation';

  -- 4. Scoring (Return % is the primary score for ranking)
  v_score := (v_pnl / NULLIF(v_starting, 0)) * 100;

  -- 5. Upsert ranking record
  INSERT INTO public.battle_rankings(
    battle_id, user_id, pnl, r_multiple, win_rate, trades_count, 
    max_drawdown, score, rule_breaches_count, target_reached_at, updated_at
  )
  VALUES (
    _battle_id, _user_id, v_pnl, v_r, v_wr, v_total, 
    v_dd, v_score, v_breach_count, v_target_reached_at, now()
  )
  ON CONFLICT (battle_id, user_id) DO UPDATE
    SET pnl = EXCLUDED.pnl, 
        r_multiple = EXCLUDED.r_multiple, 
        win_rate = EXCLUDED.win_rate,
        trades_count = EXCLUDED.trades_count, 
        max_drawdown = EXCLUDED.max_drawdown,
        score = EXCLUDED.score, 
        rule_breaches_count = EXCLUDED.rule_breaches_count,
        target_reached_at = EXCLUDED.target_reached_at,
        updated_at = now();

  -- 6. Authoritative Shared Ranking Logic (DENSE_RANK)
  -- Hierarchy:
  -- 1. Higher Return % (score)
  -- 2. Lower Drawdown
  -- 3. Fewer Rule Breaches
  -- 4. Earlier target_reached_at (nulls last)
  WITH ranked AS (
    SELECT br.id, DENSE_RANK() OVER (
        ORDER BY 
            score DESC, 
            max_drawdown ASC, 
            rule_breaches_count ASC,
            target_reached_at ASC NULLS LAST
    ) AS rk
    FROM public.battle_rankings br
    WHERE br.battle_id = _battle_id
  )
  UPDATE public.battle_rankings br SET rank = ranked.rk
    FROM ranked WHERE ranked.id = br.id;
END $function$;

-- 3. Update finalize_battle to ensure it uses the same recompute and stores the new columns
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
  SELECT * INTO v_battle FROM public.battles WHERE id = _battle_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Recompute everyone one last time
  FOR r IN SELECT user_id FROM public.battle_participants WHERE battle_id = _battle_id LOOP
    PERFORM public.recompute_battle_ranking(_battle_id, r.user_id);
  END LOOP;

  -- Store results with all new ranking metrics
  DELETE FROM public.battle_results WHERE battle_id = _battle_id;
  INSERT INTO public.battle_results(
    battle_id, user_id, final_rank, pnl, r_multiple, win_rate, 
    trades_count, max_drawdown, rule_breaches_count, target_reached_at,
    xp_awarded, coins_awarded, created_at
  )
  SELECT 
    battle_id, user_id, rank, pnl, r_multiple, win_rate, 
    trades_count, max_drawdown, rule_breaches_count, target_reached_at,
    CASE WHEN rank = 1 THEN 500 WHEN rank = 2 THEN 300 WHEN rank = 3 THEN 150 ELSE 50 END,
    CASE WHEN rank = 1 THEN 200 WHEN rank = 2 THEN 100 WHEN rank = 3 THEN 50 ELSE 20 END,
    now()
  FROM public.battle_rankings WHERE battle_id = _battle_id;

  SELECT user_id INTO v_winner_id FROM public.battle_results WHERE battle_id = _battle_id AND final_rank = 1 LIMIT 1;

  -- Update battle status
  UPDATE public.battles SET status = 'completed', winner_user_id = v_winner_id, updated_at = now()
    WHERE id = _battle_id;

  -- ELO Calculation
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

-- Core Battle Functions Update

-- 1. Updated join_battle
CREATE OR REPLACE FUNCTION public.join_battle(_battle_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_battle public.battles%ROWTYPE;
  v_uid UUID := auth.uid();
  v_count INTEGER;
  v_account_id UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_battle FROM public.battles WHERE id = _battle_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Battle not found'; END IF;
  
  -- Check visibility
  IF v_battle.visibility = 'private' THEN 
    -- If it's private, we expect join_battle_by_code to be used, 
    -- but for internal calls we check if the user is already a participant
    IF NOT EXISTS (SELECT 1 FROM public.battle_participants WHERE battle_id = _battle_id AND user_id = v_uid) THEN
        RAISE EXCEPTION 'Private battle — use invite code'; 
    END IF;
  END IF;

  -- Check status
  IF v_battle.status NOT IN ('draft', 'upcoming', 'open', 'filling', 'ready') THEN 
    IF NOT (v_battle.status = 'live' AND v_battle.allow_late_join) THEN
        RAISE EXCEPTION 'Battle already started and late join is disabled'; 
    END IF;
  END IF;

  -- Check capacity
  SELECT COUNT(*) INTO v_count FROM public.battle_participants WHERE battle_id = v_battle.id;
  IF v_count >= v_battle.max_participants THEN RAISE EXCEPTION 'Battle is full'; END IF;

  -- Create paper account for battle
  INSERT INTO public.paper_accounts(user_id, name, starting_balance, balance, equity, battle_id, max_trade_risk_pct, max_daily_risk_pct)
  VALUES (v_uid, 'Battle: ' || v_battle.name, v_battle.starting_balance, v_battle.starting_balance, v_battle.starting_balance,
          v_battle.id, v_battle.max_risk_pct, v_battle.max_daily_loss_pct)
  RETURNING id INTO v_account_id;

  -- Join participant
  INSERT INTO public.battle_participants(battle_id, user_id, paper_account_id, status)
  VALUES (v_battle.id, v_uid, v_account_id, 'joined')
  ON CONFLICT (battle_id, user_id) DO NOTHING;

  -- Update status from open to filling if needed
  IF v_battle.status = 'open' THEN
    UPDATE public.battles SET status = 'filling', updated_at = now() WHERE id = _battle_id;
  END IF;

  -- Check if ready (min participants)
  IF (v_count + 1) >= v_battle.min_participants AND v_battle.status = 'filling' THEN
    UPDATE public.battles SET status = 'ready', updated_at = now() WHERE id = _battle_id;
  END IF;

  RETURN v_battle.id;
END $function$;

-- 2. Updated join_battle_by_code
CREATE OR REPLACE FUNCTION public.join_battle_by_code(_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_battle_id UUID;
BEGIN
  SELECT id INTO v_battle_id FROM public.battles WHERE invite_code = _code AND status IN ('draft', 'upcoming', 'open', 'filling', 'ready');
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid invite code or battle already full'; END IF;
  RETURN public.join_battle(v_battle_id);
END $function$;

-- 3. Enhanced recompute_battle_ranking
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
  r RECORD;
BEGIN
  SELECT win_condition, starting_balance INTO v_win_condition, v_starting
    FROM public.battles WHERE id = _battle_id;

  SELECT
    COALESCE(SUM(pnl),0),
    COALESCE(SUM(rr_realized),0),
    COUNT(*) FILTER (WHERE pnl > 0),
    COUNT(*)
    INTO v_pnl, v_r, v_wins, v_total
    FROM public.paper_trades
    WHERE battle_id = _battle_id AND user_id = _user_id AND status = 'closed';

  IF v_total > 0 THEN v_wr := (v_wins::NUMERIC / v_total) * 100; END IF;

  -- Max drawdown from running equity
  v_running := 0; v_peak := 0; v_dd := 0;
  FOR r IN
    SELECT pnl FROM public.paper_trades
      WHERE battle_id = _battle_id AND user_id = _user_id AND status = 'closed'
      ORDER BY closed_at ASC NULLS LAST
  LOOP
    v_running := v_running + COALESCE(r.pnl, 0);
    IF v_running > v_peak THEN v_peak := v_running; END IF;
    IF (v_peak - v_running) > v_dd THEN v_dd := v_peak - v_running; END IF;
  END LOOP;

  v_score := CASE v_win_condition
    WHEN 'highest_pnl'     THEN v_pnl
    WHEN 'highest_r'       THEN v_r
    WHEN 'highest_winrate' THEN v_wr
    WHEN 'lowest_dd'       THEN -v_dd
    WHEN 'first_to_5r'     THEN v_r
    WHEN 'first_to_target' THEN v_pnl
    WHEN 'consistency'     THEN v_wr - (v_dd / NULLIF(v_starting,0) * 100)
    ELSE v_pnl
  END;

  INSERT INTO public.battle_rankings(battle_id, user_id, pnl, r_multiple, win_rate, trades_count, max_drawdown, score, updated_at)
  VALUES (_battle_id, _user_id, v_pnl, v_r, v_wr, v_total, v_dd, v_score, now())
  ON CONFLICT (battle_id, user_id) DO UPDATE
    SET pnl = EXCLUDED.pnl, r_multiple = EXCLUDED.r_multiple, win_rate = EXCLUDED.win_rate,
        trades_count = EXCLUDED.trades_count, max_drawdown = EXCLUDED.max_drawdown,
        score = EXCLUDED.score, updated_at = now();

  -- Re-rank all participants with proper tie-breakers
  WITH ranked AS (
    SELECT br.id, ROW_NUMBER() OVER (
        ORDER BY 
            score DESC, 
            pnl DESC, 
            max_drawdown ASC, 
            trades_count ASC -- Fewer trades as tie-breaker for efficiency
    ) AS rk
    FROM public.battle_rankings br
    WHERE br.battle_id = _battle_id
  )
  UPDATE public.battle_rankings br SET rank = ranked.rk
    FROM ranked WHERE ranked.id = br.id;
END $function$;

-- 4. Updated finalize_battle with ELO logic
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
  v_ranked_count INTEGER;
BEGIN
  SELECT * INTO v_battle FROM public.battles WHERE id = _battle_id;
  IF NOT FOUND THEN RETURN; END IF;

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

  -- Update battle status
  UPDATE public.battles SET status = 'completed', winner_user_id = v_winner_id, updated_at = now()
    WHERE id = _battle_id;

  -- ELO Calculation for Ranked Battles
  IF v_battle.ranked THEN
    -- Simplify: For now, winner gets +25, 2nd gets +10, others get -5 if they lost or didn't participate well
    -- In a real ELO system, this would be pairwise comparison
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

-- 5. Updated tick_battles
CREATE OR REPLACE FUNCTION public.tick_battles()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE 
  r RECORD;
BEGIN
  -- upcoming -> open (within 1 hour)
  UPDATE public.battles SET status = 'open', updated_at = now()
    WHERE status = 'upcoming' AND start_at <= (now() + interval '1 hour');

  -- open -> filling (when joined handled in join_battle)

  -- ready -> countdown (within 30 seconds)
  UPDATE public.battles SET status = 'countdown', countdown_started_at = now(), updated_at = now()
    WHERE status = 'ready' AND start_at <= (now() + interval '30 seconds');

  -- countdown -> live (after 10s)
  UPDATE public.battles SET status = 'live', updated_at = now()
    WHERE status = 'countdown' AND countdown_started_at <= (now() - interval '10 seconds');

  -- live -> completed (handle finalized)
  FOR r IN SELECT id FROM public.battles WHERE status = 'live' AND end_at <= now() LOOP
    PERFORM public.finalize_battle(r.id);
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
        
      -- Create Battle
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
      
      -- Join both users
      -- We need to mock auth context for public.join_battle or just insert manually
      -- Since this is inside tick_battles (service role), we can insert manually
      -- Actually, we'll just remove them from queue and they will see the notification
      DELETE FROM public.matchmaking_queue WHERE user_id IN (v_user_1, v_user_2);
      
      INSERT INTO public.battle_notifications(user_id, kind, title, body, battle_id)
      VALUES 
        (v_user_1, 'match_found', 'Match Found!', 'Your battle arena is ready.', v_battle_id),
        (v_user_2, 'match_found', 'Match Found!', 'Your battle arena is ready.', v_battle_id);
    END;
  END LOOP;
END $function$;

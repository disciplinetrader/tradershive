-- Update recompute_battle_ranking with Return % primary logic and authoritative tie-breakers
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

  -- Scoring now strictly based on Return % (or specific win condition)
  v_score := CASE v_win_condition
    WHEN 'highest_pnl'     THEN (v_pnl / NULLIF(v_starting, 0)) * 100
    WHEN 'highest_r'       THEN v_r
    WHEN 'highest_winrate' THEN v_wr
    WHEN 'lowest_dd'       THEN -(v_dd / NULLIF(v_starting, 0) * 100)
    WHEN 'first_to_5r'     THEN v_r
    WHEN 'first_to_target' THEN (v_pnl / NULLIF(v_starting, 0)) * 100
    WHEN 'consistency'     THEN v_wr - (v_dd / NULLIF(v_starting,0) * 100)
    ELSE (v_pnl / NULLIF(v_starting, 0)) * 100
  END;

  INSERT INTO public.battle_rankings(battle_id, user_id, pnl, r_multiple, win_rate, trades_count, max_drawdown, score, updated_at)
  VALUES (_battle_id, _user_id, v_pnl, v_r, v_wr, v_total, v_dd, v_score, now())
  ON CONFLICT (battle_id, user_id) DO UPDATE
    SET pnl = EXCLUDED.pnl, r_multiple = EXCLUDED.r_multiple, win_rate = EXCLUDED.win_rate,
        trades_count = EXCLUDED.trades_count, max_drawdown = EXCLUDED.max_drawdown,
        score = EXCLUDED.score, updated_at = now();

  -- Re-rank all participants with exact server-authoritative tie-breakers:
  -- 1. Score (Return %)
  -- 2. Lower Drawdown
  -- 3. Fewer Trades (efficient consistency)
  -- 4. Earlier valid update (Time)
  WITH ranked AS (
    SELECT br.id, ROW_NUMBER() OVER (
        ORDER BY 
            score DESC, 
            max_drawdown ASC, 
            trades_count ASC,
            updated_at ASC
    ) AS rk
    FROM public.battle_rankings br
    WHERE br.battle_id = _battle_id
  )
  UPDATE public.battle_rankings br SET rank = ranked.rk
    FROM ranked WHERE ranked.id = br.id;
END $function$;

-- ============================================================
-- BATTLE ARENA MODULE
-- ============================================================

-- Enums
DO $$ BEGIN
  CREATE TYPE public.battle_status AS ENUM ('draft','upcoming','live','completed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.battle_visibility AS ENUM ('public','private');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.battle_type_kind AS ENUM ('1v1','2v2','ffa5','ffa10');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.battle_win_condition AS ENUM (
    'highest_pnl','highest_r','highest_winrate','lowest_dd',
    'first_to_5r','first_to_target','consistency'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.battle_market AS ENUM ('crypto','forex','indices','metals','mixed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.battle_participant_status AS ENUM ('joined','active','disqualified','finished');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- battle_templates
-- ============================================================
CREATE TABLE IF NOT EXISTS public.battle_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  battle_type public.battle_type_kind NOT NULL DEFAULT 'ffa5',
  market public.battle_market NOT NULL DEFAULT 'crypto',
  allowed_symbols TEXT[] NOT NULL DEFAULT '{}',
  starting_balance NUMERIC(18,2) NOT NULL DEFAULT 10000,
  max_risk_pct NUMERIC(6,3) NOT NULL DEFAULT 2,
  max_daily_loss_pct NUMERIC(6,3) NOT NULL DEFAULT 5,
  max_drawdown_pct NUMERIC(6,3) NOT NULL DEFAULT 10,
  max_trades INTEGER,
  win_condition public.battle_win_condition NOT NULL DEFAULT 'highest_pnl',
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  is_public BOOLEAN NOT NULL DEFAULT true,
  is_official BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.battle_templates TO authenticated;
GRANT ALL ON public.battle_templates TO service_role;
ALTER TABLE public.battle_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "battle_templates read" ON public.battle_templates FOR SELECT TO authenticated
  USING (is_public OR is_official OR owner_id = auth.uid());
CREATE POLICY "battle_templates own write" ON public.battle_templates FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "battle_templates admin all" ON public.battle_templates FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE TRIGGER trg_battle_templates_updated BEFORE UPDATE ON public.battle_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- battles
-- ============================================================
CREATE TABLE IF NOT EXISTS public.battles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  visibility public.battle_visibility NOT NULL DEFAULT 'public',
  invite_code TEXT UNIQUE,
  battle_type public.battle_type_kind NOT NULL DEFAULT 'ffa5',
  market public.battle_market NOT NULL DEFAULT 'crypto',
  allowed_symbols TEXT[] NOT NULL DEFAULT '{}',
  starting_balance NUMERIC(18,2) NOT NULL DEFAULT 10000,
  max_risk_pct NUMERIC(6,3) NOT NULL DEFAULT 2,
  max_daily_loss_pct NUMERIC(6,3) NOT NULL DEFAULT 5,
  max_drawdown_pct NUMERIC(6,3) NOT NULL DEFAULT 10,
  max_trades INTEGER,
  win_condition public.battle_win_condition NOT NULL DEFAULT 'highest_pnl',
  target_value NUMERIC(18,4),
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  status public.battle_status NOT NULL DEFAULT 'upcoming',
  max_participants INTEGER NOT NULL DEFAULT 10,
  featured BOOLEAN NOT NULL DEFAULT false,
  winner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.battles TO authenticated;
GRANT ALL ON public.battles TO service_role;
ALTER TABLE public.battles ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_battles_status ON public.battles(status);
CREATE INDEX IF NOT EXISTS idx_battles_start ON public.battles(start_at);
CREATE INDEX IF NOT EXISTS idx_battles_host ON public.battles(host_id);
CREATE TRIGGER trg_battles_updated BEFORE UPDATE ON public.battles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Read policies added after participants table exists (needs forward ref via function)
-- Insert: host only
CREATE POLICY "battles insert host" ON public.battles FOR INSERT TO authenticated
  WITH CHECK (host_id = auth.uid());
-- Update: host pre-live OR admin
CREATE POLICY "battles update host" ON public.battles FOR UPDATE TO authenticated
  USING (host_id = auth.uid() OR public.is_platform_admin(auth.uid()))
  WITH CHECK (host_id = auth.uid() OR public.is_platform_admin(auth.uid()));
CREATE POLICY "battles delete host" ON public.battles FOR DELETE TO authenticated
  USING ((host_id = auth.uid() AND status IN ('draft','upcoming','cancelled')) OR public.is_platform_admin(auth.uid()));

-- ============================================================
-- battle_participants
-- ============================================================
CREATE TABLE IF NOT EXISTS public.battle_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id UUID NOT NULL REFERENCES public.battles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team TEXT,
  paper_account_id UUID REFERENCES public.paper_accounts(id) ON DELETE SET NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ,
  status public.battle_participant_status NOT NULL DEFAULT 'joined',
  UNIQUE(battle_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.battle_participants TO authenticated;
GRANT ALL ON public.battle_participants TO service_role;
ALTER TABLE public.battle_participants ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_bp_battle ON public.battle_participants(battle_id);
CREATE INDEX IF NOT EXISTS idx_bp_user ON public.battle_participants(user_id);

-- Helper: user is a participant of a battle (SECURITY DEFINER to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.is_battle_participant(_battle_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.battle_participants WHERE battle_id=_battle_id AND user_id=_user_id)
$$;

CREATE OR REPLACE FUNCTION public.is_battle_host(_battle_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.battles WHERE id=_battle_id AND host_id=_user_id)
$$;

-- Now the battles SELECT policy
CREATE POLICY "battles read" ON public.battles FOR SELECT TO authenticated
  USING (
    visibility = 'public'
    OR host_id = auth.uid()
    OR public.is_battle_participant(id, auth.uid())
    OR public.is_platform_admin(auth.uid())
  );

-- battle_participants policies
CREATE POLICY "bp read" ON public.battle_participants FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_battle_host(battle_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.battles b WHERE b.id = battle_id AND b.visibility='public')
    OR public.is_platform_admin(auth.uid())
  );
CREATE POLICY "bp insert self" ON public.battle_participants FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "bp update self or host" ON public.battle_participants FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_battle_host(battle_id, auth.uid()) OR public.is_platform_admin(auth.uid()));
CREATE POLICY "bp delete self or host" ON public.battle_participants FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_battle_host(battle_id, auth.uid()) OR public.is_platform_admin(auth.uid()));

-- ============================================================
-- battle_rankings
-- ============================================================
CREATE TABLE IF NOT EXISTS public.battle_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id UUID NOT NULL REFERENCES public.battles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL DEFAULT 0,
  pnl NUMERIC(18,2) NOT NULL DEFAULT 0,
  r_multiple NUMERIC(10,3) NOT NULL DEFAULT 0,
  win_rate NUMERIC(6,3) NOT NULL DEFAULT 0,
  trades_count INTEGER NOT NULL DEFAULT 0,
  max_drawdown NUMERIC(18,2) NOT NULL DEFAULT 0,
  score NUMERIC(18,4) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(battle_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.battle_rankings TO authenticated;
GRANT ALL ON public.battle_rankings TO service_role;
ALTER TABLE public.battle_rankings ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_br_battle ON public.battle_rankings(battle_id);
CREATE POLICY "br read" ON public.battle_rankings FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.battles b WHERE b.id = battle_id AND (b.visibility='public' OR b.host_id=auth.uid()))
    OR user_id = auth.uid()
    OR public.is_battle_participant(battle_id, auth.uid())
    OR public.is_platform_admin(auth.uid())
  );

-- ============================================================
-- battle_results
-- ============================================================
CREATE TABLE IF NOT EXISTS public.battle_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id UUID NOT NULL REFERENCES public.battles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  final_rank INTEGER NOT NULL,
  pnl NUMERIC(18,2) NOT NULL DEFAULT 0,
  r_multiple NUMERIC(10,3) NOT NULL DEFAULT 0,
  win_rate NUMERIC(6,3) NOT NULL DEFAULT 0,
  trades_count INTEGER NOT NULL DEFAULT 0,
  max_drawdown NUMERIC(18,2) NOT NULL DEFAULT 0,
  xp_awarded INTEGER NOT NULL DEFAULT 0,
  coins_awarded INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(battle_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.battle_results TO authenticated;
GRANT ALL ON public.battle_results TO service_role;
ALTER TABLE public.battle_results ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_bres_battle ON public.battle_results(battle_id);
CREATE POLICY "bres read" ON public.battle_results FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.battles b WHERE b.id = battle_id AND (b.visibility='public' OR b.host_id=auth.uid()))
    OR user_id = auth.uid()
    OR public.is_battle_participant(battle_id, auth.uid())
    OR public.is_platform_admin(auth.uid())
  );

-- ============================================================
-- battle_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.battle_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id UUID NOT NULL REFERENCES public.battles(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.battle_logs TO authenticated;
GRANT ALL ON public.battle_logs TO service_role;
ALTER TABLE public.battle_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_blogs_battle ON public.battle_logs(battle_id);
CREATE POLICY "blogs read" ON public.battle_logs FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_battle_host(battle_id, auth.uid())
    OR public.is_platform_admin(auth.uid())
  );

-- ============================================================
-- battle_notifications
-- ============================================================
CREATE TABLE IF NOT EXISTS public.battle_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id UUID NOT NULL REFERENCES public.battles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.battle_notifications TO authenticated;
GRANT ALL ON public.battle_notifications TO service_role;
ALTER TABLE public.battle_notifications ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_bnot_user ON public.battle_notifications(user_id, read_at);
CREATE POLICY "bnot own" ON public.battle_notifications FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================
-- Extend paper_accounts + paper_trades with battle_id
-- ============================================================
ALTER TABLE public.paper_accounts ADD COLUMN IF NOT EXISTS battle_id UUID REFERENCES public.battles(id) ON DELETE SET NULL;
ALTER TABLE public.paper_trades ADD COLUMN IF NOT EXISTS battle_id UUID REFERENCES public.battles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_paper_trades_battle ON public.paper_trades(battle_id) WHERE battle_id IS NOT NULL;

-- Auto-tag trades with battle_id from account
CREATE OR REPLACE FUNCTION public.set_trade_battle_id_from_account()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b UUID;
BEGIN
  IF NEW.battle_id IS NULL AND NEW.account_id IS NOT NULL THEN
    SELECT battle_id INTO b FROM public.paper_accounts WHERE id = NEW.account_id;
    IF b IS NOT NULL THEN NEW.battle_id := b; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_set_trade_battle_id ON public.paper_trades;
CREATE TRIGGER trg_set_trade_battle_id BEFORE INSERT ON public.paper_trades
  FOR EACH ROW EXECUTE FUNCTION public.set_trade_battle_id_from_account();

-- Enforce battle rules on trade insert
CREATE OR REPLACE FUNCTION public.enforce_battle_rules_on_trade()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b RECORD;
BEGIN
  IF NEW.battle_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO b FROM public.battles WHERE id = NEW.battle_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF b.status <> 'live' THEN
    INSERT INTO public.battle_logs(battle_id, user_id, event_type, message, metadata)
    VALUES (b.id, NEW.user_id, 'rule_violation', 'Battle not live', jsonb_build_object('status', b.status));
    RAISE EXCEPTION 'Battle is not live (status=%). Trade rejected.', b.status;
  END IF;

  IF NEW.opened_at IS NOT NULL AND (NEW.opened_at < b.start_at OR NEW.opened_at > b.end_at) THEN
    INSERT INTO public.battle_logs(battle_id, user_id, event_type, message)
    VALUES (b.id, NEW.user_id, 'rule_violation', 'Trade outside battle time window');
    RAISE EXCEPTION 'Trade outside battle time window.';
  END IF;

  IF array_length(b.allowed_symbols, 1) IS NOT NULL AND array_length(b.allowed_symbols, 1) > 0 THEN
    IF NOT (NEW.symbol = ANY(b.allowed_symbols)) THEN
      INSERT INTO public.battle_logs(battle_id, user_id, event_type, message, metadata)
      VALUES (b.id, NEW.user_id, 'rule_violation', 'Symbol not allowed', jsonb_build_object('symbol', NEW.symbol));
      RAISE EXCEPTION 'Symbol % not allowed in this battle.', NEW.symbol;
    END IF;
  END IF;

  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_enforce_battle_rules ON public.paper_trades;
CREATE TRIGGER trg_enforce_battle_rules BEFORE INSERT ON public.paper_trades
  FOR EACH ROW EXECUTE FUNCTION public.enforce_battle_rules_on_trade();

-- ============================================================
-- Recompute rankings when a battle trade closes
-- ============================================================
CREATE OR REPLACE FUNCTION public.recompute_battle_ranking(_battle_id UUID, _user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  -- Re-rank all participants
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY score DESC, pnl DESC) AS rk
      FROM public.battle_rankings WHERE battle_id = _battle_id
  )
  UPDATE public.battle_rankings br SET rank = ranked.rk
    FROM ranked WHERE ranked.id = br.id;
END $$;

CREATE OR REPLACE FUNCTION public.trg_recompute_battle_ranking()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.battle_id IS NOT NULL AND NEW.status = 'closed'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status
          OR OLD.pnl IS DISTINCT FROM NEW.pnl) THEN
    PERFORM public.recompute_battle_ranking(NEW.battle_id, NEW.user_id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_paper_trades_battle_ranking ON public.paper_trades;
CREATE TRIGGER trg_paper_trades_battle_ranking AFTER INSERT OR UPDATE ON public.paper_trades
  FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_battle_ranking();

-- ============================================================
-- join_battle_by_code (SECURITY DEFINER — private battles)
-- ============================================================
CREATE OR REPLACE FUNCTION public.join_battle_by_code(_code TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_battle public.battles%ROWTYPE;
  v_uid UUID := auth.uid();
  v_count INTEGER;
  v_account_id UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_battle FROM public.battles WHERE invite_code = _code;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid invite code'; END IF;
  IF v_battle.status NOT IN ('draft','upcoming') THEN
    RAISE EXCEPTION 'Battle already started';
  END IF;
  SELECT COUNT(*) INTO v_count FROM public.battle_participants WHERE battle_id = v_battle.id;
  IF v_count >= v_battle.max_participants THEN RAISE EXCEPTION 'Battle is full'; END IF;

  -- Create battle paper account
  INSERT INTO public.paper_accounts(user_id, name, starting_balance, balance, equity, battle_id, max_trade_risk_pct, max_daily_risk_pct)
  VALUES (v_uid, 'Battle: ' || v_battle.name, v_battle.starting_balance, v_battle.starting_balance, v_battle.starting_balance,
          v_battle.id, v_battle.max_risk_pct, v_battle.max_daily_loss_pct)
  RETURNING id INTO v_account_id;

  INSERT INTO public.battle_participants(battle_id, user_id, paper_account_id, status)
  VALUES (v_battle.id, v_uid, v_account_id, 'joined')
  ON CONFLICT (battle_id, user_id) DO NOTHING;

  RETURN v_battle.id;
END $$;

-- ============================================================
-- join_battle (public battles)
-- ============================================================
CREATE OR REPLACE FUNCTION public.join_battle(_battle_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_battle public.battles%ROWTYPE;
  v_uid UUID := auth.uid();
  v_count INTEGER;
  v_account_id UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_battle FROM public.battles WHERE id = _battle_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Battle not found'; END IF;
  IF v_battle.visibility = 'private' THEN RAISE EXCEPTION 'Private battle — use invite code'; END IF;
  IF v_battle.status NOT IN ('draft','upcoming') THEN RAISE EXCEPTION 'Battle already started'; END IF;
  SELECT COUNT(*) INTO v_count FROM public.battle_participants WHERE battle_id = v_battle.id;
  IF v_count >= v_battle.max_participants THEN RAISE EXCEPTION 'Battle is full'; END IF;

  INSERT INTO public.paper_accounts(user_id, name, starting_balance, balance, equity, battle_id, max_trade_risk_pct, max_daily_risk_pct)
  VALUES (v_uid, 'Battle: ' || v_battle.name, v_battle.starting_balance, v_battle.starting_balance, v_battle.starting_balance,
          v_battle.id, v_battle.max_risk_pct, v_battle.max_daily_loss_pct)
  RETURNING id INTO v_account_id;

  INSERT INTO public.battle_participants(battle_id, user_id, paper_account_id, status)
  VALUES (v_battle.id, v_uid, v_account_id, 'joined')
  ON CONFLICT (battle_id, user_id) DO NOTHING;

  RETURN v_battle.id;
END $$;

-- ============================================================
-- finalize_battle
-- ============================================================
CREATE OR REPLACE FUNCTION public.finalize_battle(_battle_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
  v_winner UUID;
  v_xp INTEGER;
  v_coins INTEGER;
BEGIN
  -- Ensure rankings are fresh
  FOR r IN SELECT user_id FROM public.battle_participants WHERE battle_id = _battle_id LOOP
    PERFORM public.recompute_battle_ranking(_battle_id, r.user_id);
  END LOOP;

  -- Write results
  DELETE FROM public.battle_results WHERE battle_id = _battle_id;
  INSERT INTO public.battle_results(battle_id, user_id, final_rank, pnl, r_multiple, win_rate, trades_count, max_drawdown, xp_awarded, coins_awarded)
  SELECT battle_id, user_id, rank, pnl, r_multiple, win_rate, trades_count, max_drawdown,
    CASE WHEN rank = 1 THEN 200 WHEN rank = 2 THEN 100 WHEN rank = 3 THEN 50 ELSE 25 END,
    CASE WHEN rank = 1 THEN 100 WHEN rank = 2 THEN 50 WHEN rank = 3 THEN 25 ELSE 10 END
  FROM public.battle_rankings WHERE battle_id = _battle_id;

  SELECT user_id INTO v_winner FROM public.battle_results WHERE battle_id = _battle_id AND final_rank = 1 LIMIT 1;

  UPDATE public.battles SET status = 'completed', winner_user_id = v_winner, updated_at = now()
    WHERE id = _battle_id;

  -- Award XP + notifications
  FOR r IN SELECT * FROM public.battle_results WHERE battle_id = _battle_id LOOP
    INSERT INTO public.xp_transactions(user_id, amount, reason, metadata)
    VALUES (r.user_id, r.xp_awarded, 'battle_finish',
            jsonb_build_object('battle_id', _battle_id, 'rank', r.final_rank));
    INSERT INTO public.coin_transactions(user_id, amount, reason, metadata)
    VALUES (r.user_id, r.coins_awarded, 'battle_finish',
            jsonb_build_object('battle_id', _battle_id, 'rank', r.final_rank));
    INSERT INTO public.battle_notifications(battle_id, user_id, kind, title, body)
    VALUES (_battle_id, r.user_id, 'battle_ended',
            'Battle ended — you finished #' || r.final_rank,
            'You earned ' || r.xp_awarded || ' XP and ' || r.coins_awarded || ' coins.');
  END LOOP;
END $$;

-- ============================================================
-- tick_battles — status transitions
-- ============================================================
CREATE OR REPLACE FUNCTION public.tick_battles()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD;
BEGIN
  UPDATE public.battles SET status = 'live', updated_at = now()
    WHERE status = 'upcoming' AND start_at <= now() AND end_at > now();
  FOR r IN SELECT id FROM public.battles WHERE status = 'live' AND end_at <= now() LOOP
    PERFORM public.finalize_battle(r.id);
  END LOOP;
END $$;

-- ============================================================
-- Realtime
-- ============================================================
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.battles;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.battle_participants;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.battle_rankings;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.battle_notifications;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seed a couple of official templates
INSERT INTO public.battle_templates (owner_id, name, description, battle_type, market, allowed_symbols, starting_balance, max_risk_pct, max_daily_loss_pct, max_drawdown_pct, win_condition, duration_minutes, is_public, is_official)
VALUES
  (NULL, 'Crypto Blitz 1H', 'Fast 1-hour BTC/ETH sprint.', 'ffa5', 'crypto', ARRAY['BTC/USDT','ETH/USDT','SOL/USDT'], 10000, 2, 5, 10, 'highest_pnl', 60, true, true),
  (NULL, 'FX Precision', 'Highest R-multiple wins.', '1v1', 'forex', ARRAY['EUR/USD','GBP/USD','USD/JPY','XAU/USD'], 10000, 1, 3, 8, 'highest_r', 120, true, true),
  (NULL, 'Discipline Duel', 'Lowest drawdown wins.', '2v2', 'mixed', ARRAY['BTC/USDT','ETH/USDT','EUR/USD','XAU/USD','SPX500'], 10000, 1.5, 4, 6, 'lowest_dd', 180, true, true)
ON CONFLICT DO NOTHING;

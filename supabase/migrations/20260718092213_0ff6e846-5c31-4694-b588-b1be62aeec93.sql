
-- ============= ENUMS =============
DO $$ BEGIN CREATE TYPE public.championship_status AS ENUM ('draft','registration','upcoming','live','grading','completed','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.championship_win_condition AS ENUM ('highest_pnl','highest_r','highest_winrate','lowest_dd','profit_factor','consistency','composite'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.championship_participant_status AS ENUM ('registered','active','disqualified','withdrawn','completed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.championship_activity_kind AS ENUM ('registration','start','end','rank_up','rank_down','top10','top3','new_leader','milestone','achievement','rule_violation','disqualified','reward'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============= TEMPLATES =============
CREATE TABLE IF NOT EXISTS public.championship_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  starting_balance NUMERIC NOT NULL DEFAULT 100000,
  max_daily_loss_pct NUMERIC NOT NULL DEFAULT 5,
  max_drawdown_pct NUMERIC NOT NULL DEFAULT 10,
  max_risk_per_trade_pct NUMERIC NOT NULL DEFAULT 2,
  allowed_markets TEXT[] NOT NULL DEFAULT ARRAY['crypto','forex','indices','metals']::TEXT[],
  allowed_symbols TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  allowed_sessions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  min_trades INTEGER NOT NULL DEFAULT 10,
  win_condition public.championship_win_condition NOT NULL DEFAULT 'composite',
  prize_info JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.championship_templates TO authenticated;
GRANT ALL ON public.championship_templates TO service_role;
ALTER TABLE public.championship_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read templates" ON public.championship_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage templates" ON public.championship_templates FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

-- ============= CHAMPIONSHIPS =============
CREATE TABLE IF NOT EXISTS public.championships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  banner_url TEXT,
  season_year INTEGER NOT NULL,
  season_month INTEGER NOT NULL CHECK (season_month BETWEEN 1 AND 12),
  status public.championship_status NOT NULL DEFAULT 'draft',
  template_id UUID REFERENCES public.championship_templates(id) ON DELETE SET NULL,
  starting_balance NUMERIC NOT NULL DEFAULT 100000,
  max_daily_loss_pct NUMERIC NOT NULL DEFAULT 5,
  max_drawdown_pct NUMERIC NOT NULL DEFAULT 10,
  max_risk_per_trade_pct NUMERIC NOT NULL DEFAULT 2,
  allowed_markets TEXT[] NOT NULL DEFAULT ARRAY['crypto','forex','indices','metals']::TEXT[],
  allowed_symbols TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  allowed_sessions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  min_trades INTEGER NOT NULL DEFAULT 10,
  win_condition public.championship_win_condition NOT NULL DEFAULT 'composite',
  prize_info JSONB NOT NULL DEFAULT '{}'::jsonb,
  registration_opens_at TIMESTAMPTZ NOT NULL,
  registration_closes_at TIMESTAMPTZ NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  winner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (season_year, season_month)
);
CREATE INDEX IF NOT EXISTS championships_status_idx ON public.championships(status);
CREATE INDEX IF NOT EXISTS championships_time_idx ON public.championships(start_at, end_at);
GRANT SELECT ON public.championships TO authenticated;
GRANT ALL ON public.championships TO service_role;
ALTER TABLE public.championships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read championships" ON public.championships FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage championships" ON public.championships FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

-- ============= REGISTRATIONS =============
CREATE TABLE IF NOT EXISTS public.championship_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id UUID NOT NULL REFERENCES public.championships(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  accepted_rules_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (championship_id, user_id)
);
CREATE INDEX IF NOT EXISTS champ_reg_user_idx ON public.championship_registrations(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.championship_registrations TO authenticated;
GRANT ALL ON public.championship_registrations TO service_role;
ALTER TABLE public.championship_registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own registrations read" ON public.championship_registrations FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_platform_admin(auth.uid()));
CREATE POLICY "own registrations manage" ON public.championship_registrations FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============= PARTICIPANTS =============
CREATE TABLE IF NOT EXISTS public.championship_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id UUID NOT NULL REFERENCES public.championships(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  paper_account_id UUID REFERENCES public.paper_accounts(id) ON DELETE SET NULL,
  status public.championship_participant_status NOT NULL DEFAULT 'active',
  disqualified_reason TEXT,
  disqualified_at TIMESTAMPTZ,
  flagged BOOLEAN NOT NULL DEFAULT false,
  flag_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (championship_id, user_id)
);
CREATE INDEX IF NOT EXISTS champ_participants_champ_idx ON public.championship_participants(championship_id);
CREATE INDEX IF NOT EXISTS champ_participants_user_idx ON public.championship_participants(user_id);
GRANT SELECT ON public.championship_participants TO authenticated;
GRANT ALL ON public.championship_participants TO service_role;
ALTER TABLE public.championship_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read participants" ON public.championship_participants FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage participants" ON public.championship_participants FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

-- ============= RANKINGS =============
CREATE TABLE IF NOT EXISTS public.championship_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id UUID NOT NULL REFERENCES public.championships(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rank INTEGER,
  previous_rank INTEGER,
  pnl NUMERIC NOT NULL DEFAULT 0,
  net_profit NUMERIC NOT NULL DEFAULT 0,
  r_multiple NUMERIC NOT NULL DEFAULT 0,
  win_rate NUMERIC NOT NULL DEFAULT 0,
  profit_factor NUMERIC NOT NULL DEFAULT 0,
  avg_rr NUMERIC NOT NULL DEFAULT 0,
  max_drawdown NUMERIC NOT NULL DEFAULT 0,
  consistency_score NUMERIC NOT NULL DEFAULT 0,
  total_trades INTEGER NOT NULL DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,
  last_trade_at TIMESTAMPTZ,
  score NUMERIC NOT NULL DEFAULT 0,
  eligible BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (championship_id, user_id)
);
CREATE INDEX IF NOT EXISTS champ_rank_idx ON public.championship_rankings(championship_id, rank);
GRANT SELECT ON public.championship_rankings TO authenticated;
GRANT ALL ON public.championship_rankings TO service_role;
ALTER TABLE public.championship_rankings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read rankings" ON public.championship_rankings FOR SELECT TO authenticated USING (true);

-- ============= RESULTS =============
CREATE TABLE IF NOT EXISTS public.championship_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id UUID NOT NULL REFERENCES public.championships(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  final_rank INTEGER NOT NULL,
  pnl NUMERIC NOT NULL DEFAULT 0,
  r_multiple NUMERIC NOT NULL DEFAULT 0,
  win_rate NUMERIC NOT NULL DEFAULT 0,
  profit_factor NUMERIC NOT NULL DEFAULT 0,
  max_drawdown NUMERIC NOT NULL DEFAULT 0,
  consistency_score NUMERIC NOT NULL DEFAULT 0,
  total_trades INTEGER NOT NULL DEFAULT 0,
  score NUMERIC NOT NULL DEFAULT 0,
  xp_awarded INTEGER NOT NULL DEFAULT 0,
  coins_awarded INTEGER NOT NULL DEFAULT 0,
  title_awarded TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (championship_id, user_id)
);
CREATE INDEX IF NOT EXISTS champ_results_rank_idx ON public.championship_results(championship_id, final_rank);
GRANT SELECT ON public.championship_results TO authenticated;
GRANT ALL ON public.championship_results TO service_role;
ALTER TABLE public.championship_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read results" ON public.championship_results FOR SELECT TO authenticated USING (true);

-- ============= REWARDS =============
CREATE TABLE IF NOT EXISTS public.championship_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id UUID NOT NULL REFERENCES public.championships(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  coins INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS champ_rewards_user_idx ON public.championship_rewards(user_id);
GRANT SELECT ON public.championship_rewards TO authenticated;
GRANT ALL ON public.championship_rewards TO service_role;
ALTER TABLE public.championship_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own rewards" ON public.championship_rewards FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_platform_admin(auth.uid()));

-- ============= RATING =============
CREATE TABLE IF NOT EXISTS public.championship_rating (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  rating NUMERIC NOT NULL DEFAULT 1000,
  championships_joined INTEGER NOT NULL DEFAULT 0,
  championships_won INTEGER NOT NULL DEFAULT 0,
  top3_finishes INTEGER NOT NULL DEFAULT 0,
  top10_finishes INTEGER NOT NULL DEFAULT 0,
  top100_finishes INTEGER NOT NULL DEFAULT 0,
  best_finish INTEGER,
  highest_profit NUMERIC NOT NULL DEFAULT 0,
  lifetime_xp INTEGER NOT NULL DEFAULT 0,
  avg_rank NUMERIC,
  sportsmanship_score NUMERIC NOT NULL DEFAULT 100,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.championship_rating TO authenticated;
GRANT ALL ON public.championship_rating TO service_role;
ALTER TABLE public.championship_rating ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read rating" ON public.championship_rating FOR SELECT TO authenticated USING (true);

-- ============= HALL OF FAME =============
CREATE TABLE IF NOT EXISTS public.championship_hall_of_fame (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id UUID NOT NULL UNIQUE REFERENCES public.championships(id) ON DELETE CASCADE,
  champion_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  runner_up_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  third_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  top10_user_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  winning_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  strategy_summary TEXT,
  finalized_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.championship_hall_of_fame TO authenticated;
GRANT ALL ON public.championship_hall_of_fame TO service_role;
ALTER TABLE public.championship_hall_of_fame ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read hall of fame" ON public.championship_hall_of_fame FOR SELECT TO authenticated USING (true);

-- ============= ACTIVITY =============
CREATE TABLE IF NOT EXISTS public.championship_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id UUID NOT NULL REFERENCES public.championships(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  kind public.championship_activity_kind NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  severity TEXT NOT NULL DEFAULT 'info',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS champ_activity_champ_idx ON public.championship_activity(championship_id, created_at DESC);
GRANT SELECT ON public.championship_activity TO authenticated;
GRANT ALL ON public.championship_activity TO service_role;
ALTER TABLE public.championship_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read activity" ON public.championship_activity FOR SELECT TO authenticated USING (true);

-- ============= PAPER_TRADES link to championship =============
ALTER TABLE public.paper_trades ADD COLUMN IF NOT EXISTS championship_id UUID REFERENCES public.championships(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS paper_trades_champ_idx ON public.paper_trades(championship_id);
ALTER TABLE public.paper_accounts ADD COLUMN IF NOT EXISTS championship_id UUID REFERENCES public.championships(id) ON DELETE SET NULL;

-- ============= updated_at triggers =============
DROP TRIGGER IF EXISTS trg_champ_upd ON public.championships;
CREATE TRIGGER trg_champ_upd BEFORE UPDATE ON public.championships FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_champ_tpl_upd ON public.championship_templates;
CREATE TRIGGER trg_champ_tpl_upd BEFORE UPDATE ON public.championship_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_champ_part_upd ON public.championship_participants;
CREATE TRIGGER trg_champ_part_upd BEFORE UPDATE ON public.championship_participants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= HELPER: emit activity =============
CREATE OR REPLACE FUNCTION public.emit_championship_activity(_champ UUID, _user UUID, _kind public.championship_activity_kind, _msg TEXT, _meta JSONB DEFAULT '{}'::jsonb, _sev TEXT DEFAULT 'info')
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.championship_activity(championship_id, user_id, kind, message, metadata, severity)
  VALUES (_champ, _user, _kind, _msg, _meta, _sev);
END $$;

-- ============= RECOMPUTE RANKING (per user) =============
CREATE OR REPLACE FUNCTION public.recompute_championship_ranking(_champ UUID, _user UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_champ public.championships%ROWTYPE;
  v_pnl NUMERIC := 0; v_r NUMERIC := 0; v_wins INT := 0; v_losses INT := 0; v_total INT := 0;
  v_wr NUMERIC := 0; v_pf NUMERIC := 0; v_avgrr NUMERIC := 0; v_dd NUMERIC := 0;
  v_running NUMERIC := 0; v_peak NUMERIC := 0; v_last TIMESTAMPTZ;
  v_gross_win NUMERIC := 0; v_gross_loss NUMERIC := 0;
  v_streak INT := 0; v_cur INT := 0; v_prev_win BOOLEAN;
  v_consistency NUMERIC := 0; v_score NUMERIC := 0; v_avg NUMERIC := 0; v_std NUMERIC := 0;
  v_eligible BOOLEAN := true;
  r RECORD;
BEGIN
  SELECT * INTO v_champ FROM public.championships WHERE id = _champ;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE(SUM(pnl),0), COALESCE(SUM(rr_realized),0),
         COUNT(*) FILTER (WHERE pnl > 0), COUNT(*) FILTER (WHERE pnl <= 0), COUNT(*),
         COALESCE(SUM(pnl) FILTER (WHERE pnl > 0),0), COALESCE(ABS(SUM(pnl) FILTER (WHERE pnl < 0)),0),
         MAX(closed_at)
    INTO v_pnl, v_r, v_wins, v_losses, v_total, v_gross_win, v_gross_loss, v_last
    FROM public.paper_trades
    WHERE championship_id = _champ AND user_id = _user AND status = 'closed';

  IF v_total > 0 THEN
    v_wr := (v_wins::NUMERIC/v_total)*100;
    v_avgrr := v_r / v_total;
  END IF;
  IF v_gross_loss > 0 THEN v_pf := v_gross_win / v_gross_loss; ELSE v_pf := v_gross_win; END IF;

  -- drawdown + streak
  FOR r IN SELECT pnl FROM public.paper_trades WHERE championship_id=_champ AND user_id=_user AND status='closed' ORDER BY closed_at ASC NULLS LAST LOOP
    v_running := v_running + COALESCE(r.pnl,0);
    IF v_running > v_peak THEN v_peak := v_running; END IF;
    IF (v_peak - v_running) > v_dd THEN v_dd := v_peak - v_running; END IF;
    IF r.pnl > 0 THEN
      IF v_prev_win IS DISTINCT FROM true THEN v_cur := 0; END IF;
      v_cur := v_cur + 1; v_prev_win := true;
    ELSE
      IF v_prev_win IS DISTINCT FROM false THEN v_cur := 0; END IF;
      v_cur := v_cur - 1; v_prev_win := false;
    END IF;
  END LOOP;
  v_streak := v_cur;

  -- consistency: 100 - stddev(daily pnl)/|mean daily pnl| * 20 clamped
  SELECT COALESCE(AVG(dp),0), COALESCE(STDDEV_POP(dp),0) INTO v_avg, v_std FROM (
    SELECT SUM(pnl) AS dp FROM public.paper_trades
      WHERE championship_id=_champ AND user_id=_user AND status='closed'
      GROUP BY date_trunc('day', closed_at)
  ) d;
  IF v_avg <> 0 THEN
    v_consistency := GREATEST(0, LEAST(100, 100 - (v_std / ABS(v_avg)) * 20));
  ELSE v_consistency := 0; END IF;

  -- eligibility
  IF v_total < v_champ.min_trades THEN v_eligible := false; END IF;
  IF v_champ.starting_balance > 0 AND (v_dd / v_champ.starting_balance)*100 > v_champ.max_drawdown_pct THEN
    v_eligible := false;
  END IF;

  v_score := CASE v_champ.win_condition
    WHEN 'highest_pnl' THEN v_pnl
    WHEN 'highest_r' THEN v_r
    WHEN 'highest_winrate' THEN v_wr
    WHEN 'lowest_dd' THEN -v_dd
    WHEN 'profit_factor' THEN v_pf * 100
    WHEN 'consistency' THEN v_consistency
    ELSE (v_pnl * 0.4) + (v_r * 20) + (v_wr * 2) + (v_consistency * 3) - (v_dd * 0.5)
  END;

  INSERT INTO public.championship_rankings(
    championship_id, user_id, pnl, net_profit, r_multiple, win_rate, profit_factor, avg_rr,
    max_drawdown, consistency_score, total_trades, current_streak, last_trade_at, score, eligible, updated_at)
  VALUES (_champ, _user, v_pnl, v_pnl, v_r, v_wr, v_pf, v_avgrr, v_dd, v_consistency, v_total, v_streak, v_last, v_score, v_eligible, now())
  ON CONFLICT (championship_id, user_id) DO UPDATE SET
    pnl=EXCLUDED.pnl, net_profit=EXCLUDED.net_profit, r_multiple=EXCLUDED.r_multiple, win_rate=EXCLUDED.win_rate,
    profit_factor=EXCLUDED.profit_factor, avg_rr=EXCLUDED.avg_rr, max_drawdown=EXCLUDED.max_drawdown,
    consistency_score=EXCLUDED.consistency_score, total_trades=EXCLUDED.total_trades,
    current_streak=EXCLUDED.current_streak, last_trade_at=EXCLUDED.last_trade_at,
    previous_rank=public.championship_rankings.rank, score=EXCLUDED.score, eligible=EXCLUDED.eligible, updated_at=now();

  -- rerank
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY (CASE WHEN eligible THEN 0 ELSE 1 END), score DESC, pnl DESC) AS rk
      FROM public.championship_rankings WHERE championship_id=_champ
  )
  UPDATE public.championship_rankings cr SET rank = ranked.rk FROM ranked WHERE ranked.id = cr.id;
END $$;

-- ============= TRADE HOOK: assign championship + trigger recompute =============
CREATE OR REPLACE FUNCTION public.set_trade_championship_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_champ UUID;
BEGIN
  IF NEW.championship_id IS NULL THEN
    -- take from paper account
    IF NEW.account_id IS NOT NULL THEN
      SELECT championship_id INTO v_champ FROM public.paper_accounts WHERE id = NEW.account_id;
      IF v_champ IS NOT NULL THEN NEW.championship_id := v_champ; RETURN NEW; END IF;
    END IF;
    -- otherwise, active championship where user is participant
    SELECT c.id INTO v_champ FROM public.championships c
      JOIN public.championship_participants p ON p.championship_id=c.id AND p.user_id=NEW.user_id AND p.status='active'
      WHERE c.status='live' AND NEW.opened_at BETWEEN c.start_at AND c.end_at
      ORDER BY c.start_at DESC LIMIT 1;
    IF v_champ IS NOT NULL THEN NEW.championship_id := v_champ; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_paper_trade_champ_assign ON public.paper_trades;
CREATE TRIGGER trg_paper_trade_champ_assign BEFORE INSERT ON public.paper_trades
  FOR EACH ROW EXECUTE FUNCTION public.set_trade_championship_id();

CREATE OR REPLACE FUNCTION public.trg_recompute_championship_ranking()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.championship_id IS NOT NULL AND NEW.status='closed' AND
    (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status OR OLD.pnl IS DISTINCT FROM NEW.pnl) THEN
    PERFORM public.recompute_championship_ranking(NEW.championship_id, NEW.user_id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_paper_trade_champ_recompute ON public.paper_trades;
CREATE TRIGGER trg_paper_trade_champ_recompute AFTER INSERT OR UPDATE ON public.paper_trades
  FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_championship_ranking();

-- ============= RANK CHANGE ACTIVITY =============
CREATE OR REPLACE FUNCTION public.trg_champ_rank_event() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.rank IS DISTINCT FROM OLD.rank AND NEW.rank IS NOT NULL THEN
    IF OLD.rank IS NULL OR NEW.rank < OLD.rank THEN
      PERFORM public.emit_championship_activity(NEW.championship_id, NEW.user_id, 'rank_up',
        'Moved up to #'||NEW.rank, jsonb_build_object('from', OLD.rank, 'to', NEW.rank), 'success');
      IF NEW.rank = 1 AND (OLD.rank IS NULL OR OLD.rank > 1) THEN
        PERFORM public.emit_championship_activity(NEW.championship_id, NEW.user_id, 'new_leader',
          'New championship leader', '{}'::jsonb, 'success');
      ELSIF NEW.rank <= 3 AND (OLD.rank IS NULL OR OLD.rank > 3) THEN
        PERFORM public.emit_championship_activity(NEW.championship_id, NEW.user_id, 'top3',
          'Broke into Top 3', '{}'::jsonb, 'success');
      ELSIF NEW.rank <= 10 AND (OLD.rank IS NULL OR OLD.rank > 10) THEN
        PERFORM public.emit_championship_activity(NEW.championship_id, NEW.user_id, 'top10',
          'Broke into Top 10', '{}'::jsonb, 'success');
      END IF;
    ELSIF NEW.rank > OLD.rank THEN
      PERFORM public.emit_championship_activity(NEW.championship_id, NEW.user_id, 'rank_down',
        'Dropped to #'||NEW.rank, jsonb_build_object('from', OLD.rank, 'to', NEW.rank), 'warning');
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_champ_rank ON public.championship_rankings;
CREATE TRIGGER trg_champ_rank AFTER UPDATE ON public.championship_rankings
  FOR EACH ROW EXECUTE FUNCTION public.trg_champ_rank_event();

-- ============= REGISTER / CANCEL =============
CREATE OR REPLACE FUNCTION public.register_for_championship(_champ UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid UUID := auth.uid(); v public.championships%ROWTYPE; v_reg_id UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v FROM public.championships WHERE id=_champ;
  IF NOT FOUND THEN RAISE EXCEPTION 'Championship not found'; END IF;
  IF now() < v.registration_opens_at THEN RAISE EXCEPTION 'Registration not open yet'; END IF;
  IF now() > v.registration_closes_at THEN RAISE EXCEPTION 'Registration closed'; END IF;
  IF v.status NOT IN ('registration','upcoming') THEN RAISE EXCEPTION 'Championship not accepting registrations'; END IF;

  INSERT INTO public.championship_registrations(championship_id, user_id)
    VALUES (_champ, v_uid)
    ON CONFLICT (championship_id, user_id) DO UPDATE SET cancelled_at=NULL, accepted_rules_at=now()
    RETURNING id INTO v_reg_id;

  PERFORM public.emit_championship_activity(_champ, v_uid, 'registration', 'Registered for championship', '{}'::jsonb, 'info');
  RETURN v_reg_id;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_championship_registration(_champ UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid UUID := auth.uid(); v public.championships%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v FROM public.championships WHERE id=_champ;
  IF v.status IN ('live','completed','grading') THEN RAISE EXCEPTION 'Cannot cancel after start'; END IF;
  UPDATE public.championship_registrations SET cancelled_at = now()
    WHERE championship_id=_champ AND user_id=v_uid;
END $$;

-- ============= START / FINALIZE =============
CREATE OR REPLACE FUNCTION public.start_championship(_champ UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.championships%ROWTYPE; r RECORD; v_acct UUID;
BEGIN
  SELECT * INTO v FROM public.championships WHERE id=_champ;
  IF v.status = 'live' THEN RETURN; END IF;
  -- create participants and paper accounts from registrations
  FOR r IN SELECT user_id FROM public.championship_registrations
    WHERE championship_id=_champ AND cancelled_at IS NULL
  LOOP
    INSERT INTO public.paper_accounts(user_id, name, starting_balance, balance, equity,
      championship_id, max_trade_risk_pct, max_daily_risk_pct)
      VALUES (r.user_id, 'Championship: '||v.name, v.starting_balance, v.starting_balance, v.starting_balance,
              v.id, v.max_risk_per_trade_pct, v.max_daily_loss_pct)
      RETURNING id INTO v_acct;
    INSERT INTO public.championship_participants(championship_id, user_id, paper_account_id, status)
      VALUES (v.id, r.user_id, v_acct, 'active')
      ON CONFLICT (championship_id, user_id) DO UPDATE SET paper_account_id=EXCLUDED.paper_account_id, status='active';
  END LOOP;
  UPDATE public.championships SET status='live', updated_at=now() WHERE id=_champ;
  PERFORM public.emit_championship_activity(_champ, NULL, 'start', 'Championship is now LIVE', '{}'::jsonb, 'success');
END $$;

CREATE OR REPLACE FUNCTION public.finalize_championship(_champ UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.championships%ROWTYPE; r RECORD; v_top10 UUID[]; v_winner UUID; v_runner UUID; v_third UUID; v_stats JSONB;
BEGIN
  SELECT * INTO v FROM public.championships WHERE id=_champ;
  IF v.status = 'completed' THEN RETURN; END IF;

  -- ensure ranking freshness
  FOR r IN SELECT DISTINCT user_id FROM public.championship_participants WHERE championship_id=_champ LOOP
    PERFORM public.recompute_championship_ranking(_champ, r.user_id);
  END LOOP;

  -- results
  DELETE FROM public.championship_results WHERE championship_id=_champ;
  INSERT INTO public.championship_results(championship_id, user_id, final_rank, pnl, r_multiple, win_rate,
    profit_factor, max_drawdown, consistency_score, total_trades, score, xp_awarded, coins_awarded, title_awarded)
  SELECT championship_id, user_id, rank, pnl, r_multiple, win_rate, profit_factor, max_drawdown,
    consistency_score, total_trades, score,
    CASE WHEN rank=1 THEN 5000 WHEN rank<=3 THEN 2500 WHEN rank<=10 THEN 1000 WHEN rank<=100 THEN 400 ELSE 100 END,
    CASE WHEN rank=1 THEN 2500 WHEN rank<=3 THEN 1200 WHEN rank<=10 THEN 500 WHEN rank<=100 THEN 200 ELSE 50 END,
    CASE WHEN rank=1 THEN 'Champion' WHEN rank<=3 THEN 'Podium' WHEN rank<=10 THEN 'Top 10' WHEN rank<=100 THEN 'Top 100' ELSE NULL END
  FROM public.championship_rankings WHERE championship_id=_champ AND rank IS NOT NULL AND eligible;

  -- rewards + xp/coin
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

  -- rating updates
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
END $$;

-- ============= TICK: transition state & auto-create next month =============
CREATE OR REPLACE FUNCTION public.tick_championships()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r RECORD; v_next_start TIMESTAMPTZ; v_next_end TIMESTAMPTZ; v_year INT; v_month INT; v_name TEXT; v_slug TEXT; v_tpl public.championship_templates%ROWTYPE;
BEGIN
  -- open registration
  UPDATE public.championships SET status='registration', updated_at=now()
    WHERE status='draft' AND registration_opens_at <= now() AND registration_closes_at > now();
  -- move to upcoming
  UPDATE public.championships SET status='upcoming', updated_at=now()
    WHERE status='registration' AND registration_closes_at <= now() AND start_at > now();
  -- start
  FOR r IN SELECT id FROM public.championships WHERE status IN ('upcoming','registration','draft') AND start_at <= now() AND end_at > now() LOOP
    PERFORM public.start_championship(r.id);
  END LOOP;
  -- finalize
  FOR r IN SELECT id FROM public.championships WHERE status='live' AND end_at <= now() LOOP
    PERFORM public.finalize_championship(r.id);
  END LOOP;

  -- ensure next month exists
  v_next_start := date_trunc('month', now() + interval '1 month');
  v_next_end := (v_next_start + interval '1 month') - interval '1 second';
  v_year := EXTRACT(YEAR FROM v_next_start)::INT;
  v_month := EXTRACT(MONTH FROM v_next_start)::INT;
  IF NOT EXISTS (SELECT 1 FROM public.championships WHERE season_year=v_year AND season_month=v_month) THEN
    SELECT * INTO v_tpl FROM public.championship_templates WHERE is_default LIMIT 1;
    v_name := to_char(v_next_start, 'FMMonth YYYY')||' Championship';
    v_slug := lower(to_char(v_next_start, 'YYYY-MM'))||'-championship';
    INSERT INTO public.championships(slug, name, description, season_year, season_month, status,
      template_id, starting_balance, max_daily_loss_pct, max_drawdown_pct, max_risk_per_trade_pct,
      allowed_markets, allowed_symbols, allowed_sessions, min_trades, win_condition, prize_info,
      registration_opens_at, registration_closes_at, start_at, end_at)
    VALUES (v_slug, v_name, 'Auto-created monthly championship', v_year, v_month, 'registration',
      COALESCE(v_tpl.id, NULL),
      COALESCE(v_tpl.starting_balance, 100000),
      COALESCE(v_tpl.max_daily_loss_pct, 5),
      COALESCE(v_tpl.max_drawdown_pct, 10),
      COALESCE(v_tpl.max_risk_per_trade_pct, 2),
      COALESCE(v_tpl.allowed_markets, ARRAY['crypto','forex','indices','metals']),
      COALESCE(v_tpl.allowed_symbols, ARRAY[]::TEXT[]),
      COALESCE(v_tpl.allowed_sessions, ARRAY[]::TEXT[]),
      COALESCE(v_tpl.min_trades, 10),
      COALESCE(v_tpl.win_condition, 'composite'),
      COALESCE(v_tpl.prize_info, '{}'::jsonb),
      now(), v_next_start - interval '1 second', v_next_start, v_next_end);
  END IF;
END $$;

-- ============= ENFORCE RULES ON TRADE =============
CREATE OR REPLACE FUNCTION public.enforce_championship_rules_on_trade()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.championships%ROWTYPE; v_part public.championship_participants%ROWTYPE;
BEGIN
  IF NEW.championship_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v FROM public.championships WHERE id = NEW.championship_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT * INTO v_part FROM public.championship_participants
    WHERE championship_id=v.id AND user_id=NEW.user_id;
  IF NOT FOUND OR v_part.status <> 'active' THEN
    NEW.championship_id := NULL; -- silently exclude
    RETURN NEW;
  END IF;

  IF v.status <> 'live' THEN
    NEW.championship_id := NULL; RETURN NEW;
  END IF;

  IF NEW.opened_at IS NOT NULL AND (NEW.opened_at < v.start_at OR NEW.opened_at > v.end_at) THEN
    NEW.championship_id := NULL; RETURN NEW;
  END IF;

  IF array_length(v.allowed_symbols,1) IS NOT NULL AND array_length(v.allowed_symbols,1) > 0 THEN
    IF NOT (NEW.symbol = ANY(v.allowed_symbols)) THEN
      INSERT INTO public.championship_activity(championship_id, user_id, kind, message, severity)
        VALUES (v.id, NEW.user_id, 'rule_violation', 'Symbol not allowed: '||NEW.symbol, 'warning');
      NEW.championship_id := NULL; RETURN NEW;
    END IF;
  END IF;

  IF array_length(v.allowed_markets,1) IS NOT NULL AND array_length(v.allowed_markets,1) > 0 THEN
    IF NOT (NEW.market::text = ANY(v.allowed_markets)) THEN
      INSERT INTO public.championship_activity(championship_id, user_id, kind, message, severity)
        VALUES (v.id, NEW.user_id, 'rule_violation', 'Market not allowed: '||NEW.market, 'warning');
      NEW.championship_id := NULL; RETURN NEW;
    END IF;
  END IF;

  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_paper_trade_champ_rules ON public.paper_trades;
CREATE TRIGGER trg_paper_trade_champ_rules BEFORE INSERT ON public.paper_trades
  FOR EACH ROW EXECUTE FUNCTION public.enforce_championship_rules_on_trade();

-- ============= REALTIME =============
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.championship_rankings;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.championship_activity;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.championships;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============= SEED default template + current + next championship =============
INSERT INTO public.championship_templates(name, description, is_default, starting_balance, max_daily_loss_pct, max_drawdown_pct, max_risk_per_trade_pct, min_trades, win_condition, prize_info)
SELECT 'Standard Monthly', 'Default configuration for monthly championships.', true, 100000, 5, 10, 2, 10, 'composite',
  jsonb_build_object('champion', jsonb_build_object('xp',5000,'coins',2500,'title','Champion'),
                     'podium', jsonb_build_object('xp',2500,'coins',1200),
                     'top10', jsonb_build_object('xp',1000,'coins',500),
                     'top100', jsonb_build_object('xp',400,'coins',200))
WHERE NOT EXISTS (SELECT 1 FROM public.championship_templates WHERE is_default);

-- current month championship
DO $$
DECLARE v_start TIMESTAMPTZ; v_end TIMESTAMPTZ; v_y INT; v_m INT; v_name TEXT; v_slug TEXT;
BEGIN
  v_start := date_trunc('month', now());
  v_end := (v_start + interval '1 month') - interval '1 second';
  v_y := EXTRACT(YEAR FROM v_start)::INT; v_m := EXTRACT(MONTH FROM v_start)::INT;
  v_name := to_char(v_start, 'FMMonth YYYY')||' Championship';
  v_slug := lower(to_char(v_start, 'YYYY-MM'))||'-championship';
  IF NOT EXISTS (SELECT 1 FROM public.championships WHERE season_year=v_y AND season_month=v_m) THEN
    INSERT INTO public.championships(slug, name, description, season_year, season_month, status,
      starting_balance, max_daily_loss_pct, max_drawdown_pct, max_risk_per_trade_pct,
      allowed_markets, min_trades, win_condition, registration_opens_at, registration_closes_at, start_at, end_at, is_featured)
    VALUES (v_slug, v_name, 'The flagship monthly championship — trade smart, climb the leaderboard.',
      v_y, v_m, 'live', 100000, 5, 10, 2,
      ARRAY['crypto','forex','indices','metals'], 10, 'composite',
      v_start - interval '3 days', v_start, v_start, v_end, true);
  END IF;
END $$;

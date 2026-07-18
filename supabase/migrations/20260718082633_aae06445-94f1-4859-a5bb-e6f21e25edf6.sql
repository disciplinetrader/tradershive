
-- ============================================================
-- LIVE BATTLE ENGINE
-- ============================================================

-- ---------- ENUMS ----------
DO $$ BEGIN
  CREATE TYPE public.battle_event_type AS ENUM (
    'battle_created','battle_started','battle_ended','battle_cancelled',
    'player_joined','player_left','player_disconnected','player_returned',
    'trade_opened','trade_closed','position_updated',
    'rank_up','rank_down','new_leader','milestone','rule_violation','system'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.battle_presence_status AS ENUM (
    'trading','watching','idle','disconnected','finished'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- battle_events ----------
CREATE TABLE IF NOT EXISTS public.battle_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id UUID NOT NULL REFERENCES public.battles(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type public.battle_event_type NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS battle_events_battle_id_created_idx
  ON public.battle_events (battle_id, created_at DESC);

GRANT SELECT ON public.battle_events TO authenticated;
GRANT ALL ON public.battle_events TO service_role;
ALTER TABLE public.battle_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read events of public or joined battles"
  ON public.battle_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.battles b
      WHERE b.id = battle_events.battle_id
        AND (
          b.visibility = 'public'
          OR b.host_id = auth.uid()
          OR public.is_battle_participant(b.id, auth.uid())
          OR public.is_platform_admin(auth.uid())
        )
    )
  );

-- ---------- battle_activity ----------
CREATE TABLE IF NOT EXISTS public.battle_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id UUID NOT NULL REFERENCES public.battles(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS battle_activity_battle_id_created_idx
  ON public.battle_activity (battle_id, created_at DESC);

GRANT SELECT ON public.battle_activity TO authenticated;
GRANT ALL ON public.battle_activity TO service_role;
ALTER TABLE public.battle_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read activity of public or joined battles"
  ON public.battle_activity FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.battles b
      WHERE b.id = battle_activity.battle_id
        AND (b.visibility = 'public'
             OR b.host_id = auth.uid()
             OR public.is_battle_participant(b.id, auth.uid())
             OR public.is_platform_admin(auth.uid()))
    )
  );

-- ---------- battle_chat ----------
CREATE TABLE IF NOT EXISTS public.battle_chat (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id UUID NOT NULL REFERENCES public.battles(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  message TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 500),
  kind TEXT NOT NULL DEFAULT 'user', -- user | system
  reactions JSONB NOT NULL DEFAULT '{}'::jsonb,
  mentions UUID[] NOT NULL DEFAULT '{}'::uuid[],
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS battle_chat_battle_id_created_idx
  ON public.battle_chat (battle_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.battle_chat TO authenticated;
GRANT ALL ON public.battle_chat TO service_role;
ALTER TABLE public.battle_chat ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read chat of public or joined battles"
  ON public.battle_chat FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.battles b
      WHERE b.id = battle_chat.battle_id
        AND (b.visibility = 'public'
             OR b.host_id = auth.uid()
             OR public.is_battle_participant(b.id, auth.uid())
             OR public.is_platform_admin(auth.uid()))
    )
  );

CREATE POLICY "Participants post chat"
  ON public.battle_chat FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND kind = 'user'
    AND (
      public.is_battle_participant(battle_id, auth.uid())
      OR public.is_battle_host(battle_id, auth.uid())
      OR EXISTS (SELECT 1 FROM public.battles b WHERE b.id = battle_id AND b.visibility='public')
    )
  );

CREATE POLICY "Author or moderator can update chat"
  ON public.battle_chat FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_battle_host(battle_id, auth.uid())
    OR public.is_platform_admin(auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_battle_host(battle_id, auth.uid())
    OR public.is_platform_admin(auth.uid())
  );

-- ---------- battle_presence ----------
CREATE TABLE IF NOT EXISTS public.battle_presence (
  battle_id UUID NOT NULL REFERENCES public.battles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.battle_presence_status NOT NULL DEFAULT 'watching',
  role TEXT NOT NULL DEFAULT 'spectator', -- spectator | participant | host
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (battle_id, user_id)
);
CREATE INDEX IF NOT EXISTS battle_presence_battle_id_idx
  ON public.battle_presence (battle_id, last_seen_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.battle_presence TO authenticated;
GRANT ALL ON public.battle_presence TO service_role;
ALTER TABLE public.battle_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read presence of readable battles"
  ON public.battle_presence FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.battles b
      WHERE b.id = battle_presence.battle_id
        AND (b.visibility = 'public'
             OR b.host_id = auth.uid()
             OR public.is_battle_participant(b.id, auth.uid())
             OR public.is_platform_admin(auth.uid()))
    )
  );

CREATE POLICY "Users manage own presence"
  ON public.battle_presence FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own presence"
  ON public.battle_presence FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own presence"
  ON public.battle_presence FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ---------- battle_statistics_live ----------
CREATE TABLE IF NOT EXISTS public.battle_statistics_live (
  battle_id UUID PRIMARY KEY REFERENCES public.battles(id) ON DELETE CASCADE,
  leader_user_id UUID,
  leader_pnl NUMERIC NOT NULL DEFAULT 0,
  highest_pnl NUMERIC NOT NULL DEFAULT 0,
  highest_r NUMERIC NOT NULL DEFAULT 0,
  best_win_rate NUMERIC NOT NULL DEFAULT 0,
  lowest_drawdown NUMERIC NOT NULL DEFAULT 0,
  most_trades INTEGER NOT NULL DEFAULT 0,
  best_avg_rr NUMERIC NOT NULL DEFAULT 0,
  avg_pnl NUMERIC NOT NULL DEFAULT 0,
  avg_rr NUMERIC NOT NULL DEFAULT 0,
  avg_win_rate NUMERIC NOT NULL DEFAULT 0,
  avg_drawdown NUMERIC NOT NULL DEFAULT 0,
  win_percentage NUMERIC NOT NULL DEFAULT 0,
  active_positions INTEGER NOT NULL DEFAULT 0,
  trades_closed INTEGER NOT NULL DEFAULT 0,
  trades_open INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.battle_statistics_live TO authenticated;
GRANT ALL ON public.battle_statistics_live TO service_role;
ALTER TABLE public.battle_statistics_live ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read live stats of readable battles"
  ON public.battle_statistics_live FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.battles b
      WHERE b.id = battle_statistics_live.battle_id
        AND (b.visibility = 'public'
             OR b.host_id = auth.uid()
             OR public.is_battle_participant(b.id, auth.uid())
             OR public.is_platform_admin(auth.uid()))
    )
  );

-- ============================================================
-- HELPERS: emit events + recompute live stats
-- ============================================================

CREATE OR REPLACE FUNCTION public.emit_battle_event(
  _battle_id UUID, _user_id UUID, _type public.battle_event_type,
  _message TEXT, _metadata JSONB DEFAULT '{}'::jsonb, _severity TEXT DEFAULT 'info'
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.battle_events(battle_id, user_id, event_type, message, metadata, severity)
  VALUES (_battle_id, _user_id, _type, _message, _metadata, _severity);
  INSERT INTO public.battle_activity(battle_id, user_id, kind, message, metadata)
  VALUES (_battle_id, _user_id, _type::text, _message, _metadata);
END $$;

CREATE OR REPLACE FUNCTION public.recompute_battle_live_stats(_battle_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v RECORD;
  v_leader UUID;
  v_leader_pnl NUMERIC := 0;
  v_open INTEGER := 0;
  v_closed INTEGER := 0;
BEGIN
  SELECT user_id, pnl INTO v_leader, v_leader_pnl
    FROM public.battle_rankings WHERE battle_id = _battle_id
    ORDER BY rank ASC NULLS LAST LIMIT 1;

  SELECT
    COALESCE(MAX(pnl),0)          AS highest_pnl,
    COALESCE(MAX(r_multiple),0)   AS highest_r,
    COALESCE(MAX(win_rate),0)     AS best_win_rate,
    COALESCE(MIN(max_drawdown),0) AS lowest_drawdown,
    COALESCE(MAX(trades_count),0) AS most_trades,
    COALESCE(AVG(pnl),0)          AS avg_pnl,
    COALESCE(AVG(r_multiple),0)   AS avg_rr,
    COALESCE(AVG(win_rate),0)     AS avg_win_rate,
    COALESCE(AVG(max_drawdown),0) AS avg_drawdown,
    COALESCE(SUM(trades_count),0) AS trades_closed
  INTO v FROM public.battle_rankings WHERE battle_id = _battle_id;

  SELECT COUNT(*) INTO v_open FROM public.paper_trades
    WHERE battle_id = _battle_id AND status = 'open';
  SELECT COUNT(*) INTO v_closed FROM public.paper_trades
    WHERE battle_id = _battle_id AND status = 'closed';

  INSERT INTO public.battle_statistics_live (
    battle_id, leader_user_id, leader_pnl,
    highest_pnl, highest_r, best_win_rate, lowest_drawdown, most_trades, best_avg_rr,
    avg_pnl, avg_rr, avg_win_rate, avg_drawdown, win_percentage,
    active_positions, trades_closed, trades_open, updated_at
  ) VALUES (
    _battle_id, v_leader, COALESCE(v_leader_pnl,0),
    v.highest_pnl, v.highest_r, v.best_win_rate, v.lowest_drawdown, v.most_trades, v.avg_rr,
    v.avg_pnl, v.avg_rr, v.avg_win_rate, v.avg_drawdown,
    CASE WHEN v.trades_closed > 0 THEN v.best_win_rate ELSE 0 END,
    v_open, v_closed, v_open, now()
  )
  ON CONFLICT (battle_id) DO UPDATE SET
    leader_user_id = EXCLUDED.leader_user_id,
    leader_pnl = EXCLUDED.leader_pnl,
    highest_pnl = EXCLUDED.highest_pnl,
    highest_r = EXCLUDED.highest_r,
    best_win_rate = EXCLUDED.best_win_rate,
    lowest_drawdown = EXCLUDED.lowest_drawdown,
    most_trades = EXCLUDED.most_trades,
    best_avg_rr = EXCLUDED.best_avg_rr,
    avg_pnl = EXCLUDED.avg_pnl,
    avg_rr = EXCLUDED.avg_rr,
    avg_win_rate = EXCLUDED.avg_win_rate,
    avg_drawdown = EXCLUDED.avg_drawdown,
    win_percentage = EXCLUDED.win_percentage,
    active_positions = EXCLUDED.active_positions,
    trades_closed = EXCLUDED.trades_closed,
    trades_open = EXCLUDED.trades_open,
    updated_at = now();
END $$;

-- ============================================================
-- TRIGGERS: emit events on lifecycle changes
-- ============================================================

-- Trade lifecycle → events + live stats
CREATE OR REPLACE FUNCTION public.trg_battle_trade_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prev_leader UUID; v_new_leader UUID; v_msg TEXT;
BEGIN
  IF NEW.battle_id IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' AND NEW.status = 'open' THEN
    PERFORM public.emit_battle_event(NEW.battle_id, NEW.user_id, 'trade_opened',
      'Opened ' || UPPER(NEW.direction::text) || ' ' || NEW.symbol,
      jsonb_build_object('trade_id', NEW.id, 'symbol', NEW.symbol,
                         'direction', NEW.direction, 'entry_price', NEW.entry_price));
  ELSIF TG_OP = 'UPDATE' AND OLD.status <> 'closed' AND NEW.status = 'closed' THEN
    v_msg := 'Closed ' || NEW.symbol || ' ' ||
             CASE WHEN COALESCE(NEW.rr_realized,0) >= 0 THEN '+' ELSE '' END ||
             ROUND(COALESCE(NEW.rr_realized,0)::numeric, 2)::text || 'R (' ||
             CASE WHEN COALESCE(NEW.pnl,0) >= 0 THEN '+' ELSE '' END ||
             ROUND(COALESCE(NEW.pnl,0)::numeric, 2)::text || ')';
    SELECT leader_user_id INTO v_prev_leader FROM public.battle_statistics_live WHERE battle_id = NEW.battle_id;
    PERFORM public.emit_battle_event(NEW.battle_id, NEW.user_id, 'trade_closed', v_msg,
      jsonb_build_object('trade_id', NEW.id, 'symbol', NEW.symbol,
                         'pnl', NEW.pnl, 'rr', NEW.rr_realized));
    PERFORM public.recompute_battle_live_stats(NEW.battle_id);
    SELECT leader_user_id INTO v_new_leader FROM public.battle_statistics_live WHERE battle_id = NEW.battle_id;
    IF v_new_leader IS NOT NULL AND v_new_leader IS DISTINCT FROM v_prev_leader THEN
      PERFORM public.emit_battle_event(NEW.battle_id, v_new_leader, 'new_leader',
        'New leader takes first place', jsonb_build_object('previous_leader', v_prev_leader), 'success');
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS battle_trade_event_trg ON public.paper_trades;
CREATE TRIGGER battle_trade_event_trg
  AFTER INSERT OR UPDATE ON public.paper_trades
  FOR EACH ROW EXECUTE FUNCTION public.trg_battle_trade_event();

-- Rank change events
CREATE OR REPLACE FUNCTION public.trg_battle_rank_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.rank IS DISTINCT FROM NEW.rank AND NEW.rank IS NOT NULL AND OLD.rank IS NOT NULL THEN
    IF NEW.rank < OLD.rank THEN
      PERFORM public.emit_battle_event(NEW.battle_id, NEW.user_id, 'rank_up',
        'Moved up to #' || NEW.rank,
        jsonb_build_object('from', OLD.rank, 'to', NEW.rank), 'success');
    ELSIF NEW.rank > OLD.rank THEN
      PERFORM public.emit_battle_event(NEW.battle_id, NEW.user_id, 'rank_down',
        'Dropped to #' || NEW.rank,
        jsonb_build_object('from', OLD.rank, 'to', NEW.rank), 'warning');
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS battle_rank_event_trg ON public.battle_rankings;
CREATE TRIGGER battle_rank_event_trg
  AFTER UPDATE ON public.battle_rankings
  FOR EACH ROW EXECUTE FUNCTION public.trg_battle_rank_event();

-- Battle status changes
CREATE OR REPLACE FUNCTION public.trg_battle_status_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.emit_battle_event(NEW.id, NEW.host_id, 'battle_created',
      'Battle created: ' || NEW.name, '{}'::jsonb);
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'live' THEN
      PERFORM public.emit_battle_event(NEW.id, NULL, 'battle_started', 'Battle is now LIVE', '{}'::jsonb, 'success');
    ELSIF NEW.status = 'completed' THEN
      PERFORM public.emit_battle_event(NEW.id, NEW.winner_user_id, 'battle_ended',
        'Battle ended', jsonb_build_object('winner', NEW.winner_user_id), 'success');
      PERFORM public.recompute_battle_live_stats(NEW.id);
    ELSIF NEW.status = 'cancelled' THEN
      PERFORM public.emit_battle_event(NEW.id, NEW.host_id, 'battle_cancelled', 'Battle cancelled', '{}'::jsonb, 'warning');
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS battle_status_event_trg ON public.battles;
CREATE TRIGGER battle_status_event_trg
  AFTER INSERT OR UPDATE ON public.battles
  FOR EACH ROW EXECUTE FUNCTION public.trg_battle_status_event();

-- Participant join/leave events
CREATE OR REPLACE FUNCTION public.trg_battle_participant_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.emit_battle_event(NEW.battle_id, NEW.user_id, 'player_joined',
      'Player joined the battle', '{}'::jsonb);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.emit_battle_event(OLD.battle_id, OLD.user_id, 'player_left',
      'Player left the battle', '{}'::jsonb);
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS battle_participant_event_trg ON public.battle_participants;
CREATE TRIGGER battle_participant_event_trg
  AFTER INSERT OR DELETE ON public.battle_participants
  FOR EACH ROW EXECUTE FUNCTION public.trg_battle_participant_event();

-- Rule violation: emit an event when battle_logs gets a rule_violation
CREATE OR REPLACE FUNCTION public.trg_battle_log_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.event_type = 'rule_violation' THEN
    PERFORM public.emit_battle_event(NEW.battle_id, NEW.user_id, 'rule_violation',
      NEW.message, COALESCE(NEW.metadata,'{}'::jsonb), 'error');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS battle_log_event_trg ON public.battle_logs;
CREATE TRIGGER battle_log_event_trg
  AFTER INSERT ON public.battle_logs
  FOR EACH ROW EXECUTE FUNCTION public.trg_battle_log_event();

-- ============================================================
-- REALTIME PUBLICATION
-- ============================================================
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'battles','battle_participants','battle_rankings','battle_results',
    'battle_events','battle_activity','battle_chat','battle_presence',
    'battle_statistics_live','battle_notifications'
  ]) LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN NULL;
             WHEN others THEN NULL;
    END;
  END LOOP;
END $$;

-- REPLICA IDENTITY FULL for tables where UPDATE payloads need old row
ALTER TABLE public.battle_rankings REPLICA IDENTITY FULL;
ALTER TABLE public.battle_presence REPLICA IDENTITY FULL;
ALTER TABLE public.battle_chat REPLICA IDENTITY FULL;

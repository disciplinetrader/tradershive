-- Battle Arena Core Upgrade

-- 1. Extend battle_status enum
DO $$ 
BEGIN
    ALTER TYPE public.battle_status ADD VALUE 'open';
    ALTER TYPE public.battle_status ADD VALUE 'filling';
    ALTER TYPE public.battle_status ADD VALUE 'ready';
    ALTER TYPE public.battle_status ADD VALUE 'countdown';
    ALTER TYPE public.battle_status ADD VALUE 'paused';
    ALTER TYPE public.battle_status ADD VALUE 'failed';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Extend battle_type_kind enum
DO $$ 
BEGIN
    ALTER TYPE public.battle_type_kind ADD VALUE 'profit_target';
    ALTER TYPE public.battle_type_kind ADD VALUE 'time_trial';
    ALTER TYPE public.battle_type_kind ADD VALUE 'custom';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. Create battle_rank enum
DO $$ 
BEGIN
    CREATE TYPE public.battle_rank AS ENUM ('bronze', 'silver', 'gold', 'platinum', 'diamond', 'master');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 4. Upgrade profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS elo INTEGER DEFAULT 1000;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS battle_wins INTEGER DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS battles_played INTEGER DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS current_battle_streak INTEGER DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS best_battle_streak INTEGER DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS peak_elo INTEGER DEFAULT 1000;

-- 5. Upgrade battles table
ALTER TABLE public.battles ADD COLUMN IF NOT EXISTS ranked BOOLEAN DEFAULT false;
ALTER TABLE public.battles ADD COLUMN IF NOT EXISTS min_participants INTEGER DEFAULT 2;
ALTER TABLE public.battles ADD COLUMN IF NOT EXISTS profit_target_pct NUMERIC;
ALTER TABLE public.battles ADD COLUMN IF NOT EXISTS time_limit_seconds INTEGER;
ALTER TABLE public.battles ADD COLUMN IF NOT EXISTS rules_config JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.battles ADD COLUMN IF NOT EXISTS data_snapshot_id TEXT;
ALTER TABLE public.battles ADD COLUMN IF NOT EXISTS lobby_opened_at TIMESTAMPTZ;
ALTER TABLE public.battles ADD COLUMN IF NOT EXISTS countdown_started_at TIMESTAMPTZ;
ALTER TABLE public.battles ADD COLUMN IF NOT EXISTS scheduled_start_at TIMESTAMPTZ;
ALTER TABLE public.battles ADD COLUMN IF NOT EXISTS max_open_positions INTEGER DEFAULT 5;
ALTER TABLE public.battles ADD COLUMN IF NOT EXISTS allow_late_join BOOLEAN DEFAULT false;

-- 6. Matchmaking Queue
CREATE TABLE IF NOT EXISTS public.matchmaking_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    battle_type public.battle_type_kind NOT NULL,
    is_ranked BOOLEAN DEFAULT false,
    joined_at TIMESTAMPTZ DEFAULT now(),
    elo_at_join INTEGER NOT NULL,
    UNIQUE(user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.matchmaking_queue TO authenticated;
GRANT ALL ON public.matchmaking_queue TO service_role;

ALTER TABLE public.matchmaking_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own matchmaking entry"
ON public.matchmaking_queue
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- 7. ELO History
CREATE TABLE IF NOT EXISTS public.elo_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    battle_id UUID REFERENCES public.battles(id) ON DELETE SET NULL,
    elo_before INTEGER NOT NULL,
    elo_after INTEGER NOT NULL,
    elo_change INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT ON public.elo_history TO authenticated;
GRANT ALL ON public.elo_history TO service_role;

ALTER TABLE public.elo_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own ELO history"
ON public.elo_history
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 8. Battle Results Persistence
ALTER TABLE public.battle_results ADD COLUMN IF NOT EXISTS elo_before INTEGER;
ALTER TABLE public.battle_results ADD COLUMN IF NOT EXISTS elo_after INTEGER;
ALTER TABLE public.battle_results ADD COLUMN IF NOT EXISTS total_trades INTEGER DEFAULT 0;
ALTER TABLE public.battle_results ADD COLUMN IF NOT EXISTS win_rate NUMERIC DEFAULT 0;
ALTER TABLE public.battle_results ADD COLUMN IF NOT EXISTS max_drawdown NUMERIC DEFAULT 0;
ALTER TABLE public.battle_results ADD COLUMN IF NOT EXISTS total_r NUMERIC DEFAULT 0;

-- 9. Functions for ELO and Matchmaking
CREATE OR REPLACE FUNCTION public.calculate_elo_change(
    _user_elo INTEGER,
    _opponent_elo INTEGER,
    _result NUMERIC, -- 1.0 for win, 0.5 for draw, 0.0 for loss
    _k_factor INTEGER DEFAULT 32
) RETURNS INTEGER AS $$
DECLARE
    expected_score NUMERIC;
BEGIN
    expected_score := 1.0 / (1.0 + pow(10, (_opponent_elo - _user_elo) / 400.0));
    RETURN round(_k_factor * (_result - expected_score));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

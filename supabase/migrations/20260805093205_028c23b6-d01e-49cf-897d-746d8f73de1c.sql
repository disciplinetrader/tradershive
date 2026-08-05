-- 1. Create activity_logs table for practice time tracking
CREATE TABLE public.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    activity_type TEXT NOT NULL, -- 'replay', 'trading', 'journal', 'battle', 'ai_homework'
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own activity logs"
ON public.activity_logs
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 2. Create historical_market_replayed table
CREATE TABLE public.historical_market_replayed (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES public.replay_sessions(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    start_ts TIMESTAMPTZ NOT NULL,
    end_ts TIMESTAMPTZ NOT NULL,
    duration_seconds INTEGER NOT NULL, -- Difference between end_ts and start_ts
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.historical_market_replayed TO authenticated;
GRANT ALL ON public.historical_market_replayed TO service_role;
ALTER TABLE public.historical_market_replayed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see their own replayed market time"
ON public.historical_market_replayed
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own replayed market time"
ON public.historical_market_replayed
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- 3. Create practice_streaks table
CREATE TABLE public.practice_streaks (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    current_streak INTEGER NOT NULL DEFAULT 0,
    longest_streak INTEGER NOT NULL DEFAULT 0,
    last_activity_date DATE, -- In user's timezone
    last_activity_at TIMESTAMPTZ, -- Exact UTC timestamp
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.practice_streaks TO authenticated;
GRANT ALL ON public.practice_streaks TO service_role;
ALTER TABLE public.practice_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see their own streak"
ON public.practice_streaks
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- 4. Create function to record activity and update streak
CREATE OR REPLACE FUNCTION public.record_practice_activity(
    _user_id UUID,
    _activity_type TEXT,
    _metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    _user_timezone TEXT;
    _today_date DATE;
    _streak_row RECORD;
    _is_new_day BOOLEAN := FALSE;
BEGIN
    -- Get user's timezone
    SELECT timezone INTO _user_timezone FROM public.profiles WHERE id = _user_id;
    IF _user_timezone IS NULL THEN _user_timezone := 'UTC'; END IF;

    -- Calculate current date in user's timezone
    _today_date := (now() AT TIME ZONE _user_timezone)::date;

    -- Get or create streak record
    SELECT * INTO _streak_row FROM public.practice_streaks WHERE user_id = _user_id;
    
    IF _streak_row IS NULL THEN
        INSERT INTO public.practice_streaks (user_id, current_streak, longest_streak, last_activity_date, last_activity_at)
        VALUES (_user_id, 1, 1, _today_date, now());
        _is_new_day := TRUE;
    ELSE
        -- Check if it's a new qualifying day
        IF _streak_row.last_activity_date IS NULL OR _today_date > _streak_row.last_activity_date THEN
            _is_new_day := TRUE;
            
            -- Check if streak is continued (yesterday or today)
            IF _streak_row.last_activity_date = (_today_date - INTERVAL '1 day')::date THEN
                UPDATE public.practice_streaks
                SET current_streak = current_streak + 1,
                    longest_streak = GREATEST(longest_streak, current_streak + 1),
                    last_activity_date = _today_date,
                    last_activity_at = now(),
                    updated_at = now()
                WHERE user_id = _user_id;
            ELSE
                -- Streak broken, restart
                UPDATE public.practice_streaks
                SET current_streak = 1,
                    last_activity_date = _today_date,
                    last_activity_at = now(),
                    updated_at = now()
                WHERE user_id = _user_id;
            END IF;
        ELSE
            -- Already recorded activity today, just update the timestamp
            UPDATE public.practice_streaks
            SET last_activity_at = now(),
                updated_at = now()
            WHERE user_id = _user_id;
        END IF;
    END IF;

    -- Record the activity log if needed (optional, could be done separately for more detail)
    -- This function specifically handles the streak logic.
END;
$$;

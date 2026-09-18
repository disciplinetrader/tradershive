-- =============================================================================
-- Phase 2 · Increment 3e ROLLBACK. Run as postgres.
-- Restores the pre-I3e function body (no identity guard) and the broad grants.
-- (Restores the N-15 exposure — emergency use only.)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.record_practice_activity(_user_id uuid, _activity_type text, _metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    _user_timezone TEXT;
    _today_date DATE;
    _streak_row RECORD;
    _is_new_day BOOLEAN := FALSE;
BEGIN
    SELECT timezone INTO _user_timezone FROM public.profiles WHERE id = _user_id;
    IF _user_timezone IS NULL THEN _user_timezone := 'UTC'; END IF;
    _today_date := (now() AT TIME ZONE _user_timezone)::date;
    SELECT * INTO _streak_row FROM public.practice_streaks WHERE user_id = _user_id;
    IF _streak_row IS NULL THEN
        INSERT INTO public.practice_streaks (user_id, current_streak, longest_streak, last_activity_date, last_activity_at)
        VALUES (_user_id, 1, 1, _today_date, now());
        _is_new_day := TRUE;
    ELSE
        IF _streak_row.last_activity_date IS NULL OR _today_date > _streak_row.last_activity_date THEN
            _is_new_day := TRUE;
            IF _streak_row.last_activity_date = (_today_date - INTERVAL '1 day')::date THEN
                UPDATE public.practice_streaks
                SET current_streak = current_streak + 1,
                    longest_streak = GREATEST(longest_streak, current_streak + 1),
                    last_activity_date = _today_date, last_activity_at = now(), updated_at = now()
                WHERE user_id = _user_id;
            ELSE
                UPDATE public.practice_streaks
                SET current_streak = 1, last_activity_date = _today_date,
                    last_activity_at = now(), updated_at = now()
                WHERE user_id = _user_id;
            END IF;
        ELSE
            UPDATE public.practice_streaks
            SET last_activity_at = now(), updated_at = now()
            WHERE user_id = _user_id;
        END IF;
    END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.record_practice_activity(uuid,text,jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.journal_sync_tag_arrays_for(uuid) TO anon, authenticated;

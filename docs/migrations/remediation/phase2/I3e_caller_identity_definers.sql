-- =============================================================================
-- Phase 2 · Increment 3e — close caller-supplied-identity SECURITY DEFINER
-- functions (N-15). Run as postgres. Rollback: I3e_rollback.sql.
--
-- record_practice_activity(_user_id,...) trusted the caller-supplied _user_id
-- with no auth check and was executable by anon/authenticated — so a client
-- could grow another user's practice streak. It is only ever called by the
-- logActivity server fn with the verified JWT user, so: reject a mismatch
-- between auth.uid() and _user_id (service/cron with auth.uid() IS NULL still
-- passes the real id), and revoke anon EXECUTE.
--
-- journal_sync_tag_arrays_for(target) recomputes one entry's tag arrays from a
-- caller-supplied entry id and was executable by anon. It has no application
-- caller — it is invoked only by the SECURITY DEFINER trigger functions
-- journal_entry_tags_sync_trg / journal_tags_rename_sync_trg (which run as owner,
-- so grants to untrusted roles are irrelevant to them). Revoke anon/authenticated
-- EXECUTE; the trigger path is unaffected.
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
    -- N-15: an authenticated caller may only record activity for themselves.
    -- auth.uid() IS NULL is the trusted service/cron path and keeps _user_id.
    IF auth.uid() IS NOT NULL AND auth.uid() <> _user_id THEN
        RAISE EXCEPTION 'record_practice_activity: cannot record activity for another user' USING ERRCODE='P0001';
    END IF;

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

-- Revoke the default PUBLIC grant too, otherwise anon still inherits EXECUTE.
REVOKE EXECUTE ON FUNCTION public.record_practice_activity(uuid,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_practice_activity(uuid,text,jsonb) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.journal_sync_tag_arrays_for(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.journal_sync_tag_arrays_for(uuid) TO service_role;

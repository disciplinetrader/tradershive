
DROP FUNCTION IF EXISTS public.admin_ai_usage_series(integer);
CREATE OR REPLACE FUNCTION public.admin_ai_usage_series(_days INTEGER DEFAULT 14)
RETURNS TABLE(day DATE, requests BIGINT, tokens BIGINT, cost_credits NUMERIC)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN QUERY
  WITH days AS (
    SELECT generate_series(
      (CURRENT_DATE - (_days - 1))::date,
      CURRENT_DATE::date,
      '1 day'::interval
    )::date AS d
  )
  SELECT
    d AS day,
    COALESCE((SELECT COUNT(*) FROM public.ai_usage_logs l WHERE l.created_at::date = d), 0) AS requests,
    COALESCE((SELECT SUM(COALESCE(l.tokens_in,0)+COALESCE(l.tokens_out,0))::BIGINT FROM public.ai_usage_logs l WHERE l.created_at::date = d), 0) AS tokens,
    COALESCE((SELECT SUM(COALESCE(l.cost_credits,0)) FROM public.ai_usage_logs l WHERE l.created_at::date = d), 0)::NUMERIC AS cost_credits
  FROM days
  ORDER BY d;
END $$;

CREATE OR REPLACE FUNCTION public.admin_dashboard_kpis()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  today_start TIMESTAMPTZ := date_trunc('day', now());
  month_start TIMESTAMPTZ := date_trunc('month', now());
  result JSONB;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  SELECT jsonb_build_object(
    'total_users',           (SELECT COUNT(*) FROM public.profiles WHERE deleted_at IS NULL),
    'active_today',          (SELECT COUNT(DISTINCT id) FROM public.profiles WHERE updated_at >= today_start),
    'mau',                   (SELECT COUNT(DISTINCT id) FROM public.profiles WHERE updated_at >= now() - INTERVAL '30 days'),
    'new_today',             (SELECT COUNT(*) FROM public.profiles WHERE created_at >= today_start),
    'new_this_month',        (SELECT COUNT(*) FROM public.profiles WHERE created_at >= month_start),
    'premium_users',         (SELECT COUNT(*) FROM public.profiles WHERE is_premium = true),
    'active_subs',           (SELECT COUNT(*) FROM public.user_subscriptions WHERE status IN ('active','trialing','lifetime')),
    'trial_subs',            (SELECT COUNT(*) FROM public.user_subscriptions WHERE status = 'trialing'),
    'total_replays',         (SELECT COUNT(*) FROM public.replay_sessions),
    'total_trades',          (SELECT COUNT(*) FROM public.paper_trades),
    'ai_requests_today',     (SELECT COUNT(*) FROM public.ai_usage_logs WHERE created_at >= today_start),
    'ai_tokens_today',       COALESCE((SELECT SUM(COALESCE(tokens_in,0)+COALESCE(tokens_out,0)) FROM public.ai_usage_logs WHERE created_at >= today_start), 0),
    'open_tickets',          (SELECT COUNT(*) FROM public.support_tickets WHERE status = 'open'),
    'open_bugs',             (SELECT COUNT(*) FROM public.bug_reports WHERE status IN ('open','triaged','in_progress')),
    'unread_notifications',  (SELECT COUNT(*) FROM public.admin_notifications WHERE dismissed_at IS NULL AND NOT (auth.uid() = ANY(read_by))),
    'error_events_24h',      (SELECT COUNT(*) FROM public.admin_security_events WHERE severity IN ('error','critical') AND created_at >= now() - INTERVAL '24 hours')
  ) INTO result;
  RETURN result;
END $$;

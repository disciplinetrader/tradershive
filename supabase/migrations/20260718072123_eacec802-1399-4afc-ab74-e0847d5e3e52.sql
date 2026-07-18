
CREATE TABLE IF NOT EXISTS public.ai_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT date_trunc('hour', now()),
  count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, bucket, window_start)
);
CREATE INDEX IF NOT EXISTS idx_ai_rate_limits_user_bucket
  ON public.ai_rate_limits (user_id, bucket, window_start DESC);

GRANT SELECT ON public.ai_rate_limits TO authenticated;
GRANT ALL ON public.ai_rate_limits TO service_role;

ALTER TABLE public.ai_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own rate limits"
  ON public.ai_rate_limits FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

INSERT INTO public.system_settings (key, value)
VALUES (
  'ai.rate_limits',
  '{"free":{"chat_per_hour":30,"chat_per_day":150,"review_per_day":10},"pro":{"chat_per_hour":180,"chat_per_day":1500,"review_per_day":120},"admin":{"chat_per_hour":100000,"chat_per_day":100000,"review_per_day":100000}}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.bump_ai_rate_limit(
  _user_id UUID,
  _bucket TEXT,
  _window_start TIMESTAMPTZ,
  _limit INTEGER
) RETURNS TABLE(allowed BOOLEAN, current_count INTEGER, remaining INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO public.ai_rate_limits (user_id, bucket, window_start, count)
  VALUES (_user_id, _bucket, _window_start, 1)
  ON CONFLICT (user_id, bucket, window_start)
  DO UPDATE SET count = public.ai_rate_limits.count + 1, updated_at = now()
  RETURNING count INTO v_count;

  IF v_count > _limit THEN
    UPDATE public.ai_rate_limits
      SET count = count - 1, updated_at = now()
      WHERE user_id = _user_id AND bucket = _bucket AND window_start = _window_start;
    RETURN QUERY SELECT FALSE, v_count - 1, GREATEST(0, _limit - (v_count - 1));
  ELSE
    RETURN QUERY SELECT TRUE, v_count, GREATEST(0, _limit - v_count);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.bump_ai_rate_limit(UUID, TEXT, TIMESTAMPTZ, INTEGER) FROM public;
GRANT EXECUTE ON FUNCTION public.bump_ai_rate_limit(UUID, TEXT, TIMESTAMPTZ, INTEGER) TO authenticated, service_role;

ALTER TABLE public.chart_closed_trades
  ADD COLUMN IF NOT EXISTS replay_session_id uuid REFERENCES public.replay_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS chart_closed_trades_replay_session_idx
  ON public.chart_closed_trades (user_id, replay_session_id, closed_at DESC)
  WHERE replay_session_id IS NOT NULL;

ALTER TABLE public.replay_scores
  ADD COLUMN IF NOT EXISTS score_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS input_source text NOT NULL DEFAULT 'client',
  ADD COLUMN IF NOT EXISTS input_revision text,
  ADD COLUMN IF NOT EXISTS generated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS unknown_inputs jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.replay_screenshots
  ADD COLUMN IF NOT EXISTS dataset_checksum text,
  ADD COLUMN IF NOT EXISTS symbol text,
  ADD COLUMN IF NOT EXISTS timeframe text,
  ADD COLUMN IF NOT EXISTS cursor_ts timestamptz,
  ADD COLUMN IF NOT EXISTS bookmark_id uuid,
  ADD COLUMN IF NOT EXISTS trade_id text;
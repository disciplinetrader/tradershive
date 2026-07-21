
-- Replay checkpoints table
CREATE TABLE public.replay_checkpoints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.replay_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  label TEXT NOT NULL DEFAULT 'Checkpoint',
  checkpoint_ts TIMESTAMPTZ NOT NULL,
  kind TEXT NOT NULL DEFAULT 'custom' CHECK (kind IN ('london_open','ny_open','asia_open','trade_entry','trade_exit','liquidity_sweep','bookmark','custom')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_replay_checkpoints_session ON public.replay_checkpoints(session_id, checkpoint_ts);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.replay_checkpoints TO authenticated;
GRANT ALL ON public.replay_checkpoints TO service_role;
ALTER TABLE public.replay_checkpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own replay checkpoints" ON public.replay_checkpoints FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Replay templates table
CREATE TABLE public.replay_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  market TEXT NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL DEFAULT '5m',
  mode TEXT NOT NULL DEFAULT 'free',
  playback_speed NUMERIC NOT NULL DEFAULT 1,
  difficulty TEXT DEFAULT 'medium',
  favorite_session TEXT,
  objectives JSONB NOT NULL DEFAULT '[]'::jsonb,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_shared BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_replay_templates_user ON public.replay_templates(user_id, updated_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.replay_templates TO authenticated;
GRANT ALL ON public.replay_templates TO service_role;
ALTER TABLE public.replay_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own replay templates" ON public.replay_templates FOR ALL
  USING (auth.uid() = user_id OR is_shared = true)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_replay_templates_updated
BEFORE UPDATE ON public.replay_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

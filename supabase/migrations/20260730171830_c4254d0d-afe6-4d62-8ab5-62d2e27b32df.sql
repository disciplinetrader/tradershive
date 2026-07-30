ALTER TABLE public.replay_comparisons
  ADD COLUMN IF NOT EXISTS original_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS replay_entry_id uuid,
  ADD COLUMN IF NOT EXISTS attempt_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS comparison_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'in_progress',
  ADD COLUMN IF NOT EXISTS intent jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS telemetry jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS reflection jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_review jsonb,
  ADD COLUMN IF NOT EXISTS process_delta numeric,
  ADD COLUMN IF NOT EXISTS outcome_delta numeric,
  ADD COLUMN IF NOT EXISTS verdict text,
  ADD COLUMN IF NOT EXISTS is_best boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone;

ALTER TABLE public.replay_comparisons ALTER COLUMN session_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS replay_comparisons_entry_idx
  ON public.replay_comparisons (user_id, original_entry_id, attempt_number);
CREATE INDEX IF NOT EXISTS replay_comparisons_session_idx
  ON public.replay_comparisons (session_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.replay_comparisons TO authenticated;
GRANT ALL ON public.replay_comparisons TO service_role;
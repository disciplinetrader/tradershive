ALTER TABLE public.replay_comparisons ADD COLUMN IF NOT EXISTS mistake_focus text;

CREATE INDEX IF NOT EXISTS idx_replay_comparisons_user_status ON public.replay_comparisons (user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_replay_comparisons_entry ON public.replay_comparisons (original_entry_id);

ALTER TABLE public.replay_homework
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS skill text,
  ADD COLUMN IF NOT EXISTS source_entry_id uuid,
  ADD COLUMN IF NOT EXISTS source_comparison_id uuid,
  ADD COLUMN IF NOT EXISTS replay_mode text,
  ADD COLUMN IF NOT EXISTS target_mistake text,
  ADD COLUMN IF NOT EXISTS measurable_goal text,
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'coach',
  ADD COLUMN IF NOT EXISTS result jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_replay_homework_user_status ON public.replay_homework (user_id, status, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.replay_homework TO authenticated;
GRANT ALL ON public.replay_homework TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.replay_comparisons TO authenticated;
GRANT ALL ON public.replay_comparisons TO service_role;

DROP TRIGGER IF EXISTS trg_replay_homework_updated_at ON public.replay_homework;
CREATE TRIGGER trg_replay_homework_updated_at
BEFORE UPDATE ON public.replay_homework
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
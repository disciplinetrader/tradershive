ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS psychology jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS playbook_review jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS field_sources jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.journal_entries.psychology IS 'Structured before/during/after psychology capture from the unified trade editor.';
COMMENT ON COLUMN public.journal_entries.playbook_review IS 'User corrections to system rule verdicts and playbook selection.';
COMMENT ON COLUMN public.journal_entries.field_sources IS 'Per-field origin overrides (manual, imported, synced, replay, calculated, ai, corrected).';
-- 1) Additive columns on strategies
ALTER TABLE public.strategies
  ADD COLUMN IF NOT EXISTS mistakes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS checklist_required_ids text[] NOT NULL DEFAULT '{}';

-- 2) Checklist runs log
CREATE TABLE IF NOT EXISTS public.strategy_checklist_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  strategy_id uuid NOT NULL REFERENCES public.strategies(id) ON DELETE CASCADE,
  context text NOT NULL DEFAULT 'manual',
  context_ref_id uuid NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  all_required_passed boolean NOT NULL DEFAULT false,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT strategy_checklist_runs_context_ck
    CHECK (context IN ('paper','replay','journal','manual'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.strategy_checklist_runs TO authenticated;
GRANT ALL ON public.strategy_checklist_runs TO service_role;

ALTER TABLE public.strategy_checklist_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_checklist_runs_select"
  ON public.strategy_checklist_runs
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "own_checklist_runs_insert"
  ON public.strategy_checklist_runs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_checklist_runs_update"
  ON public.strategy_checklist_runs
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_checklist_runs_delete"
  ON public.strategy_checklist_runs
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS strategy_checklist_runs_user_strategy_idx
  ON public.strategy_checklist_runs (user_id, strategy_id, created_at DESC);
CREATE INDEX IF NOT EXISTS strategy_checklist_runs_context_idx
  ON public.strategy_checklist_runs (context, context_ref_id);

CREATE TABLE public.practice_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  practice_type text NOT NULL DEFAULT 'free',
  target_skill text,
  target_mistake text,
  playbook_id uuid,
  drill_id text,
  drill_version integer,
  symbol_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  timeframe_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  dataset_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  risk_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  trade_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  completion jsonb NOT NULL DEFAULT '{}'::jsonb,
  scoring_profile text NOT NULL DEFAULT 'default_v1',
  created_source text NOT NULL DEFAULT 'user',
  coach_source text,
  due_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  replay_session_id uuid REFERENCES public.replay_sessions(id) ON DELETE SET NULL,
  review_session_id uuid,
  hidden_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_practice_assignments_user ON public.practice_assignments(user_id, status, created_at DESC);
CREATE UNIQUE INDEX idx_practice_assignments_session ON public.practice_assignments(replay_session_id) WHERE replay_session_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.practice_assignments TO authenticated;
GRANT ALL ON public.practice_assignments TO service_role;
ALTER TABLE public.practice_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own practice assignments" ON public.practice_assignments FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_practice_assignments_updated_at BEFORE UPDATE ON public.practice_assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.skill_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  skill text NOT NULL,
  score numeric,
  score_version text NOT NULL,
  sample_size integer NOT NULL DEFAULT 0,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_session_id uuid REFERENCES public.replay_sessions(id) ON DELETE SET NULL,
  source_assignment_id uuid REFERENCES public.practice_assignments(id) ON DELETE SET NULL,
  source_drill_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_skill_results_user ON public.skill_results(user_id, skill, created_at DESC);
CREATE UNIQUE INDEX idx_skill_results_idem ON public.skill_results(source_assignment_id, skill, score_version) WHERE source_assignment_id IS NOT NULL;
GRANT SELECT, INSERT ON public.skill_results TO authenticated;
GRANT ALL ON public.skill_results TO service_role;
ALTER TABLE public.skill_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own skill results" ON public.skill_results FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert own skill results" ON public.skill_results FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.challenge_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  challenge_type text NOT NULL DEFAULT 'personal',
  version integer NOT NULL DEFAULT 1,
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  phases jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_challenge_templates_owner ON public.challenge_templates(owner_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.challenge_templates TO authenticated;
GRANT ALL ON public.challenge_templates TO service_role;
ALTER TABLE public.challenge_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own or public templates" ON public.challenge_templates FOR SELECT TO authenticated USING (auth.uid() = owner_id OR is_public);
CREATE POLICY "write own templates" ON public.challenge_templates FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "update own templates" ON public.challenge_templates FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "delete own templates" ON public.challenge_templates FOR DELETE TO authenticated USING (auth.uid() = owner_id);
CREATE TRIGGER trg_challenge_templates_updated_at BEFORE UPDATE ON public.challenge_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.challenge_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  template_id uuid REFERENCES public.challenge_templates(id) ON DELETE SET NULL,
  template_snapshot jsonb NOT NULL,
  template_version integer NOT NULL DEFAULT 1,
  title text NOT NULL,
  account_id uuid,
  prop_challenge_id uuid REFERENCES public.prop_challenges(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  current_phase integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  passed_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  evaluator_version text NOT NULL DEFAULT 'challenge_eval_v1',
  progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  evaluation jsonb NOT NULL DEFAULT '{}'::jsonb,
  audit_log jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_challenge_instances_user ON public.challenge_instances(user_id, status, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.challenge_instances TO authenticated;
GRANT ALL ON public.challenge_instances TO service_role;
ALTER TABLE public.challenge_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own challenge instances" ON public.challenge_instances FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_challenge_instances_updated_at BEFORE UPDATE ON public.challenge_instances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.challenge_violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL REFERENCES public.challenge_instances(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  rule_id text NOT NULL,
  rule_version integer NOT NULL DEFAULT 1,
  severity text NOT NULL DEFAULT 'breach',
  message text NOT NULL,
  current_value numeric,
  limit_value numeric,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_on date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_challenge_violation_idem ON public.challenge_violations(challenge_id, rule_id, COALESCE(occurred_on, '1970-01-01'::date));
GRANT SELECT, INSERT ON public.challenge_violations TO authenticated;
GRANT ALL ON public.challenge_violations TO service_role;
ALTER TABLE public.challenge_violations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own violations" ON public.challenge_violations FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert own violations" ON public.challenge_violations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.coaching_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  summary text,
  status text NOT NULL DEFAULT 'draft',
  source text NOT NULL DEFAULT 'user',
  version integer NOT NULL DEFAULT 1,
  review_cadence text,
  success_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_coaching_plans_user ON public.coaching_plans(user_id, status, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coaching_plans TO authenticated;
GRANT ALL ON public.coaching_plans TO service_role;
ALTER TABLE public.coaching_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own coaching plans" ON public.coaching_plans FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_coaching_plans_updated_at BEFORE UPDATE ON public.coaching_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.coaching_plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.coaching_plans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'drill',
  title text NOT NULL,
  detail text,
  drill_id text,
  assignment_id uuid REFERENCES public.practice_assignments(id) ON DELETE SET NULL,
  challenge_id uuid REFERENCES public.challenge_instances(id) ON DELETE SET NULL,
  homework_id uuid,
  priority integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'suggested',
  source text NOT NULL DEFAULT 'rule',
  approved_at timestamptz,
  due_at timestamptz,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_coaching_plan_items_plan ON public.coaching_plan_items(plan_id, priority DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coaching_plan_items TO authenticated;
GRANT ALL ON public.coaching_plan_items TO service_role;
ALTER TABLE public.coaching_plan_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own coaching plan items" ON public.coaching_plan_items FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_coaching_plan_items_updated_at BEFORE UPDATE ON public.coaching_plan_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.replay_homework
  ADD COLUMN IF NOT EXISTS due_at timestamptz,
  ADD COLUMN IF NOT EXISTS repeat_every_days integer,
  ADD COLUMN IF NOT EXISTS assignment_id uuid REFERENCES public.practice_assignments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS challenge_id uuid REFERENCES public.challenge_instances(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS history jsonb NOT NULL DEFAULT '[]'::jsonb;
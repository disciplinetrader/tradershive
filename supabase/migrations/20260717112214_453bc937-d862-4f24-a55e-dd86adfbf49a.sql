
-- Enums
DO $$ BEGIN CREATE TYPE public.ai_analysis_status AS ENUM ('queued','processing','succeeded','failed','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.ai_trade_grade AS ENUM ('A+','A','B','C','D','F'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.ai_report_period AS ENUM ('weekly','monthly','quarterly','annual'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.ai_recommendation_status AS ENUM ('open','in_progress','completed','dismissed','expired'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.ai_recommendation_priority AS ENUM ('low','medium','high','critical'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.ai_chat_role AS ENUM ('system','user','assistant','tool'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.ai_analysis_kind AS ENUM ('trade_review','journal_review','psychology','performance','weekly_report','monthly_report','quarterly_report','annual_report','recommendation','alert','playbook','chat_summary'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1. ai_providers
CREATE TABLE public.ai_providers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  base_url TEXT,
  auth_header TEXT,
  secret_key_ref TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  experimental BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_providers TO authenticated;
GRANT ALL ON public.ai_providers TO service_role;
ALTER TABLE public.ai_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_providers read" ON public.ai_providers FOR SELECT TO authenticated USING (true);
CREATE POLICY "ai_providers admin write" ON public.ai_providers FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(),'ai.manage_providers') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_permission(auth.uid(),'ai.manage_providers') OR public.has_role(auth.uid(),'super_admin'));
CREATE TRIGGER trg_ai_providers_updated BEFORE UPDATE ON public.ai_providers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. ai_models
CREATE TABLE public.ai_models (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID NOT NULL REFERENCES public.ai_providers(id) ON DELETE CASCADE,
  model_key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
  context_window INT,
  input_cost_credits NUMERIC(12,4) DEFAULT 0,
  output_cost_credits NUMERIC(12,4) DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  experimental BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_id, model_key)
);
GRANT SELECT ON public.ai_models TO authenticated;
GRANT ALL ON public.ai_models TO service_role;
ALTER TABLE public.ai_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_models read" ON public.ai_models FOR SELECT TO authenticated USING (true);
CREATE POLICY "ai_models admin write" ON public.ai_models FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(),'ai.manage_providers') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_permission(auth.uid(),'ai.manage_providers') OR public.has_role(auth.uid(),'super_admin'));
CREATE TRIGGER trg_ai_models_updated BEFORE UPDATE ON public.ai_models FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. ai_prompt_templates
CREATE TABLE public.ai_prompt_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  active_version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_prompt_templates TO authenticated;
GRANT ALL ON public.ai_prompt_templates TO service_role;
ALTER TABLE public.ai_prompt_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_prompt_templates read" ON public.ai_prompt_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "ai_prompt_templates admin write" ON public.ai_prompt_templates FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(),'ai.manage_prompts') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_permission(auth.uid(),'ai.manage_prompts') OR public.has_role(auth.uid(),'super_admin'));
CREATE TRIGGER trg_ai_prompt_templates_updated BEFORE UPDATE ON public.ai_prompt_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. ai_prompt_versions
CREATE TABLE public.ai_prompt_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.ai_prompt_templates(id) ON DELETE CASCADE,
  version INT NOT NULL,
  system_prompt TEXT NOT NULL,
  user_prompt TEXT NOT NULL,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_id, version)
);
GRANT SELECT ON public.ai_prompt_versions TO authenticated;
GRANT ALL ON public.ai_prompt_versions TO service_role;
ALTER TABLE public.ai_prompt_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_prompt_versions read" ON public.ai_prompt_versions FOR SELECT TO authenticated USING (true);
CREATE POLICY "ai_prompt_versions admin write" ON public.ai_prompt_versions FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(),'ai.manage_prompts') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_permission(auth.uid(),'ai.manage_prompts') OR public.has_role(auth.uid(),'super_admin'));

-- 5. ai_trade_reviews
CREATE TABLE public.ai_trade_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_id UUID NOT NULL REFERENCES public.paper_trades(id) ON DELETE CASCADE,
  version INT NOT NULL DEFAULT 1,
  superseded_by UUID REFERENCES public.ai_trade_reviews(id) ON DELETE SET NULL,
  model_key TEXT NOT NULL,
  provider_key TEXT NOT NULL,
  prompt_template_key TEXT,
  prompt_version INT,
  grade public.ai_trade_grade,
  confidence NUMERIC(5,2),
  summary TEXT,
  strengths JSONB DEFAULT '[]'::jsonb,
  mistakes JSONB DEFAULT '[]'::jsonb,
  execution_review TEXT,
  risk_review TEXT,
  psychology_review TEXT,
  alternative_entries JSONB DEFAULT '[]'::jsonb,
  alternative_exits JSONB DEFAULT '[]'::jsonb,
  better_stop TEXT,
  suggested_take_profit TEXT,
  missed_opportunities JSONB DEFAULT '[]'::jsonb,
  raw JSONB DEFAULT '{}'::jsonb,
  tokens_in INT DEFAULT 0,
  tokens_out INT DEFAULT 0,
  latency_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_trade_reviews_user_idx ON public.ai_trade_reviews(user_id, created_at DESC);
CREATE INDEX ai_trade_reviews_trade_idx ON public.ai_trade_reviews(trade_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_trade_reviews TO authenticated;
GRANT ALL ON public.ai_trade_reviews TO service_role;
ALTER TABLE public.ai_trade_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_trade_reviews own" ON public.ai_trade_reviews FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_ai_trade_reviews_updated BEFORE UPDATE ON public.ai_trade_reviews FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. ai_journal_reviews
CREATE TABLE public.ai_journal_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  journal_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  version INT NOT NULL DEFAULT 1,
  superseded_by UUID REFERENCES public.ai_journal_reviews(id) ON DELETE SET NULL,
  model_key TEXT NOT NULL,
  provider_key TEXT NOT NULL,
  quality_score NUMERIC(5,2),
  completeness NUMERIC(5,2),
  psychology_score NUMERIC(5,2),
  risk_score NUMERIC(5,2),
  emotion_score NUMERIC(5,2),
  consistency_score NUMERIC(5,2),
  notes_quality NUMERIC(5,2),
  summary TEXT,
  suggested_questions JSONB DEFAULT '[]'::jsonb,
  missing_information JSONB DEFAULT '[]'::jsonb,
  better_reflection TEXT,
  raw JSONB DEFAULT '{}'::jsonb,
  tokens_in INT DEFAULT 0,
  tokens_out INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_journal_reviews_user_idx ON public.ai_journal_reviews(user_id, created_at DESC);
CREATE INDEX ai_journal_reviews_journal_idx ON public.ai_journal_reviews(journal_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_journal_reviews TO authenticated;
GRANT ALL ON public.ai_journal_reviews TO service_role;
ALTER TABLE public.ai_journal_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_journal_reviews own" ON public.ai_journal_reviews FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_ai_journal_reviews_updated BEFORE UPDATE ON public.ai_journal_reviews FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. ai_psychology_reviews
CREATE TABLE public.ai_psychology_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  model_key TEXT NOT NULL,
  provider_key TEXT NOT NULL,
  summary TEXT,
  emotions JSONB DEFAULT '{}'::jsonb,
  patterns JSONB DEFAULT '[]'::jsonb,
  timeline JSONB DEFAULT '[]'::jsonb,
  heatmap JSONB DEFAULT '{}'::jsonb,
  emotion_vs_profit JSONB DEFAULT '{}'::jsonb,
  raw JSONB DEFAULT '{}'::jsonb,
  tokens_in INT DEFAULT 0,
  tokens_out INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_psychology_user_idx ON public.ai_psychology_reviews(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_psychology_reviews TO authenticated;
GRANT ALL ON public.ai_psychology_reviews TO service_role;
ALTER TABLE public.ai_psychology_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_psychology_reviews own" ON public.ai_psychology_reviews FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_ai_psych_updated BEFORE UPDATE ON public.ai_psychology_reviews FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8. ai_performance_reviews
CREATE TABLE public.ai_performance_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  model_key TEXT NOT NULL,
  provider_key TEXT NOT NULL,
  summary TEXT,
  best_session TEXT, worst_session TEXT,
  best_strategy TEXT, worst_strategy TEXT,
  best_pair TEXT, worst_pair TEXT,
  best_day TEXT, worst_day TEXT,
  best_time TEXT, worst_time TEXT,
  suggestions JSONB DEFAULT '[]'::jsonb,
  raw JSONB DEFAULT '{}'::jsonb,
  tokens_in INT DEFAULT 0,
  tokens_out INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_performance_user_idx ON public.ai_performance_reviews(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_performance_reviews TO authenticated;
GRANT ALL ON public.ai_performance_reviews TO service_role;
ALTER TABLE public.ai_performance_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_performance_reviews own" ON public.ai_performance_reviews FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_ai_perf_updated BEFORE UPDATE ON public.ai_performance_reviews FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 9. ai_reports
CREATE TABLE public.ai_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period public.ai_report_period NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  model_key TEXT NOT NULL,
  provider_key TEXT NOT NULL,
  title TEXT,
  summary TEXT,
  wins JSONB DEFAULT '[]'::jsonb,
  losses JSONB DEFAULT '[]'::jsonb,
  biggest_improvement TEXT,
  biggest_weakness TEXT,
  recommended_goals JSONB DEFAULT '[]'::jsonb,
  metrics JSONB DEFAULT '{}'::jsonb,
  raw JSONB DEFAULT '{}'::jsonb,
  tokens_in INT DEFAULT 0,
  tokens_out INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_reports_user_idx ON public.ai_reports(user_id, period, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_reports TO authenticated;
GRANT ALL ON public.ai_reports TO service_role;
ALTER TABLE public.ai_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_reports own" ON public.ai_reports FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_ai_reports_updated BEFORE UPDATE ON public.ai_reports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 10. ai_playbooks
CREATE TABLE public.ai_playbooks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT,
  description TEXT,
  rules JSONB DEFAULT '[]'::jsonb,
  checklist JSONB DEFAULT '[]'::jsonb,
  examples JSONB DEFAULT '[]'::jsonb,
  mistakes_to_avoid JSONB DEFAULT '[]'::jsonb,
  review_frequency TEXT DEFAULT 'weekly',
  source TEXT NOT NULL DEFAULT 'ai_generated',
  model_key TEXT,
  provider_key TEXT,
  pinned BOOLEAN NOT NULL DEFAULT false,
  archived BOOLEAN NOT NULL DEFAULT false,
  raw JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_playbooks_user_idx ON public.ai_playbooks(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_playbooks TO authenticated;
GRANT ALL ON public.ai_playbooks TO service_role;
ALTER TABLE public.ai_playbooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_playbooks own" ON public.ai_playbooks FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_ai_playbooks_updated BEFORE UPDATE ON public.ai_playbooks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 11. ai_recommendations
CREATE TABLE public.ai_recommendations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  priority public.ai_recommendation_priority NOT NULL DEFAULT 'medium',
  impact INT NOT NULL DEFAULT 3,
  difficulty INT NOT NULL DEFAULT 3,
  status public.ai_recommendation_status NOT NULL DEFAULT 'open',
  source TEXT DEFAULT 'ai_coach',
  model_key TEXT,
  provider_key TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_recommendations_user_idx ON public.ai_recommendations(user_id, status, priority);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_recommendations TO authenticated;
GRANT ALL ON public.ai_recommendations TO service_role;
ALTER TABLE public.ai_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_recommendations own" ON public.ai_recommendations FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_ai_recs_updated BEFORE UPDATE ON public.ai_recommendations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 12. ai_chat_sessions
CREATE TABLE public.ai_chat_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New conversation',
  model_key TEXT,
  provider_key TEXT,
  context JSONB NOT NULL DEFAULT '{"trades":true,"journal":true,"statistics":true,"challenges":true,"profile":true}'::jsonb,
  system_hint TEXT,
  pinned BOOLEAN NOT NULL DEFAULT false,
  archived BOOLEAN NOT NULL DEFAULT false,
  last_message_at TIMESTAMPTZ,
  message_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_chat_sessions_user_idx ON public.ai_chat_sessions(user_id, updated_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_chat_sessions TO authenticated;
GRANT ALL ON public.ai_chat_sessions TO service_role;
ALTER TABLE public.ai_chat_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_chat_sessions own" ON public.ai_chat_sessions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_ai_chat_sessions_updated BEFORE UPDATE ON public.ai_chat_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 13. ai_chat_messages
CREATE TABLE public.ai_chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.ai_chat_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_ref TEXT,
  role public.ai_chat_role NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  parts JSONB NOT NULL DEFAULT '[]'::jsonb,
  tokens_in INT DEFAULT 0,
  tokens_out INT DEFAULT 0,
  model_key TEXT,
  provider_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_chat_messages_session_idx ON public.ai_chat_messages(session_id, created_at ASC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_chat_messages TO authenticated;
GRANT ALL ON public.ai_chat_messages TO service_role;
ALTER TABLE public.ai_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_chat_messages own" ON public.ai_chat_messages FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 14. ai_analysis_queue
CREATE TABLE public.ai_analysis_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind public.ai_analysis_kind NOT NULL,
  entity_id UUID,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status public.ai_analysis_status NOT NULL DEFAULT 'queued',
  priority INT NOT NULL DEFAULT 5,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  result_id UUID,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_queue_user_idx ON public.ai_analysis_queue(user_id, status, scheduled_at);
CREATE INDEX ai_queue_status_idx ON public.ai_analysis_queue(status, priority, scheduled_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_analysis_queue TO authenticated;
GRANT ALL ON public.ai_analysis_queue TO service_role;
ALTER TABLE public.ai_analysis_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_queue own" ON public.ai_analysis_queue FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_ai_queue_updated BEFORE UPDATE ON public.ai_analysis_queue FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 15. ai_usage_logs
CREATE TABLE public.ai_usage_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  kind public.ai_analysis_kind,
  model_key TEXT NOT NULL,
  provider_key TEXT NOT NULL,
  tokens_in INT DEFAULT 0,
  tokens_out INT DEFAULT 0,
  cost_credits NUMERIC(12,4) DEFAULT 0,
  run_id TEXT,
  correlation_id TEXT,
  latency_ms INT,
  ok BOOLEAN NOT NULL DEFAULT true,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_usage_logs_user_idx ON public.ai_usage_logs(user_id, created_at DESC);
GRANT SELECT, INSERT ON public.ai_usage_logs TO authenticated;
GRANT ALL ON public.ai_usage_logs TO service_role;
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_usage_logs own read" ON public.ai_usage_logs FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_platform_admin(auth.uid()));
CREATE POLICY "ai_usage_logs own insert" ON public.ai_usage_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- 16. ai_settings
CREATE TABLE public.ai_settings (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  preferred_provider TEXT DEFAULT 'lovable',
  preferred_model TEXT DEFAULT 'openai/gpt-5.5',
  analysis_depth TEXT NOT NULL DEFAULT 'standard',
  auto_analyze_trades BOOLEAN NOT NULL DEFAULT true,
  auto_journal_review BOOLEAN NOT NULL DEFAULT true,
  auto_weekly_report BOOLEAN NOT NULL DEFAULT true,
  auto_monthly_report BOOLEAN NOT NULL DEFAULT true,
  share_data_with_ai BOOLEAN NOT NULL DEFAULT true,
  opt_out BOOLEAN NOT NULL DEFAULT false,
  smart_alerts BOOLEAN NOT NULL DEFAULT true,
  voice_coach BOOLEAN NOT NULL DEFAULT false,
  extras JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_settings TO authenticated;
GRANT ALL ON public.ai_settings TO service_role;
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_settings own" ON public.ai_settings FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_ai_settings_updated BEFORE UPDATE ON public.ai_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 17. ai_score_snapshots
CREATE TABLE public.ai_score_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  overall NUMERIC(5,2) NOT NULL DEFAULT 0,
  discipline NUMERIC(5,2) NOT NULL DEFAULT 0,
  risk_management NUMERIC(5,2) NOT NULL DEFAULT 0,
  consistency NUMERIC(5,2) NOT NULL DEFAULT 0,
  execution NUMERIC(5,2) NOT NULL DEFAULT 0,
  psychology NUMERIC(5,2) NOT NULL DEFAULT 0,
  journal_quality NUMERIC(5,2) NOT NULL DEFAULT 0,
  challenge_completion NUMERIC(5,2) NOT NULL DEFAULT 0,
  performance NUMERIC(5,2) NOT NULL DEFAULT 0,
  breakdown JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX ai_score_snapshots_user_idx ON public.ai_score_snapshots(user_id, computed_at DESC);
GRANT SELECT, INSERT, DELETE ON public.ai_score_snapshots TO authenticated;
GRANT ALL ON public.ai_score_snapshots TO service_role;
ALTER TABLE public.ai_score_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_score own" ON public.ai_score_snapshots FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 18. ai_habit_logs
CREATE TABLE public.ai_habit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  journal_consistency NUMERIC(5,2) DEFAULT 0,
  trading_consistency NUMERIC(5,2) DEFAULT 0,
  challenge_completion NUMERIC(5,2) DEFAULT 0,
  daily_login BOOLEAN NOT NULL DEFAULT false,
  risk_discipline NUMERIC(5,2) DEFAULT 0,
  trading_hours_within_target BOOLEAN,
  sleep_hours NUMERIC(4,1),
  exercise_minutes INT,
  overall_score NUMERIC(5,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, day)
);
CREATE INDEX ai_habit_logs_user_day_idx ON public.ai_habit_logs(user_id, day DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_habit_logs TO authenticated;
GRANT ALL ON public.ai_habit_logs TO service_role;
ALTER TABLE public.ai_habit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_habits own" ON public.ai_habit_logs FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_ai_habits_updated BEFORE UPDATE ON public.ai_habit_logs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 19. ai_alerts
CREATE TABLE public.ai_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_alerts_user_idx ON public.ai_alerts(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_alerts TO authenticated;
GRANT ALL ON public.ai_alerts TO service_role;
ALTER TABLE public.ai_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_alerts own" ON public.ai_alerts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Permissions catalog (label/group_name in this project)
INSERT INTO public.admin_permissions (key, label, group_name, description) VALUES
  ('ai.manage_providers','Manage AI providers','AI','Add, edit, disable AI providers and models'),
  ('ai.manage_prompts','Manage AI prompts','AI','Author and version AI prompt templates'),
  ('ai.view_usage','View AI usage logs','AI','Inspect AI usage across users')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key)
SELECT r::public.app_role, k FROM (VALUES
  ('super_admin','ai.manage_providers'),('super_admin','ai.manage_prompts'),('super_admin','ai.view_usage'),
  ('admin','ai.manage_providers'),('admin','ai.manage_prompts'),('admin','ai.view_usage')
) t(r,k)
ON CONFLICT DO NOTHING;

-- Seed providers
INSERT INTO public.ai_providers (key, name, description, base_url, auth_header, secret_key_ref, enabled, experimental, sort_order, config) VALUES
  ('lovable','Lovable AI Gateway','Managed AI Gateway. No API key required.','https://ai.gateway.lovable.dev/v1','Lovable-API-Key','LOVABLE_API_KEY',true,false,0,'{"managed":true,"streaming":true}'),
  ('openai','OpenAI','Direct OpenAI API.','https://api.openai.com/v1','Authorization','OPENAI_API_KEY',false,false,10,'{"streaming":true}'),
  ('anthropic','Anthropic Claude','Anthropic Claude models.','https://api.anthropic.com/v1','x-api-key','ANTHROPIC_API_KEY',false,false,20,'{"streaming":true}'),
  ('google','Google Gemini','Google Gemini models.','https://generativelanguage.googleapis.com/v1beta','x-goog-api-key','GEMINI_API_KEY',false,false,30,'{"streaming":true}'),
  ('azure','Azure OpenAI','Azure-hosted OpenAI.',NULL,'api-key','AZURE_OPENAI_API_KEY',false,true,40,'{"streaming":true}'),
  ('ollama','Ollama','Local Ollama server.','http://localhost:11434/v1',NULL,NULL,false,true,50,'{"local":true,"streaming":true}'),
  ('lmstudio','LM Studio','Local LM Studio server.','http://localhost:1234/v1',NULL,NULL,false,true,60,'{"local":true,"streaming":true}')
ON CONFLICT (key) DO NOTHING;

-- Seed Lovable models
INSERT INTO public.ai_models (provider_id, model_key, name, description, capabilities, context_window, enabled, is_default, sort_order)
SELECT p.id, m.model_key, m.name, m.description, m.capabilities, m.context_window, true, m.is_default, m.sort_order
FROM public.ai_providers p
CROSS JOIN (VALUES
  ('openai/gpt-5.5','GPT-5.5','Default. Frontier reasoning & multimodal.','{"text":true,"image":true,"streaming":true,"tools":true}'::jsonb, 400000, true, 0),
  ('openai/gpt-5.4-mini','GPT-5.4 Mini','Fast, cheaper mini model.','{"text":true,"image":true,"streaming":true,"tools":true}'::jsonb, 200000, false, 10),
  ('google/gemini-3.5-flash','Gemini 3.5 Flash','Fast Gemini for high-volume tasks.','{"text":true,"image":true,"streaming":true,"tools":true}'::jsonb, 1000000, false, 20),
  ('google/gemini-3.1-pro-preview','Gemini 3.1 Pro','Deep reasoning on Gemini.','{"text":true,"image":true,"streaming":true,"tools":true}'::jsonb, 1000000, false, 30)
) AS m(model_key, name, description, capabilities, context_window, is_default, sort_order)
WHERE p.key = 'lovable'
ON CONFLICT DO NOTHING;

-- Seed prompt templates + v1
DO $seed$
DECLARE
  t_id UUID;
  row RECORD;
BEGIN
  FOR row IN SELECT * FROM (VALUES
    ('trade_review','Trade Review','trade','Analyze a single closed trade in depth'),
    ('journal_review','Journal Review','journal','Evaluate a journal entry for quality and depth'),
    ('psychology','Psychology Analysis','psychology','Detect emotional patterns across trades and journal'),
    ('performance','Performance Coach','performance','Detect best/worst sessions, strategies, pairs, times'),
    ('weekly_report','Weekly Report','report','Weekly review with wins, losses, goals'),
    ('monthly_report','Monthly Report','report','Monthly performance review'),
    ('coach_chat','Coach Chat','chat','Conversational trading coach system prompt'),
    ('playbook','Playbook Generator','playbook','Generate a personalized trading playbook'),
    ('recommendations','Recommendations','recommendation','Personalized ranked recommendations')
  ) AS v(k,n,c,d) LOOP
    INSERT INTO public.ai_prompt_templates(key, name, category, description, active_version)
    VALUES (row.k, row.n, row.c, row.d, 1)
    ON CONFLICT (key) DO NOTHING;

    SELECT id INTO t_id FROM public.ai_prompt_templates WHERE key = row.k;

    INSERT INTO public.ai_prompt_versions(template_id, version, system_prompt, user_prompt, params)
    VALUES (
      t_id, 1,
      'You are TradersHIVE AI Coach, an expert trading mentor. Be precise, actionable, honest, and encouraging. Never invent data. Cite exact numbers when given. Return valid JSON when a schema is requested.',
      'Analyze the following context and produce the required response.',
      '{"temperature":0.4}'::jsonb
    )
    ON CONFLICT (template_id, version) DO NOTHING;
  END LOOP;
END $seed$;

-- Feature flags (label/rollout in this project)
INSERT INTO public.feature_flags (key, label, description, enabled, rollout_percent) VALUES
  ('ai.coach','AI Coach','Master switch for the AI Trading Coach module',true,100),
  ('ai.chat','AI Coach Chat','Conversational AI coach',true,100),
  ('ai.trade_review','Automatic Trade Reviews','Analyze every closed trade',true,100),
  ('ai.journal_review','Journal Reviews','Analyze journal quality',true,100),
  ('ai.psychology','Psychology Analysis','Detect emotional patterns',true,100),
  ('ai.performance','Performance Coach','Detect best/worst sessions and strategies',true,100),
  ('ai.weekly_reports','Weekly Reports','Auto-generated weekly reports',true,100),
  ('ai.monthly_reports','Monthly Reports','Auto-generated monthly reports',true,100),
  ('ai.playbooks','AI Playbooks','AI-generated playbooks',true,100),
  ('ai.smart_alerts','Smart Alerts','AI-driven behavioral alerts',true,100),
  ('ai.experimental_models','Experimental Models','Enable experimental providers/models',false,0),
  ('ai.voice_coach','Voice Coach (Future)','Voice-based coaching',false,0),
  ('ai.screen_recording','Screen Recording Analysis (Future)','Analyze screen recordings',false,0),
  ('ai.chart_image_analysis','Chart Image Analysis (Future)','Analyze chart screenshots',false,0),
  ('ai.live_assistant','Live Trading Assistant (Future)','Real-time coaching',false,0),
  ('ai.rag_knowledge_base','RAG Knowledge Base (Future)','Personalized RAG memory',false,0)
ON CONFLICT (key) DO NOTHING;


-- Strategy Builder schema
CREATE TYPE public.strategy_status AS ENUM ('draft','private','public','archived');
CREATE TYPE public.strategy_difficulty AS ENUM ('beginner','intermediate','advanced','expert');

CREATE TABLE public.strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT,
  description TEXT,
  category TEXT,
  market TEXT,
  timeframes TEXT[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  markets TEXT[] DEFAULT '{}',
  symbols TEXT[] DEFAULT '{}',
  market_conditions TEXT[] DEFAULT '{}',
  color TEXT DEFAULT '#8b5cf6',
  icon TEXT DEFAULT 'Sparkles',
  cover_url TEXT,
  status public.strategy_status NOT NULL DEFAULT 'draft',
  difficulty public.strategy_difficulty NOT NULL DEFAULT 'intermediate',
  estimated_timeframe TEXT,
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_template BOOLEAN NOT NULL DEFAULT false,
  template_source UUID,
  version INTEGER NOT NULL DEFAULT 1,
  entry_rules JSONB DEFAULT '[]'::jsonb,
  exit_rules JSONB DEFAULT '[]'::jsonb,
  risk_rules JSONB DEFAULT '{}'::jsonb,
  trade_management JSONB DEFAULT '{}'::jsonb,
  position_sizing JSONB DEFAULT '{}'::jsonb,
  notes TEXT,
  published_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.strategies(user_id, updated_at DESC);
CREATE INDEX ON public.strategies(status);
CREATE INDEX ON public.strategies USING GIN (tags);
CREATE INDEX ON public.strategies USING GIN (symbols);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.strategies TO authenticated;
GRANT ALL ON public.strategies TO service_role;
ALTER TABLE public.strategies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_strategies" ON public.strategies FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "read_public_strategies" ON public.strategies FOR SELECT USING (status = 'public');
CREATE TRIGGER strategies_updated BEFORE UPDATE ON public.strategies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.strategy_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES public.strategies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  change_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (strategy_id, version)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.strategy_versions TO authenticated;
GRANT ALL ON public.strategy_versions TO service_role;
ALTER TABLE public.strategy_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_versions" ON public.strategy_versions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.strategy_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES public.strategies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.strategy_checklists TO authenticated;
GRANT ALL ON public.strategy_checklists TO service_role;
ALTER TABLE public.strategy_checklists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_checklists" ON public.strategy_checklists FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER strategy_checklists_updated BEFORE UPDATE ON public.strategy_checklists FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.strategy_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id UUID NOT NULL REFERENCES public.strategy_checklists(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  required BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.strategy_checklist_items TO authenticated;
GRANT ALL ON public.strategy_checklist_items TO service_role;
ALTER TABLE public.strategy_checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_checklist_items" ON public.strategy_checklist_items FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.strategy_examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES public.strategies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ref_type TEXT NOT NULL, -- 'trade' | 'journal' | 'replay' | 'image' | 'video' | 'document' | 'note'
  ref_id UUID,
  title TEXT,
  description TEXT,
  url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.strategy_examples TO authenticated;
GRANT ALL ON public.strategy_examples TO service_role;
ALTER TABLE public.strategy_examples ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_examples" ON public.strategy_examples FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.strategy_playbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID REFERENCES public.strategies(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  overview TEXT,
  rules JSONB DEFAULT '[]'::jsonb,
  checklist JSONB DEFAULT '[]'::jsonb,
  mistakes JSONB DEFAULT '[]'::jsonb,
  examples JSONB DEFAULT '[]'::jsonb,
  color TEXT DEFAULT '#22c55e',
  icon TEXT DEFAULT 'BookMarked',
  cover_url TEXT,
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.strategy_playbooks TO authenticated;
GRANT ALL ON public.strategy_playbooks TO service_role;
ALTER TABLE public.strategy_playbooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_playbooks" ON public.strategy_playbooks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER strategy_playbooks_updated BEFORE UPDATE ON public.strategy_playbooks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.strategy_flow_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES public.strategies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  node_type TEXT NOT NULL,
  label TEXT,
  data JSONB DEFAULT '{}'::jsonb,
  pos_x DOUBLE PRECISION NOT NULL DEFAULT 0,
  pos_y DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.strategy_flow_nodes TO authenticated;
GRANT ALL ON public.strategy_flow_nodes TO service_role;
ALTER TABLE public.strategy_flow_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_flow_nodes" ON public.strategy_flow_nodes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER strategy_flow_nodes_updated BEFORE UPDATE ON public.strategy_flow_nodes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.strategy_flow_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES public.strategies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES public.strategy_flow_nodes(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES public.strategy_flow_nodes(id) ON DELETE CASCADE,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.strategy_flow_edges TO authenticated;
GRANT ALL ON public.strategy_flow_edges TO service_role;
ALTER TABLE public.strategy_flow_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_flow_edges" ON public.strategy_flow_edges FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.strategy_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES public.strategies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket TEXT NOT NULL,
  path TEXT NOT NULL,
  filename TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  kind TEXT DEFAULT 'file',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.strategy_attachments TO authenticated;
GRANT ALL ON public.strategy_attachments TO service_role;
ALTER TABLE public.strategy_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_attachments" ON public.strategy_attachments FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.strategy_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES public.strategies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.strategy_comments(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.strategy_comments TO authenticated;
GRANT ALL ON public.strategy_comments TO service_role;
ALTER TABLE public.strategy_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_comments" ON public.strategy_comments FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "read_public_comments" ON public.strategy_comments FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.strategies s WHERE s.id = strategy_id AND s.status = 'public')
);
CREATE TRIGGER strategy_comments_updated BEFORE UPDATE ON public.strategy_comments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.strategy_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES public.strategies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  detail JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.strategy_history TO authenticated;
GRANT ALL ON public.strategy_history TO service_role;
ALTER TABLE public.strategy_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_history" ON public.strategy_history FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.strategy_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  difficulty public.strategy_difficulty NOT NULL DEFAULT 'intermediate',
  markets TEXT[] DEFAULT '{}',
  timeframes TEXT[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  color TEXT DEFAULT '#8b5cf6',
  icon TEXT DEFAULT 'Sparkles',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_official BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.strategy_templates TO authenticated;
GRANT SELECT ON public.strategy_templates TO anon;
GRANT ALL ON public.strategy_templates TO service_role;
ALTER TABLE public.strategy_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_templates" ON public.strategy_templates FOR SELECT USING (true);
CREATE TRIGGER strategy_templates_updated BEFORE UPDATE ON public.strategy_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Link strategy on journal entries and paper trades (nullable)
ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS strategy_id UUID REFERENCES public.strategies(id) ON DELETE SET NULL;
ALTER TABLE public.paper_trades ADD COLUMN IF NOT EXISTS strategy_id UUID REFERENCES public.strategies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS journal_entries_strategy_idx ON public.journal_entries(strategy_id);
CREATE INDEX IF NOT EXISTS paper_trades_strategy_idx ON public.paper_trades(strategy_id);

-- Seed official templates
INSERT INTO public.strategy_templates (slug, name, description, category, difficulty, markets, timeframes, tags, color, icon, data) VALUES
('trend-following','Trend Following','Ride established trends using pullbacks to moving averages.','trend','intermediate', ARRAY['forex','indices','crypto'], ARRAY['H1','H4','D1'], ARRAY['Trend','EMA','Pullback'], '#22c55e','TrendingUp','{"entry_rules":[{"text":"Price above 200 EMA on higher timeframe"},{"text":"Pullback to 20 EMA on trigger TF"},{"text":"Bullish engulfing or pin bar at EMA"}],"exit_rules":[{"text":"Take profit at 2R or prior swing"},{"text":"Trail stop under swing lows once 1R reached"}],"risk_rules":{"max_risk_pct":1,"min_rr":2}}'::jsonb),
('breakout','Breakout','Enter on confirmed break of key levels with volume.','breakout','intermediate',ARRAY['stocks','crypto','indices'],ARRAY['M15','H1'],ARRAY['Breakout','Volume'],'#f97316','Zap','{"entry_rules":[{"text":"Consolidation range identified"},{"text":"Volume expansion on break"},{"text":"Retest holds"}],"exit_rules":[{"text":"Measured move target"},{"text":"Stop back inside range"}],"risk_rules":{"max_risk_pct":1,"min_rr":2}}'::jsonb),
('pullback','Pullback','Buy dips in uptrend, sell rallies in downtrend.','trend','beginner',ARRAY['forex','indices'],ARRAY['H1'],ARRAY['Pullback','Fib'],'#3b82f6','CornerDownRight','{}'::jsonb),
('momentum','Momentum','Trade strong momentum with RSI/MACD confirmation.','momentum','intermediate',ARRAY['stocks','crypto'],ARRAY['M15','H1'],ARRAY['Momentum','RSI'],'#eab308','Rocket','{}'::jsonb),
('mean-reversion','Mean Reversion','Fade extremes back to a mean using bands.','reversal','advanced',ARRAY['forex','indices'],ARRAY['M15'],ARRAY['Reversion','Bollinger'],'#a855f7','GitFork','{}'::jsonb),
('scalping','Scalping','Small quick trades on lower timeframes.','scalp','advanced',ARRAY['forex','indices'],ARRAY['M1','M5'],ARRAY['Scalp','Fast'],'#ef4444','Timer','{}'::jsonb),
('swing','Swing','Multi-day swing trades on higher timeframes.','swing','beginner',ARRAY['stocks','crypto'],ARRAY['H4','D1'],ARRAY['Swing'],'#14b8a6','Waves','{}'::jsonb),
('ict','ICT','Inner Circle Trader concepts: OB, FVG, liquidity.','smc','expert',ARRAY['forex','indices'],ARRAY['M15','H1'],ARRAY['ICT','SMC','FVG'],'#0ea5e9','Crosshair','{}'::jsonb),
('smc','SMC','Smart Money Concepts: BOS, CHOCH, order blocks.','smc','advanced',ARRAY['forex','crypto'],ARRAY['H1','H4'],ARRAY['SMC','BOS'],'#8b5cf6','LineChart','{}'::jsonb),
('orb','Opening Range Breakout','Break the first N-minute range of the session.','breakout','beginner',ARRAY['indices','stocks'],ARRAY['M5','M15'],ARRAY['ORB','Session'],'#f59e0b','Sunrise','{}'::jsonb),
('vwap','VWAP','Trade with VWAP as dynamic mean/support.','trend','intermediate',ARRAY['stocks','indices'],ARRAY['M5','M15'],ARRAY['VWAP'],'#06b6d4','Activity','{}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

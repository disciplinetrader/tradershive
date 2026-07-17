
-- =========================================================
-- Professional Trading Chart System — schema
-- =========================================================

-- chart_layouts
CREATE TABLE public.chart_layouts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  grid TEXT NOT NULL DEFAULT '1x1',
  symbols JSONB NOT NULL DEFAULT '[]'::jsonb,
  timeframes JSONB NOT NULL DEFAULT '[]'::jsonb,
  indicators JSONB NOT NULL DEFAULT '[]'::jsonb,
  drawings JSONB NOT NULL DEFAULT '[]'::jsonb,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  auto_save BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chart_layouts TO authenticated;
GRANT ALL ON public.chart_layouts TO service_role;
ALTER TABLE public.chart_layouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chart_layouts owner all" ON public.chart_layouts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX chart_layouts_user_idx ON public.chart_layouts(user_id);
CREATE TRIGGER trg_chart_layouts_updated_at
  BEFORE UPDATE ON public.chart_layouts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- chart_templates
CREATE TABLE public.chart_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  chart_type TEXT NOT NULL DEFAULT 'candles',
  colors JSONB NOT NULL DEFAULT '{}'::jsonb,
  indicators JSONB NOT NULL DEFAULT '[]'::jsonb,
  drawings JSONB NOT NULL DEFAULT '[]'::jsonb,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chart_templates TO authenticated;
GRANT ALL ON public.chart_templates TO service_role;
ALTER TABLE public.chart_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chart_templates owner all" ON public.chart_templates
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_chart_templates_updated_at
  BEFORE UPDATE ON public.chart_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- chart_drawings
CREATE TABLE public.chart_drawings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  layout_id UUID REFERENCES public.chart_layouts(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  timeframe TEXT,
  tool TEXT NOT NULL,
  points JSONB NOT NULL DEFAULT '[]'::jsonb,
  style JSONB NOT NULL DEFAULT '{}'::jsonb,
  text TEXT,
  locked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chart_drawings TO authenticated;
GRANT ALL ON public.chart_drawings TO service_role;
ALTER TABLE public.chart_drawings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chart_drawings owner all" ON public.chart_drawings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX chart_drawings_user_symbol_idx ON public.chart_drawings(user_id, symbol);
CREATE TRIGGER trg_chart_drawings_updated_at
  BEFORE UPDATE ON public.chart_drawings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- chart_notes
CREATE TABLE public.chart_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  timeframe TEXT,
  bar_time BIGINT,
  price NUMERIC,
  content TEXT NOT NULL,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chart_notes TO authenticated;
GRANT ALL ON public.chart_notes TO service_role;
ALTER TABLE public.chart_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chart_notes owner all" ON public.chart_notes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_chart_notes_updated_at
  BEFORE UPDATE ON public.chart_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- chart_alerts
CREATE TABLE public.chart_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  alert_type TEXT NOT NULL DEFAULT 'price_cross',
  condition TEXT NOT NULL DEFAULT 'above',
  target_price NUMERIC,
  indicator TEXT,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  notify_channels JSONB NOT NULL DEFAULT '["in_app"]'::jsonb,
  message TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  triggered_at TIMESTAMPTZ,
  triggered_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chart_alerts TO authenticated;
GRANT ALL ON public.chart_alerts TO service_role;
ALTER TABLE public.chart_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chart_alerts owner all" ON public.chart_alerts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX chart_alerts_user_symbol_idx ON public.chart_alerts(user_id, symbol);
CREATE TRIGGER trg_chart_alerts_updated_at
  BEFORE UPDATE ON public.chart_alerts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- chart_indicator_sets
CREATE TABLE public.chart_indicator_sets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  indicators JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chart_indicator_sets TO authenticated;
GRANT ALL ON public.chart_indicator_sets TO service_role;
ALTER TABLE public.chart_indicator_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chart_indicator_sets owner all" ON public.chart_indicator_sets
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_chart_indicator_sets_updated_at
  BEFORE UPDATE ON public.chart_indicator_sets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- chart_preferences (one row per user)
CREATE TABLE public.chart_preferences (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  default_chart_type TEXT NOT NULL DEFAULT 'candles',
  default_timeframe TEXT NOT NULL DEFAULT '1H',
  default_symbol TEXT NOT NULL DEFAULT 'BTC/USDT',
  theme TEXT NOT NULL DEFAULT 'dark',
  crosshair TEXT NOT NULL DEFAULT 'normal',
  show_grid BOOLEAN NOT NULL DEFAULT true,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  price_format TEXT NOT NULL DEFAULT 'auto',
  session_shading BOOLEAN NOT NULL DEFAULT false,
  auto_scale BOOLEAN NOT NULL DEFAULT true,
  log_scale BOOLEAN NOT NULL DEFAULT false,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chart_preferences TO authenticated;
GRANT ALL ON public.chart_preferences TO service_role;
ALTER TABLE public.chart_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chart_preferences owner all" ON public.chart_preferences
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_chart_preferences_updated_at
  BEFORE UPDATE ON public.chart_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- chart_history
CREATE TABLE public.chart_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  timeframe TEXT,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chart_history TO authenticated;
GRANT ALL ON public.chart_history TO service_role;
ALTER TABLE public.chart_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chart_history owner all" ON public.chart_history
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX chart_history_user_viewed_idx ON public.chart_history(user_id, viewed_at DESC);

-- saved_symbols
CREATE TABLE public.saved_symbols (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  folder TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, symbol, folder)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_symbols TO authenticated;
GRANT ALL ON public.saved_symbols TO service_role;
ALTER TABLE public.saved_symbols ENABLE ROW LEVEL SECURITY;
CREATE POLICY "saved_symbols owner all" ON public.saved_symbols
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- favorite_symbols
CREATE TABLE public.favorite_symbols (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, symbol)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.favorite_symbols TO authenticated;
GRANT ALL ON public.favorite_symbols TO service_role;
ALTER TABLE public.favorite_symbols ENABLE ROW LEVEL SECURITY;
CREATE POLICY "favorite_symbols owner all" ON public.favorite_symbols
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

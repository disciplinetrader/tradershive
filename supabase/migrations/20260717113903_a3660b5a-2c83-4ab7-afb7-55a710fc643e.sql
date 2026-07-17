
-- ============ Replay module ============

CREATE TABLE public.replay_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled Replay',
  mode TEXT NOT NULL DEFAULT 'free' CHECK (mode IN ('trade','session','free','day','range')),
  market TEXT NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL DEFAULT '5m',
  replay_date DATE,
  range_start TIMESTAMPTZ,
  range_end TIMESTAMPTZ,
  source_trade_id UUID,
  source_journal_id UUID,
  playback_speed NUMERIC NOT NULL DEFAULT 1,
  cursor_ts TIMESTAMPTZ,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  completion_pct NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed','archived')),
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  tags TEXT[] NOT NULL DEFAULT '{}',
  provider TEXT NOT NULL DEFAULT 'tradingview',
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_opened_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.replay_sessions TO authenticated;
GRANT ALL ON public.replay_sessions TO service_role;
ALTER TABLE public.replay_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own replay_sessions" ON public.replay_sessions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_replay_sessions_user ON public.replay_sessions(user_id, created_at DESC);
CREATE TRIGGER trg_replay_sessions_upd BEFORE UPDATE ON public.replay_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.replay_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.replay_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  market TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('long','short')),
  order_type TEXT NOT NULL DEFAULT 'market' CHECK (order_type IN ('market','limit','stop')),
  entry_price NUMERIC NOT NULL,
  exit_price NUMERIC,
  stop_loss NUMERIC,
  take_profit NUMERIC,
  lot_size NUMERIC NOT NULL DEFAULT 0,
  risk_pct NUMERIC,
  rr_planned NUMERIC,
  rr_realized NUMERIC,
  pnl NUMERIC,
  commission NUMERIC NOT NULL DEFAULT 0,
  swap NUMERIC NOT NULL DEFAULT 0,
  opened_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.replay_trades TO authenticated;
GRANT ALL ON public.replay_trades TO service_role;
ALTER TABLE public.replay_trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own replay_trades" ON public.replay_trades FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_replay_trades_session ON public.replay_trades(session_id);
CREATE TRIGGER trg_replay_trades_upd BEFORE UPDATE ON public.replay_trades FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.replay_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.replay_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_ts TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.replay_events TO authenticated;
GRANT ALL ON public.replay_events TO service_role;
ALTER TABLE public.replay_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own replay_events" ON public.replay_events FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_replay_events_session ON public.replay_events(session_id, event_ts);

CREATE TABLE public.replay_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.replay_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note_ts TIMESTAMPTZ NOT NULL,
  chart_x NUMERIC,
  chart_y NUMERIC,
  body TEXT NOT NULL DEFAULT '',
  screenshot_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.replay_notes TO authenticated;
GRANT ALL ON public.replay_notes TO service_role;
ALTER TABLE public.replay_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own replay_notes" ON public.replay_notes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_replay_notes_session ON public.replay_notes(session_id, note_ts);
CREATE TRIGGER trg_replay_notes_upd BEFORE UPDATE ON public.replay_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.replay_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.replay_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bookmark_ts TIMESTAMPTZ NOT NULL,
  label TEXT NOT NULL DEFAULT 'Bookmark',
  category TEXT NOT NULL DEFAULT 'custom' CHECK (category IN ('good_setup','bad_setup','mistake','lesson','question','custom')),
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.replay_bookmarks TO authenticated;
GRANT ALL ON public.replay_bookmarks TO service_role;
ALTER TABLE public.replay_bookmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own replay_bookmarks" ON public.replay_bookmarks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_replay_bookmarks_session ON public.replay_bookmarks(session_id, bookmark_ts);
CREATE TRIGGER trg_replay_bookmarks_upd BEFORE UPDATE ON public.replay_bookmarks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.replay_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.replay_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  checked BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.replay_checklists TO authenticated;
GRANT ALL ON public.replay_checklists TO service_role;
ALTER TABLE public.replay_checklists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own replay_checklists" ON public.replay_checklists FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_replay_checklists_session ON public.replay_checklists(session_id);
CREATE TRIGGER trg_replay_checklists_upd BEFORE UPDATE ON public.replay_checklists FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.replay_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.replay_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL DEFAULT 0,
  discipline INTEGER NOT NULL DEFAULT 0,
  risk INTEGER NOT NULL DEFAULT 0,
  execution INTEGER NOT NULL DEFAULT 0,
  patience INTEGER NOT NULL DEFAULT 0,
  consistency INTEGER NOT NULL DEFAULT 0,
  journal_completion INTEGER NOT NULL DEFAULT 0,
  breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.replay_scores TO authenticated;
GRANT ALL ON public.replay_scores TO service_role;
ALTER TABLE public.replay_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own replay_scores" ON public.replay_scores FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_replay_scores_session ON public.replay_scores(session_id);
CREATE TRIGGER trg_replay_scores_upd BEFORE UPDATE ON public.replay_scores FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.replay_statistics (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  total_sessions INTEGER NOT NULL DEFAULT 0,
  total_hours NUMERIC NOT NULL DEFAULT 0,
  total_trades INTEGER NOT NULL DEFAULT 0,
  streak_days INTEGER NOT NULL DEFAULT 0,
  last_practiced_at TIMESTAMPTZ,
  average_score NUMERIC NOT NULL DEFAULT 0,
  most_practiced_market TEXT,
  most_practiced_symbol TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.replay_statistics TO authenticated;
GRANT ALL ON public.replay_statistics TO service_role;
ALTER TABLE public.replay_statistics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own replay_statistics" ON public.replay_statistics FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_replay_statistics_upd BEFORE UPDATE ON public.replay_statistics FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.replay_drawings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.replay_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool TEXT NOT NULL,
  geometry JSONB NOT NULL DEFAULT '{}'::jsonb,
  style JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.replay_drawings TO authenticated;
GRANT ALL ON public.replay_drawings TO service_role;
ALTER TABLE public.replay_drawings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own replay_drawings" ON public.replay_drawings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_replay_drawings_session ON public.replay_drawings(session_id);
CREATE TRIGGER trg_replay_drawings_upd BEFORE UPDATE ON public.replay_drawings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.replay_screenshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.replay_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  captured_ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  storage_path TEXT NOT NULL,
  annotations JSONB NOT NULL DEFAULT '[]'::jsonb,
  caption TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.replay_screenshots TO authenticated;
GRANT ALL ON public.replay_screenshots TO service_role;
ALTER TABLE public.replay_screenshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own replay_screenshots" ON public.replay_screenshots FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_replay_screenshots_session ON public.replay_screenshots(session_id);
CREATE TRIGGER trg_replay_screenshots_upd BEFORE UPDATE ON public.replay_screenshots FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.replay_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.replay_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  original_trade_id UUID,
  replay_trade_id UUID REFERENCES public.replay_trades(id) ON DELETE SET NULL,
  entry_diff NUMERIC,
  exit_diff NUMERIC,
  rr_diff NUMERIC,
  timing_diff_seconds INTEGER,
  result_diff NUMERIC,
  breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.replay_comparisons TO authenticated;
GRANT ALL ON public.replay_comparisons TO service_role;
ALTER TABLE public.replay_comparisons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own replay_comparisons" ON public.replay_comparisons FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_replay_comparisons_session ON public.replay_comparisons(session_id);
CREATE TRIGGER trg_replay_comparisons_upd BEFORE UPDATE ON public.replay_comparisons FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage policies for replay buckets (buckets themselves created via tool)
CREATE POLICY "replay-images own read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'replay-images' AND owner = auth.uid());
CREATE POLICY "replay-images own write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'replay-images' AND owner = auth.uid());
CREATE POLICY "replay-images own update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'replay-images' AND owner = auth.uid());
CREATE POLICY "replay-images own delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'replay-images' AND owner = auth.uid());

CREATE POLICY "replay-annotations own read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'replay-annotations' AND owner = auth.uid());
CREATE POLICY "replay-annotations own write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'replay-annotations' AND owner = auth.uid());
CREATE POLICY "replay-annotations own update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'replay-annotations' AND owner = auth.uid());
CREATE POLICY "replay-annotations own delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'replay-annotations' AND owner = auth.uid());


-- Enhancement: queue states, priority, progress, retries; snapshots; sessions; coverage view.

ALTER TABLE public.historical_import_jobs
  ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS phase TEXT,
  ADD COLUMN IF NOT EXISTS progress INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_retries INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS provider_response_ms INTEGER,
  ADD COLUMN IF NOT EXISTS warning_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_hist_jobs_status_priority
  ON public.historical_import_jobs (status, priority, created_at);

-- Extend symbol metadata columns (all optional)
ALTER TABLE public.historical_symbols
  ADD COLUMN IF NOT EXISTS exchange TEXT,
  ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS tick_size NUMERIC,
  ADD COLUMN IF NOT EXISTS pip_value NUMERIC,
  ADD COLUMN IF NOT EXISTS price_precision INTEGER,
  ADD COLUMN IF NOT EXISTS lot_size NUMERIC,
  ADD COLUMN IF NOT EXISTS base_currency TEXT,
  ADD COLUMN IF NOT EXISTS quote_currency TEXT,
  ADD COLUMN IF NOT EXISTS instrument_type TEXT,
  ADD COLUMN IF NOT EXISTS trading_hours JSONB;

-- Replay snapshots for fast jump-to-date
CREATE TABLE IF NOT EXISTS public.historical_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  candle_index BIGINT NOT NULL,
  price NUMERIC NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (symbol, timeframe, ts)
);
GRANT SELECT ON public.historical_snapshots TO authenticated;
GRANT ALL ON public.historical_snapshots TO service_role;
ALTER TABLE public.historical_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hist_snap_read" ON public.historical_snapshots FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_hist_snap_lookup
  ON public.historical_snapshots (symbol, timeframe, ts);

-- Trading sessions catalog
CREATE TABLE IF NOT EXISTS public.historical_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market TEXT NOT NULL,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  open_utc TEXT NOT NULL,
  close_utc TEXT NOT NULL,
  days_of_week INTEGER[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (market, code)
);
GRANT SELECT ON public.historical_sessions TO authenticated;
GRANT ALL ON public.historical_sessions TO service_role;
ALTER TABLE public.historical_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hist_sess_read" ON public.historical_sessions FOR SELECT TO authenticated USING (true);

-- Seed session catalog (idempotent)
INSERT INTO public.historical_sessions (market, code, label, timezone, open_utc, close_utc, days_of_week, color, sort_order)
VALUES
  ('forex','sydney','Sydney','UTC','21:00','06:00',ARRAY[0,1,2,3,4],'#8b5cf6',0),
  ('forex','tokyo','Tokyo','UTC','00:00','09:00',ARRAY[1,2,3,4,5],'#a78bfa',1),
  ('forex','london','London','UTC','08:00','17:00',ARRAY[1,2,3,4,5],'#3b82f6',2),
  ('forex','new_york','New York','UTC','13:00','22:00',ARRAY[1,2,3,4,5],'#f59e0b',3),
  ('crypto','24_7','24/7','UTC','00:00','23:59',ARRAY[0,1,2,3,4,5,6],'#10b981',0),
  ('indices','pre_market','Pre-Market','UTC','09:00','14:30',ARRAY[1,2,3,4,5],'#94a3b8',0),
  ('indices','regular','Regular','UTC','14:30','21:00',ARRAY[1,2,3,4,5],'#3b82f6',1),
  ('indices','after_hours','After Hours','UTC','21:00','01:00',ARRAY[1,2,3,4,5],'#64748b',2)
ON CONFLICT (market, code) DO NOTHING;

-- Coverage matrix view
CREATE OR REPLACE VIEW public.historical_coverage AS
SELECT
  s.id AS symbol_id, s.symbol, s.market, s.source_code,
  s.is_enabled, s.earliest_available, s.latest_imported,
  c.timeframe,
  COUNT(c.ts)::BIGINT AS candles,
  MIN(c.ts) AS first_ts,
  MAX(c.ts) AS last_ts
FROM public.historical_symbols s
LEFT JOIN public.historical_candles c
  ON c.symbol = s.symbol AND c.provider_code = s.source_code
GROUP BY s.id, s.symbol, s.market, s.source_code, s.is_enabled,
         s.earliest_available, s.latest_imported, c.timeframe;

GRANT SELECT ON public.historical_coverage TO authenticated;

-- Notifications for admins (append-only)
CREATE TABLE IF NOT EXISTS public.historical_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  severity TEXT NOT NULL DEFAULT 'info',
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.historical_notifications TO authenticated;
GRANT ALL ON public.historical_notifications TO service_role;
ALTER TABLE public.historical_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hist_notif_admin_read"
  ON public.historical_notifications FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));
CREATE POLICY "hist_notif_admin_update"
  ON public.historical_notifications FOR UPDATE TO authenticated
  USING (public.is_platform_admin(auth.uid()));

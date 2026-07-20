
-- Data sources
CREATE TABLE IF NOT EXISTS public.historical_data_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  base_url TEXT,
  markets TEXT[] NOT NULL DEFAULT '{}',
  requires_key BOOLEAN NOT NULL DEFAULT false,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  priority INT NOT NULL DEFAULT 100,
  rate_limit_per_min INT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.historical_data_sources TO authenticated, anon;
GRANT ALL ON public.historical_data_sources TO service_role;
ALTER TABLE public.historical_data_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hds_read" ON public.historical_data_sources;
DROP POLICY IF EXISTS "hds_admin_write" ON public.historical_data_sources;
CREATE POLICY "hds_read" ON public.historical_data_sources FOR SELECT USING (true);
CREATE POLICY "hds_admin_write" ON public.historical_data_sources FOR ALL
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.historical_timeframes (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  seconds INT NOT NULL,
  is_base BOOLEAN NOT NULL DEFAULT false,
  aggregate_from TEXT,
  sort_order INT NOT NULL DEFAULT 0
);
GRANT SELECT ON public.historical_timeframes TO authenticated, anon;
GRANT ALL ON public.historical_timeframes TO service_role;
ALTER TABLE public.historical_timeframes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "htf_read" ON public.historical_timeframes;
DROP POLICY IF EXISTS "htf_admin_write" ON public.historical_timeframes;
CREATE POLICY "htf_read" ON public.historical_timeframes FOR SELECT USING (true);
CREATE POLICY "htf_admin_write" ON public.historical_timeframes FOR ALL
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.historical_symbols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES public.historical_data_sources(id) ON DELETE SET NULL,
  source_code TEXT NOT NULL,
  market TEXT NOT NULL,
  symbol TEXT NOT NULL,
  native_symbol TEXT NOT NULL,
  display_name TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  priority INT NOT NULL DEFAULT 100,
  earliest_available TIMESTAMPTZ,
  latest_imported TIMESTAMPTZ,
  base_timeframe TEXT NOT NULL DEFAULT '1m',
  timeframes TEXT[] NOT NULL DEFAULT ARRAY['1m','5m','15m','30m','1H','4H','1D','1W','1M']::TEXT[],
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_code, symbol)
);
CREATE INDEX IF NOT EXISTS hsym_market_idx ON public.historical_symbols(market, is_enabled);
CREATE INDEX IF NOT EXISTS hsym_symbol_idx ON public.historical_symbols(symbol);
GRANT SELECT ON public.historical_symbols TO authenticated, anon;
GRANT ALL ON public.historical_symbols TO service_role;
ALTER TABLE public.historical_symbols ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hsym_read" ON public.historical_symbols;
DROP POLICY IF EXISTS "hsym_admin_write" ON public.historical_symbols;
CREATE POLICY "hsym_read" ON public.historical_symbols FOR SELECT USING (true);
CREATE POLICY "hsym_admin_write" ON public.historical_symbols FOR ALL
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.historical_candles (
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  open  DOUBLE PRECISION NOT NULL,
  high  DOUBLE PRECISION NOT NULL,
  low   DOUBLE PRECISION NOT NULL,
  close DOUBLE PRECISION NOT NULL,
  volume DOUBLE PRECISION NOT NULL DEFAULT 0,
  source_code TEXT NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (symbol, timeframe, ts),
  CHECK (high >= low AND high >= open AND high >= close AND low <= open AND low <= close)
);
CREATE INDEX IF NOT EXISTS hcandles_sym_tf_ts_idx ON public.historical_candles (symbol, timeframe, ts DESC);
CREATE INDEX IF NOT EXISTS hcandles_ts_idx ON public.historical_candles (ts DESC);
GRANT SELECT ON public.historical_candles TO authenticated, anon;
GRANT ALL ON public.historical_candles TO service_role;
ALTER TABLE public.historical_candles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hc_read" ON public.historical_candles;
DROP POLICY IF EXISTS "hc_admin_write" ON public.historical_candles;
CREATE POLICY "hc_read" ON public.historical_candles FOR SELECT USING (true);
CREATE POLICY "hc_admin_write" ON public.historical_candles FOR ALL
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.historical_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol_id UUID REFERENCES public.historical_symbols(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  source_code TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  range_from TIMESTAMPTZ NOT NULL,
  range_to TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  triggered_by TEXT NOT NULL DEFAULT 'manual',
  candles_fetched INT NOT NULL DEFAULT 0,
  candles_inserted INT NOT NULL DEFAULT 0,
  candles_skipped INT NOT NULL DEFAULT 0,
  gaps_detected INT NOT NULL DEFAULT 0,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hij_status_idx ON public.historical_import_jobs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS hij_symbol_idx ON public.historical_import_jobs(symbol, timeframe, created_at DESC);
GRANT SELECT ON public.historical_import_jobs TO authenticated;
GRANT ALL ON public.historical_import_jobs TO service_role;
ALTER TABLE public.historical_import_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hij_admin_all" ON public.historical_import_jobs;
DROP POLICY IF EXISTS "hij_auth_read" ON public.historical_import_jobs;
CREATE POLICY "hij_admin_all" ON public.historical_import_jobs FOR ALL
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE POLICY "hij_auth_read" ON public.historical_import_jobs FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS public.historical_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  gap_from TIMESTAMPTZ NOT NULL,
  gap_to TIMESTAMPTZ NOT NULL,
  missing_candles INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  filled_at TIMESTAMPTZ,
  filled_by UUID REFERENCES public.historical_import_jobs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hg_sym_tf_idx ON public.historical_gaps(symbol, timeframe, status);
GRANT SELECT ON public.historical_gaps TO authenticated;
GRANT ALL ON public.historical_gaps TO service_role;
ALTER TABLE public.historical_gaps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hg_admin_all" ON public.historical_gaps;
DROP POLICY IF EXISTS "hg_auth_read" ON public.historical_gaps;
CREATE POLICY "hg_admin_all" ON public.historical_gaps FOR ALL
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE POLICY "hg_auth_read" ON public.historical_gaps FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS public.historical_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES public.historical_import_jobs(id) ON DELETE CASCADE,
  symbol TEXT,
  source_code TEXT,
  level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hsl_job_idx ON public.historical_sync_logs(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS hsl_ts_idx ON public.historical_sync_logs(created_at DESC);
GRANT SELECT ON public.historical_sync_logs TO authenticated;
GRANT ALL ON public.historical_sync_logs TO service_role;
ALTER TABLE public.historical_sync_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hsl_admin_all" ON public.historical_sync_logs;
DROP POLICY IF EXISTS "hsl_auth_read" ON public.historical_sync_logs;
CREATE POLICY "hsl_admin_all" ON public.historical_sync_logs FOR ALL
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE POLICY "hsl_auth_read" ON public.historical_sync_logs FOR SELECT
  USING (auth.role() = 'authenticated');

DROP TRIGGER IF EXISTS trg_hds_updated_at ON public.historical_data_sources;
CREATE TRIGGER trg_hds_updated_at BEFORE UPDATE ON public.historical_data_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_hsym_updated_at ON public.historical_symbols;
CREATE TRIGGER trg_hsym_updated_at BEFORE UPDATE ON public.historical_symbols
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_hij_updated_at ON public.historical_import_jobs;
CREATE TRIGGER trg_hij_updated_at BEFORE UPDATE ON public.historical_import_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.historical_timeframes (code, label, seconds, is_base, aggregate_from, sort_order) VALUES
  ('1m','1 Minute',60,true,NULL,10),('5m','5 Minute',300,false,'1m',20),
  ('15m','15 Minute',900,false,'1m',30),('30m','30 Minute',1800,false,'1m',40),
  ('1H','1 Hour',3600,false,'1m',50),('4H','4 Hour',14400,false,'1m',60),
  ('1D','1 Day',86400,false,'1m',70),('1W','1 Week',604800,false,'1D',80),
  ('1M','1 Month',2592000,false,'1D',90)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.historical_data_sources (code,name,description,base_url,markets,requires_key,priority) VALUES
  ('binance','Binance','Public Binance klines REST API','https://api.binance.com',ARRAY['crypto'],false,10),
  ('dukascopy','Dukascopy','Free Dukascopy historical feed','https://freeserv.dukascopy.com',ARRAY['forex','metals','indices','commodities'],false,20)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.historical_symbols (source_code,market,symbol,native_symbol,display_name,priority)
SELECT 'binance','crypto',s,replace(s,'/',''),s,i FROM (VALUES
  ('BTC/USDT',10),('ETH/USDT',20),('SOL/USDT',30),('BNB/USDT',40),
  ('XRP/USDT',50),('DOGE/USDT',60),('ADA/USDT',70),('LINK/USDT',80)
) AS t(s,i)
ON CONFLICT (source_code,symbol) DO NOTHING;

INSERT INTO public.historical_symbols (source_code,market,symbol,native_symbol,display_name,priority)
SELECT 'dukascopy',m,s,native,s,i FROM (VALUES
  ('forex','EUR/USD','eurusd',10),('forex','GBP/USD','gbpusd',20),
  ('forex','USD/JPY','usdjpy',30),('forex','USD/CHF','usdchf',40),
  ('forex','AUD/USD','audusd',50),('forex','NZD/USD','nzdusd',60),
  ('forex','USD/CAD','usdcad',70),('forex','EUR/JPY','eurjpy',80),
  ('forex','GBP/JPY','gbpjpy',90),('forex','EUR/GBP','eurgbp',100),
  ('forex','AUD/JPY','audjpy',110),('forex','CHF/JPY','chfjpy',120),
  ('metals','XAU/USD','xauusd',130),('metals','XAG/USD','xagusd',140),
  ('commodities','WTI/USD','wtiusd',150),('commodities','BRENT/USD','brentcmdusd',160),
  ('indices','SPX500','usa500idxusd',170),('indices','NAS100','usatechidxusd',180),
  ('indices','US30','usa30idxusd',190),('indices','GER40','deuidxeur',200)
) AS t(m,s,native,i)
ON CONFLICT (source_code,symbol) DO NOTHING;

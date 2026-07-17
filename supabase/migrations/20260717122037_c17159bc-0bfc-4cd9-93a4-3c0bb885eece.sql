
-- ============ MARKET DATA ENGINE ============

-- Enums
DO $$ BEGIN
  CREATE TYPE public.market_kind AS ENUM ('forex','crypto','indices','metals','commodities','futures','stocks');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.market_status_kind AS ENUM ('open','closed','pre_market','after_hours','holiday','maintenance');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.provider_status AS ENUM ('connected','disconnected','connecting','error','disabled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.timeframe_kind AS ENUM ('tick','1m','3m','5m','15m','30m','1H','2H','4H','1D','1W','1M');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.price_alert_kind AS ENUM ('above','below','cross_up','cross_down');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- market_providers
CREATE TABLE IF NOT EXISTS public.market_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  supports_rest BOOLEAN NOT NULL DEFAULT true,
  supports_ws BOOLEAN NOT NULL DEFAULT false,
  supports_historical BOOLEAN NOT NULL DEFAULT true,
  supports_streaming BOOLEAN NOT NULL DEFAULT false,
  markets public.market_kind[] NOT NULL DEFAULT ARRAY[]::public.market_kind[],
  priority INTEGER NOT NULL DEFAULT 100,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.market_providers TO authenticated;
GRANT ALL ON public.market_providers TO service_role;
ALTER TABLE public.market_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "providers_read_auth" ON public.market_providers FOR SELECT TO authenticated USING (true);
CREATE POLICY "providers_admin_write" ON public.market_providers FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

-- ---------- provider_connections
CREATE TABLE IF NOT EXISTS public.provider_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.market_providers(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.provider_status NOT NULL DEFAULT 'disconnected',
  latency_ms INTEGER,
  last_heartbeat TIMESTAMPTZ,
  last_error TEXT,
  connected_at TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.provider_connections TO authenticated;
GRANT ALL ON public.provider_connections TO service_role;
ALTER TABLE public.provider_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conn_admin_all" ON public.provider_connections FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE POLICY "conn_own_read" ON public.provider_connections FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ---------- markets
CREATE TABLE IF NOT EXISTS public.markets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  kind public.market_kind NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  is_24_7 BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.markets TO authenticated;
GRANT ALL ON public.markets TO service_role;
ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "markets_read_auth" ON public.markets FOR SELECT TO authenticated USING (true);
CREATE POLICY "markets_admin_write" ON public.markets FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

-- ---------- symbol_categories
CREATE TABLE IF NOT EXISTS public.symbol_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  market_kind public.market_kind,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.symbol_categories TO authenticated;
GRANT ALL ON public.symbol_categories TO service_role;
ALTER TABLE public.symbol_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cats_read_auth" ON public.symbol_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "cats_admin_write" ON public.symbol_categories FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

-- ---------- symbols
CREATE TABLE IF NOT EXISTS public.symbols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  market_kind public.market_kind NOT NULL,
  base_asset TEXT,
  quote_asset TEXT,
  tick_size NUMERIC(20,10) NOT NULL DEFAULT 0.00001,
  contract_size NUMERIC(20,6) NOT NULL DEFAULT 1,
  price_precision INTEGER NOT NULL DEFAULT 5,
  category_id UUID REFERENCES public.symbol_categories(id) ON DELETE SET NULL,
  is_popular BOOLEAN NOT NULL DEFAULT false,
  is_trending BOOLEAN NOT NULL DEFAULT false,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS symbols_market_idx ON public.symbols(market_kind);
CREATE INDEX IF NOT EXISTS symbols_popular_idx ON public.symbols(is_popular) WHERE is_popular;
CREATE INDEX IF NOT EXISTS symbols_search_idx ON public.symbols USING gin(to_tsvector('simple', symbol || ' ' || display_name));
GRANT SELECT ON public.symbols TO authenticated;
GRANT ALL ON public.symbols TO service_role;
ALTER TABLE public.symbols ENABLE ROW LEVEL SECURITY;
CREATE POLICY "symbols_read_auth" ON public.symbols FOR SELECT TO authenticated USING (true);
CREATE POLICY "symbols_admin_write" ON public.symbols FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

-- ---------- provider_symbols
CREATE TABLE IF NOT EXISTS public.provider_symbols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.market_providers(id) ON DELETE CASCADE,
  symbol_id UUID NOT NULL REFERENCES public.symbols(id) ON DELETE CASCADE,
  native_symbol TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider_id, symbol_id)
);
CREATE INDEX IF NOT EXISTS ps_native_idx ON public.provider_symbols(provider_id, native_symbol);
GRANT SELECT ON public.provider_symbols TO authenticated;
GRANT ALL ON public.provider_symbols TO service_role;
ALTER TABLE public.provider_symbols ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ps_read_auth" ON public.provider_symbols FOR SELECT TO authenticated USING (true);
CREATE POLICY "ps_admin_write" ON public.provider_symbols FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

-- ---------- market_sessions
CREATE TABLE IF NOT EXISTS public.market_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  market_kind public.market_kind NOT NULL DEFAULT 'forex',
  open_utc_minute INTEGER NOT NULL,
  close_utc_minute INTEGER NOT NULL,
  weekdays INTEGER[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.market_sessions TO authenticated;
GRANT ALL ON public.market_sessions TO service_role;
ALTER TABLE public.market_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sess_read_auth" ON public.market_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "sess_admin_write" ON public.market_sessions FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

-- ---------- market_holidays
CREATE TABLE IF NOT EXISTS public.market_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  holiday_date DATE NOT NULL,
  name TEXT NOT NULL,
  is_full_day BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(market_id, holiday_date)
);
GRANT SELECT ON public.market_holidays TO authenticated;
GRANT ALL ON public.market_holidays TO service_role;
ALTER TABLE public.market_holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hol_read_auth" ON public.market_holidays FOR SELECT TO authenticated USING (true);
CREATE POLICY "hol_admin_write" ON public.market_holidays FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

-- ---------- market_status
CREATE TABLE IF NOT EXISTS public.market_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE UNIQUE,
  status public.market_status_kind NOT NULL DEFAULT 'closed',
  next_open TIMESTAMPTZ,
  next_close TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.market_status TO authenticated;
GRANT ALL ON public.market_status TO service_role;
ALTER TABLE public.market_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mst_read_auth" ON public.market_status FOR SELECT TO authenticated USING (true);
CREATE POLICY "mst_admin_write" ON public.market_status FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

-- ---------- historical_candles
CREATE TABLE IF NOT EXISTS public.historical_candles (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  timeframe public.timeframe_kind NOT NULL,
  provider_code TEXT NOT NULL DEFAULT 'mock',
  ts TIMESTAMPTZ NOT NULL,
  open NUMERIC(20,10) NOT NULL,
  high NUMERIC(20,10) NOT NULL,
  low NUMERIC(20,10) NOT NULL,
  close NUMERIC(20,10) NOT NULL,
  volume NUMERIC(24,6) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(symbol, timeframe, provider_code, ts)
);
CREATE INDEX IF NOT EXISTS hc_lookup_idx ON public.historical_candles(symbol, timeframe, ts DESC);
GRANT SELECT ON public.historical_candles TO authenticated;
GRANT ALL ON public.historical_candles TO service_role;
ALTER TABLE public.historical_candles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hc_read_auth" ON public.historical_candles FOR SELECT TO authenticated USING (true);
CREATE POLICY "hc_admin_write" ON public.historical_candles FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

-- ---------- historical_cache
CREATE TABLE IF NOT EXISTS public.historical_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  timeframe public.timeframe_kind NOT NULL,
  provider_code TEXT NOT NULL,
  range_start TIMESTAMPTZ NOT NULL,
  range_end TIMESTAMPTZ NOT NULL,
  candle_count INTEGER NOT NULL DEFAULT 0,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(symbol, timeframe, provider_code, range_start, range_end)
);
GRANT SELECT ON public.historical_cache TO authenticated;
GRANT ALL ON public.historical_cache TO service_role;
ALTER TABLE public.historical_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hcache_read_auth" ON public.historical_cache FOR SELECT TO authenticated USING (true);
CREATE POLICY "hcache_admin_write" ON public.historical_cache FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

-- ---------- live_quotes
CREATE TABLE IF NOT EXISTS public.live_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL UNIQUE,
  provider_code TEXT NOT NULL DEFAULT 'mock',
  bid NUMERIC(20,10),
  ask NUMERIC(20,10),
  last NUMERIC(20,10),
  spread NUMERIC(20,10),
  open NUMERIC(20,10),
  high NUMERIC(20,10),
  low NUMERIC(20,10),
  close NUMERIC(20,10),
  volume NUMERIC(24,6),
  change_pct NUMERIC(10,4),
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.live_quotes TO authenticated;
GRANT ALL ON public.live_quotes TO service_role;
ALTER TABLE public.live_quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lq_read_auth" ON public.live_quotes FOR SELECT TO authenticated USING (true);
CREATE POLICY "lq_admin_write" ON public.live_quotes FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

-- ---------- quote_cache
CREATE TABLE IF NOT EXISTS public.quote_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.quote_cache TO authenticated;
GRANT ALL ON public.quote_cache TO service_role;
ALTER TABLE public.quote_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qc_read_auth" ON public.quote_cache FOR SELECT TO authenticated USING (true);
CREATE POLICY "qc_admin_write" ON public.quote_cache FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

-- ---------- subscriptions
CREATE TABLE IF NOT EXISTS public.market_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_code TEXT NOT NULL,
  symbol TEXT NOT NULL,
  timeframe public.timeframe_kind,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider_code, symbol, timeframe)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.market_subscriptions TO authenticated;
GRANT ALL ON public.market_subscriptions TO service_role;
ALTER TABLE public.market_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sub_own_all" ON public.market_subscriptions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------- stream_connections
CREATE TABLE IF NOT EXISTS public.stream_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.market_providers(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  status public.provider_status NOT NULL DEFAULT 'disconnected',
  subscription_count INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER,
  connected_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.stream_connections TO authenticated;
GRANT ALL ON public.stream_connections TO service_role;
ALTER TABLE public.stream_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sc_admin_all" ON public.stream_connections FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

-- ---------- stream_events
CREATE TABLE IF NOT EXISTS public.stream_events (
  id BIGSERIAL PRIMARY KEY,
  provider_id UUID REFERENCES public.market_providers(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  message TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS se_provider_idx ON public.stream_events(provider_id, created_at DESC);
GRANT SELECT ON public.stream_events TO authenticated;
GRANT ALL ON public.stream_events TO service_role;
ALTER TABLE public.stream_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "se_admin_all" ON public.stream_events FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

-- ---------- price_alerts
CREATE TABLE IF NOT EXISTS public.price_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  kind public.price_alert_kind NOT NULL,
  target_price NUMERIC(20,10) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  triggered_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pa_user_idx ON public.price_alerts(user_id, is_active);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_alerts TO authenticated;
GRANT ALL ON public.price_alerts TO service_role;
ALTER TABLE public.price_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pa_own_all" ON public.price_alerts FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------- user_market_settings
CREATE TABLE IF NOT EXISTS public.user_market_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  preferred_provider TEXT,
  preferred_timezone TEXT NOT NULL DEFAULT 'UTC',
  preferred_market public.market_kind NOT NULL DEFAULT 'forex',
  default_symbol TEXT NOT NULL DEFAULT 'EURUSD',
  default_timeframe public.timeframe_kind NOT NULL DEFAULT '1H',
  streaming_quality TEXT NOT NULL DEFAULT 'balanced',
  auto_refresh_seconds INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_market_settings TO authenticated;
GRANT ALL ON public.user_market_settings TO service_role;
ALTER TABLE public.user_market_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ums_own_all" ON public.user_market_settings FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------- user_favorite_symbols
CREATE TABLE IF NOT EXISTS public.user_favorite_symbols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, symbol)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_favorite_symbols TO authenticated;
GRANT ALL ON public.user_favorite_symbols TO service_role;
ALTER TABLE public.user_favorite_symbols ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ufs_own_all" ON public.user_favorite_symbols FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------- user_recent_symbols
CREATE TABLE IF NOT EXISTS public.user_recent_symbols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, symbol)
);
CREATE INDEX IF NOT EXISTS urs_user_time ON public.user_recent_symbols(user_id, viewed_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_recent_symbols TO authenticated;
GRANT ALL ON public.user_recent_symbols TO service_role;
ALTER TABLE public.user_recent_symbols ENABLE ROW LEVEL SECURITY;
CREATE POLICY "urs_own_all" ON public.user_recent_symbols FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------- updated_at triggers
DO $$ BEGIN
  CREATE TRIGGER trg_providers_updated BEFORE UPDATE ON public.market_providers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_conn_updated BEFORE UPDATE ON public.provider_connections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_markets_updated BEFORE UPDATE ON public.markets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_cats_updated BEFORE UPDATE ON public.symbol_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_symbols_updated BEFORE UPDATE ON public.symbols FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_ps_updated BEFORE UPDATE ON public.provider_symbols FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_sess_updated BEFORE UPDATE ON public.market_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_hol_updated BEFORE UPDATE ON public.market_holidays FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_mst_updated BEFORE UPDATE ON public.market_status FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_hcache_updated BEFORE UPDATE ON public.historical_cache FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_lq_updated BEFORE UPDATE ON public.live_quotes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_sub_updated BEFORE UPDATE ON public.market_subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_sc_updated BEFORE UPDATE ON public.stream_connections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_pa_updated BEFORE UPDATE ON public.price_alerts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_ums_updated BEFORE UPDATE ON public.user_market_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ SEED DATA ============

INSERT INTO public.market_providers (code, name, description, supports_rest, supports_ws, supports_historical, supports_streaming, markets, priority, is_default, config)
VALUES
  ('binance', 'Binance', 'Crypto spot & derivatives', true, true, true, true, ARRAY['crypto']::public.market_kind[], 10, false, '{"rest_base":"https://api.binance.com","ws_base":"wss://stream.binance.com:9443"}'::jsonb),
  ('oanda',   'OANDA',   'FX & CFDs',                 true, true, true, true, ARRAY['forex','metals','indices','commodities']::public.market_kind[], 20, false, '{"rest_base":"https://api-fxtrade.oanda.com","stream_base":"https://stream-fxtrade.oanda.com"}'::jsonb),
  ('mock',    'Development Mock', 'Deterministic synthetic data', true, true, true, true, ARRAY['crypto','forex','indices','metals','commodities','futures','stocks']::public.market_kind[], 100, true, '{}'::jsonb)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.markets (code, name, kind, timezone, is_24_7) VALUES
  ('forex',      'Global Forex',    'forex', 'UTC', false),
  ('crypto',     'Global Crypto',   'crypto', 'UTC', true),
  ('metals',     'Precious Metals', 'metals', 'UTC', false),
  ('indices',    'World Indices',   'indices', 'UTC', false),
  ('commodities','Commodities',     'commodities', 'UTC', false),
  ('futures',    'Futures',         'futures', 'UTC', false),
  ('stocks',     'Stocks',          'stocks', 'America/New_York', false)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.symbol_categories (code, name, market_kind, sort_order) VALUES
  ('fx_majors','FX Majors','forex',10),
  ('fx_minors','FX Minors','forex',20),
  ('metals','Metals','metals',30),
  ('crypto_top','Crypto Top','crypto',40),
  ('crypto_alt','Crypto Alts','crypto',50),
  ('indices_us','US Indices','indices',60),
  ('indices_eu','EU Indices','indices',70)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.symbols (symbol, display_name, market_kind, base_asset, quote_asset, tick_size, price_precision, is_popular, category_id)
SELECT s.symbol, s.display_name, s.market_kind::public.market_kind, s.base, s.quote, s.tick, s.prec, true, c.id
FROM (VALUES
  ('EURUSD','EUR / USD','forex','EUR','USD',0.00001,5,'fx_majors'),
  ('GBPUSD','GBP / USD','forex','GBP','USD',0.00001,5,'fx_majors'),
  ('USDJPY','USD / JPY','forex','USD','JPY',0.001,3,'fx_majors'),
  ('USDCHF','USD / CHF','forex','USD','CHF',0.00001,5,'fx_majors'),
  ('AUDUSD','AUD / USD','forex','AUD','USD',0.00001,5,'fx_majors'),
  ('NZDUSD','NZD / USD','forex','NZD','USD',0.00001,5,'fx_majors'),
  ('USDCAD','USD / CAD','forex','USD','CAD',0.00001,5,'fx_majors'),
  ('XAUUSD','Gold / USD','metals','XAU','USD',0.01,2,'metals'),
  ('XAGUSD','Silver / USD','metals','XAG','USD',0.001,3,'metals'),
  ('BTCUSDT','BTC / USDT','crypto','BTC','USDT',0.01,2,'crypto_top'),
  ('ETHUSDT','ETH / USDT','crypto','ETH','USDT',0.01,2,'crypto_top'),
  ('SOLUSDT','SOL / USDT','crypto','SOL','USDT',0.001,3,'crypto_top'),
  ('BNBUSDT','BNB / USDT','crypto','BNB','USDT',0.01,2,'crypto_top'),
  ('XRPUSDT','XRP / USDT','crypto','XRP','USDT',0.0001,4,'crypto_alt'),
  ('ADAUSDT','ADA / USDT','crypto','ADA','USDT',0.0001,4,'crypto_alt'),
  ('DOGEUSDT','DOGE / USDT','crypto','DOGE','USDT',0.00001,5,'crypto_alt'),
  ('SPX500','S&P 500','indices','SPX','USD',0.1,1,'indices_us'),
  ('NAS100','NASDAQ 100','indices','NAS','USD',0.1,1,'indices_us'),
  ('US30','Dow Jones 30','indices','DJI','USD',0.1,1,'indices_us')
) AS s(symbol, display_name, market_kind, base, quote, tick, prec, cat)
LEFT JOIN public.symbol_categories c ON c.code = s.cat
ON CONFLICT (symbol) DO NOTHING;

INSERT INTO public.market_sessions (code, name, market_kind, open_utc_minute, close_utc_minute, weekdays, color, sort_order) VALUES
  ('sydney',  'Sydney',   'forex', 22*60,  7*60, ARRAY[0,1,2,3,4], '#22c55e', 10),
  ('tokyo',   'Tokyo',    'forex',  0*60,  9*60, ARRAY[1,2,3,4,5], '#3b82f6', 20),
  ('london',  'London',   'forex',  7*60, 16*60, ARRAY[1,2,3,4,5], '#a855f7', 30),
  ('newyork', 'New York', 'forex', 12*60, 21*60, ARRAY[1,2,3,4,5], '#ef4444', 40)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.provider_symbols (provider_id, symbol_id, native_symbol)
SELECT p.id, s.id,
  CASE
    WHEN p.code = 'binance' AND s.market_kind = 'crypto' THEN replace(s.symbol,'/','')
    WHEN p.code = 'oanda' AND s.market_kind IN ('forex','metals') THEN substring(s.symbol,1,3) || '_' || substring(s.symbol,4,3)
    ELSE s.symbol
  END
FROM public.market_providers p
CROSS JOIN public.symbols s
WHERE (p.code = 'binance' AND s.market_kind = 'crypto')
   OR (p.code = 'oanda' AND s.market_kind IN ('forex','metals'))
   OR (p.code = 'mock')
ON CONFLICT (provider_id, symbol_id) DO NOTHING;

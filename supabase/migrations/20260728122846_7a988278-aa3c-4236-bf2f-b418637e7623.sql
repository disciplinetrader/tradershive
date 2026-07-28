
-- Recreate timeframe_kind without '30s'
DROP VIEW IF EXISTS public.historical_coverage;

ALTER TYPE public.timeframe_kind RENAME TO timeframe_kind_old;

CREATE TYPE public.timeframe_kind AS ENUM (
  'tick','1m','3m','5m','15m','30m','1H','2H','4H','1D','1W','1M'
);

ALTER TABLE public.historical_candles
  ALTER COLUMN timeframe TYPE public.timeframe_kind
  USING timeframe::text::public.timeframe_kind;

ALTER TABLE public.historical_cache
  ALTER COLUMN timeframe TYPE public.timeframe_kind
  USING timeframe::text::public.timeframe_kind;

ALTER TABLE public.market_subscriptions
  ALTER COLUMN timeframe TYPE public.timeframe_kind
  USING timeframe::text::public.timeframe_kind;

ALTER TABLE public.user_market_settings
  ALTER COLUMN default_timeframe DROP DEFAULT;

ALTER TABLE public.user_market_settings
  ALTER COLUMN default_timeframe TYPE public.timeframe_kind
  USING default_timeframe::text::public.timeframe_kind;

ALTER TABLE public.user_market_settings
  ALTER COLUMN default_timeframe SET DEFAULT '1H'::public.timeframe_kind;

DROP TYPE public.timeframe_kind_old;

CREATE OR REPLACE VIEW public.historical_coverage AS
 SELECT s.id AS symbol_id,
    s.symbol,
    s.market,
    s.source_code,
    s.is_enabled,
    s.earliest_available,
    s.latest_imported,
    c.timeframe,
    count(c.ts) AS candles,
    min(c.ts) AS first_ts,
    max(c.ts) AS last_ts
   FROM public.historical_symbols s
     LEFT JOIN public.historical_candles c
       ON c.symbol = s.symbol AND c.provider_code = s.source_code
  GROUP BY s.id, s.symbol, s.market, s.source_code, s.is_enabled,
           s.earliest_available, s.latest_imported, c.timeframe;

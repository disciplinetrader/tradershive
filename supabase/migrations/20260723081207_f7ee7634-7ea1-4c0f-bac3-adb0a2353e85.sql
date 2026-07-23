-- Register Yahoo provider if missing
INSERT INTO public.market_providers (code, name, description, supports_rest, supports_ws, supports_historical, supports_streaming, markets, priority, is_enabled, is_default)
VALUES (
  'yahoo',
  'Yahoo Finance',
  'Key-less quotes and OHLC for forex, stocks, indices, futures, metals, commodities.',
  true, false, true, false,
  ARRAY['forex','stocks','indices','futures','metals','commodities']::market_kind[],
  50, true, true
)
ON CONFLICT (code) DO UPDATE
  SET markets = EXCLUDED.markets,
      is_enabled = true,
      description = EXCLUDED.description;

-- Default assignments (only insert where missing — never overwrite an admin choice)
INSERT INTO public.provider_market_assignments (market_kind, primary_code, fallback_code)
VALUES
  ('crypto',      'binance', NULL),
  ('forex',       'yahoo',   'twelvedata'),
  ('stocks',      'yahoo',   'twelvedata'),
  ('indices',     'yahoo',   'twelvedata'),
  ('futures',     'yahoo',   'twelvedata'),
  ('metals',      'yahoo',   'twelvedata'),
  ('commodities', 'yahoo',   'twelvedata')
ON CONFLICT (market_kind) DO NOTHING;
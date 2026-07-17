INSERT INTO public.market_providers
  (code, name, description, supports_rest, supports_ws, supports_historical, supports_streaming, markets, priority, is_default, config)
VALUES
  ('twelvedata', 'Twelve Data', 'Forex, Metals, Indices & Stocks', true, false, true, true,
   ARRAY['forex','metals','indices','commodities','stocks']::public.market_kind[],
   20, false, '{"rest_base":"https://api.twelvedata.com"}'::jsonb)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      supports_rest = EXCLUDED.supports_rest,
      supports_ws = EXCLUDED.supports_ws,
      supports_historical = EXCLUDED.supports_historical,
      supports_streaming = EXCLUDED.supports_streaming,
      markets = EXCLUDED.markets,
      priority = EXCLUDED.priority,
      config = EXCLUDED.config,
      is_enabled = true;

INSERT INTO public.provider_symbols (provider_id, symbol_id, native_symbol)
SELECT p.id, s.id,
  CASE s.symbol
    WHEN 'US30'   THEN 'DJI'
    WHEN 'NAS100' THEN 'NDX'
    WHEN 'SPX500' THEN 'SPX'
    ELSE substring(s.symbol,1,3) || '/' || substring(s.symbol,4,3)
  END
FROM public.market_providers p
CROSS JOIN public.symbols s
WHERE p.code = 'twelvedata'
  AND s.market_kind IN ('forex','metals','indices')
ON CONFLICT (provider_id, symbol_id) DO NOTHING;

DELETE FROM public.provider_symbols
  WHERE provider_id IN (SELECT id FROM public.market_providers WHERE code = 'oanda');
DELETE FROM public.market_providers WHERE code = 'oanda';
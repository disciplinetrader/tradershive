-- Route every non-crypto market to Twelve Data and fix native tickers.
UPDATE public.historical_symbols
SET source_code = 'twelvedata',
    native_symbol = upper(symbol),
    updated_at = now()
WHERE market IN ('forex','metals')
  AND source_code IN ('stooq','dukascopy');

UPDATE public.historical_symbols SET source_code='twelvedata', native_symbol='SPX',  updated_at=now() WHERE symbol='SPX500';
UPDATE public.historical_symbols SET source_code='twelvedata', native_symbol='IXIC', updated_at=now() WHERE symbol='NAS100';
UPDATE public.historical_symbols SET source_code='twelvedata', native_symbol='DJI',  updated_at=now() WHERE symbol='US30';
UPDATE public.historical_symbols SET source_code='twelvedata', native_symbol='DAX',  updated_at=now() WHERE symbol='GER40';

UPDATE public.historical_symbols
SET source_code='twelvedata', native_symbol=upper(symbol), updated_at=now()
WHERE market = 'commodities' AND source_code IN ('stooq','dukascopy');

-- Stock coverage for validation / replay.
INSERT INTO public.historical_symbols (source_code, market, symbol, native_symbol, display_name, is_enabled, priority, base_timeframe, timeframes)
VALUES
  ('twelvedata','stocks','AAPL','AAPL','Apple Inc.',true,50,'1m', ARRAY['1m','5m','15m','30m','1H','4H','1D','1W','1M']),
  ('twelvedata','stocks','MSFT','MSFT','Microsoft Corp.',true,50,'1m', ARRAY['1m','5m','15m','30m','1H','4H','1D','1W','1M']),
  ('twelvedata','stocks','TSLA','TSLA','Tesla Inc.',true,50,'1m', ARRAY['1m','5m','15m','30m','1H','4H','1D','1W','1M']),
  ('twelvedata','stocks','NVDA','NVDA','NVIDIA Corp.',true,50,'1m', ARRAY['1m','5m','15m','30m','1H','4H','1D','1W','1M']),
  ('twelvedata','stocks','AMZN','AMZN','Amazon.com Inc.',true,50,'1m', ARRAY['1m','5m','15m','30m','1H','4H','1D','1W','1M'])
ON CONFLICT DO NOTHING;
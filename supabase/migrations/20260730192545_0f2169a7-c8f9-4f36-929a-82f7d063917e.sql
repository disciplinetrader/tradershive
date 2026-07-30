-- Correct the historical data-source naming: the "dukascopy" provider was
-- always a Stooq (daily CSV) integration. No Dukascopy code has ever run.

UPDATE public.historical_data_sources
   SET code = 'stooq',
       name = 'Stooq (daily)'
 WHERE code = 'dukascopy';

UPDATE public.historical_symbols
   SET source_code = 'stooq'
 WHERE source_code = 'dukascopy';

UPDATE public.historical_candles
   SET provider_code = 'stooq'
 WHERE provider_code = 'dukascopy';

UPDATE public.historical_import_jobs
   SET source_code = 'stooq'
 WHERE source_code = 'dukascopy';

UPDATE public.historical_sync_logs
   SET source_code = 'stooq'
 WHERE source_code = 'dukascopy';

UPDATE public.provider_market_assignments
   SET primary_code = 'stooq'
 WHERE primary_code = 'dukascopy';

UPDATE public.provider_market_assignments
   SET fallback_code = 'stooq'
 WHERE fallback_code = 'dukascopy';

UPDATE public.market_providers
   SET code = 'stooq',
       name = 'Stooq (daily)'
 WHERE code = 'dukascopy';
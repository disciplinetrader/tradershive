select id, symbol, timeframe, status, phase, triggered_by,
       range_from, range_to, candles_inserted, error_message, created_at
  from public.historical_import_jobs
 where symbol = 'GBP/USD'
 order by created_at desc
 limit 20;

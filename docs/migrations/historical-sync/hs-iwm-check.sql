select (select count(*) from public.historical_symbols   where symbol = 'IWM') as iwm_catalog_rows,
       (select count(*) from public.historical_import_jobs where symbol = 'IWM') as iwm_job_rows,
       (select count(*) from public.historical_candles     where symbol = 'IWM') as iwm_candle_rows,
       (select count(*) from public.historical_symbols)                          as catalog_rows_total;

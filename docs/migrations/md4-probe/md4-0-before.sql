select count(*) as gbp_15m_rows_in_window,
       min(ts) as earliest,
       max(ts) as latest,
       min(created_at) as first_written
  from public.historical_candles
 where symbol = 'GBP/USD'
   and timeframe = '15m'
   and ts >= timestamptz '2026-08-14 00:00:00+00'
   and ts <  timestamptz '2026-08-17 00:00:00+00';

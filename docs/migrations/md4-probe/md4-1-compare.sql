select ts, open, high, low, close, provider_code, created_at
  from public.historical_candles
 where symbol = 'GBP/USD' and timeframe = '15m'
   and ts in (timestamptz '2026-08-14 14:30:00+00',
              timestamptz '2026-08-15 00:00:00+00',
              timestamptz '2026-08-15 00:30:00+00')
 order by ts;

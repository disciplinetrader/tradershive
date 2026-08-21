select symbol,
       count(*) as rows_15m,
       min(ts) as first_bar,
       max(ts) as last_bar,
       min(created_at) as first_written
  from public.historical_candles
 where timeframe = '15m'
 group by symbol
 order by rows_15m asc;

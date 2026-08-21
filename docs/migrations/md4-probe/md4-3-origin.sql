select timeframe,
       count(*) as rows,
       min(ts) as first_bar,
       max(ts) as last_bar,
       min(created_at) as first_written,
       max(created_at) as last_written,
       count(distinct date_trunc('minute', created_at)) as write_batches
  from public.historical_candles
 where symbol = 'GBP/USD'
 group by timeframe
 order by rows desc;

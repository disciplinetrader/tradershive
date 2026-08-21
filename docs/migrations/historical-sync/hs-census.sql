select timeframe,
       count(*) as rows,
       min(ts)::date as earliest,
       max(ts)::date as latest
  from public.historical_candles
 group by timeframe
 order by rows desc;

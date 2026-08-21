select symbol,
       min(ts)::date as earliest,
       max(ts)::date as latest,
       (max(ts)::date - min(ts)::date) as days_deep,
       count(*) as bars
  from public.historical_candles
 where timeframe = '1m'
 group by symbol
 order by days_deep asc;

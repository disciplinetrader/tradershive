select s.symbol,
       s.market,
       s.metadata->>'backfill_empty_streak'   as empty_streak,
       s.metadata->>'backfill_attempted_from' as attempted_from,
       s.metadata->>'backfill_exhausted_at'   as exhausted_at,
       c.earliest_1m,
       c.bars_1m
  from public.historical_symbols s
  left join (select symbol, min(ts) as earliest_1m, count(*) as bars_1m
               from public.historical_candles
              where timeframe = '1m'
              group by symbol) c on c.symbol = s.symbol
 where s.is_enabled
 order by (s.metadata ? 'backfill_exhausted_at') desc, s.market, s.symbol;

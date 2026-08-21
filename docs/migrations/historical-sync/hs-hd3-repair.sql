update public.historical_symbols s
   set latest_imported = c.max_1m_ts, updated_at = now()
  from (select symbol, max(ts) as max_1m_ts
          from public.historical_candles
         where timeframe = '1m'
         group by symbol) c
 where c.symbol = s.symbol
   and (s.latest_imported is null or s.latest_imported < c.max_1m_ts)
returning s.symbol, s.latest_imported;

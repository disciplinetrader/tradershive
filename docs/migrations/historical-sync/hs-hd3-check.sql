select s.symbol,
       s.latest_imported,
       c.max_1m_ts,
       (c.max_1m_ts > s.latest_imported) as front_edge_stale
  from public.historical_symbols s
  join (select symbol, max(ts) as max_1m_ts
          from public.historical_candles
         where timeframe = '1m'
         group by symbol) c on c.symbol = s.symbol
 where s.is_enabled
 order by front_edge_stale desc nulls last, s.latest_imported asc;

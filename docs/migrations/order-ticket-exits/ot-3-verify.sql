select indexname from pg_indexes
 where schemaname = 'public' and tablename = 'paper_trade_exits'
   and indexname = 'paper_trade_exits_trade_idx';

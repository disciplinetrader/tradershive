select policyname, cmd from pg_policies
 where schemaname = 'public' and tablename = 'paper_trade_exits';

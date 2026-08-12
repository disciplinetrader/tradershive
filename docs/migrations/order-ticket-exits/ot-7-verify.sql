select conname, pg_get_constraintdef(oid) as definition
  from pg_constraint
 where conrelid = 'public.paper_trade_exits'::regclass
   and conname = 'paper_trade_exits_idx_max';

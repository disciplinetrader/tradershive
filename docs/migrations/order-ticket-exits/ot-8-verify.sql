select p.proname, pg_get_function_result(p.oid) as returns
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname = 'paper_trade_exits_check_allocation';

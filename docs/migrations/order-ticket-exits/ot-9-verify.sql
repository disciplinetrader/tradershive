select tgname, pg_get_triggerdef(oid) as definition
  from pg_trigger
 where tgrelid = 'public.paper_trade_exits'::regclass
   and tgname = 'paper_trade_exits_allocation'
   and not tgisinternal;

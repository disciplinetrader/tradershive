select conname as name, 'constraint' as kind, pg_get_constraintdef(oid) as definition
  from pg_constraint
 where conrelid = 'public.historical_candles'::regclass
union all
select indexname, 'index', indexdef
  from pg_indexes
 where schemaname = 'public' and tablename = 'historical_candles'
 order by kind, name;

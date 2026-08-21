select source_code,
       count(*) filter (where is_enabled) as enabled,
       count(*) as total
  from public.historical_symbols
 group by source_code
 order by source_code;

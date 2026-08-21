update public.historical_symbols
   set is_enabled = false, updated_at = now()
 where symbol in ('WTI/USD','BRENT/USD','XAG/USD','SPX500','NAS100','US30','GER40')
returning symbol, market, native_symbol, is_enabled;

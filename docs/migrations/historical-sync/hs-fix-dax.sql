update public.historical_symbols
   set native_symbol = 'GER40', updated_at = now()
 where symbol = 'GER40' and native_symbol = 'DAX'
returning symbol, native_symbol, is_enabled;

insert into public.historical_symbols
  (source_code, market, symbol, native_symbol, display_name, base_timeframe, is_enabled, priority)
values
  ('twelvedata','indices','SPY','SPY','S&P 500 ETF',      '1m', true, 210),
  ('twelvedata','indices','QQQ','QQQ','Nasdaq 100 ETF',   '1m', true, 220),
  ('twelvedata','indices','DIA','DIA','Dow 30 ETF',       '1m', true, 230),
  ('twelvedata','indices','IWM','IWM','Russell 2000 ETF', '1m', true, 240)
on conflict (source_code, symbol) do nothing
returning symbol, market, native_symbol, base_timeframe, is_enabled, priority;

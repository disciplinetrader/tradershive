insert into public.replay_sessions (
  user_id, title, mode, market, symbol, timeframe, provider,
  range_start, range_end, cursor_ts, last_opened_at
)
select
  user_id,
  'BTC/USDT 5m — seeded against stored candles',
  mode,
  'crypto',
  'BTC/USDT',
  '5m',
  provider,
  '2026-07-05T00:00:00Z',
  '2026-07-08T00:00:00Z',
  '2026-07-05T00:00:00Z',
  now()
from public.replay_sessions
where id = '5327127e-dac0-443c-b696-d99190188d8e'
returning id, user_id, symbol, timeframe, range_start, range_end;

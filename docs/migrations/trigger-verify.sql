select
  e.created_at,
  e.symbol,
  e.opened_at,
  e.session::text as written,
  public.detect_session(e.opened_at) as expected,
  e.session_auto_detected,
  e.observation_cursor is not null as has_cursor,
  e.trade_id is not null as from_trade
from public.journal_entries e
where e.deleted_at is null
order by e.created_at desc
limit 5;

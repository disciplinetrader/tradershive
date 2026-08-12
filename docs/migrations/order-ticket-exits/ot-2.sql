create unique index if not exists paper_trade_exits_slot_uidx
  on public.paper_trade_exits (trade_id, kind, idx);

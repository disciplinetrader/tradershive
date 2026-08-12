do $$ begin
  alter table public.paper_trade_exits
    add constraint paper_trade_exits_idx_max check (idx >= 1 and idx <= 5);
exception when duplicate_object then null;
end $$;

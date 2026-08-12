do $$ begin
  create trigger paper_trade_exits_allocation
    before insert or update of percent, kind, status
    on public.paper_trade_exits
    for each row execute function public.paper_trade_exits_check_allocation();
exception when duplicate_object then null;
end $$;

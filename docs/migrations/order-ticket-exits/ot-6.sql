do $$ begin
  create policy "own trade exits" on public.paper_trade_exits for all
    using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;

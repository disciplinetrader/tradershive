create or replace function public.paper_trade_exits_check_allocation()
returns trigger language plpgsql set search_path = public as $$
declare allocated numeric;
begin
  select coalesce(sum(percent), 0) into allocated
    from public.paper_trade_exits
   where trade_id = new.trade_id
     and kind = new.kind
     and status <> 'cancelled'
     and id <> new.id;
  if allocated + new.percent > 100.0001 then
    raise exception
      'exit allocation for trade % kind % would total %, which is over 100',
      new.trade_id, new.kind, round(allocated + new.percent, 2);
  end if;
  return new;
end $$;

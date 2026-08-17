alter table public.journal_entries
  add column if not exists source text not null default 'manual';

alter table public.journal_entries
  drop constraint if exists journal_entries_source_check;

alter table public.journal_entries
  add constraint journal_entries_source_check
  check (source in ('trade', 'manual', 'import', 'replay'));

update public.journal_entries
set source = 'trade'
where trade_id is not null
  and source <> 'trade';

create or replace function public.create_journal_draft_from_trade()
returns trigger language plpgsql security definer set search_path = public as $$
declare sec integer; new_entry uuid; sess text;
begin
  if new.status <> 'closed' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'closed' then return new; end if;
  if exists (select 1 from public.journal_entries where trade_id = new.id) then return new; end if;
  sec := null;
  if new.opened_at is not null and new.closed_at is not null then
    sec := greatest(0, extract(epoch from (new.closed_at - new.opened_at))::integer);
  end if;
  sess := public.detect_session(new.opened_at);
  insert into public.journal_entries (
    user_id, trade_id, account_id, market, symbol, direction,
    entry_price, exit_price, stop_loss, take_profit, lot_size,
    rr, pnl, commission, swap, opened_at, closed_at, duration_seconds,
    observation_cursor, session, session_auto_detected, source, status
  ) values (
    new.user_id, new.id, new.account_id, new.market, new.symbol, new.direction,
    new.entry_price, new.exit_price, new.stop_loss, new.take_profit, new.lot_size,
    coalesce(new.rr_realized, new.rr_planned), new.pnl,
    coalesce(new.commission, 0), coalesce(new.swap, 0),
    new.opened_at, new.closed_at, sec,
    new.observation_cursor,
    nullif(sess, 'off_hours')::public.journal_session, true, 'trade', 'draft'
  ) returning id into new_entry;

  if new.tag_ids is not null and array_length(new.tag_ids, 1) > 0 then
    insert into public.journal_entry_tags (entry_id, tag_id, user_id)
    select new_entry, t.id, new.user_id
      from public.journal_tags t
     where t.id = any(new.tag_ids) and t.user_id = new.user_id
    on conflict do nothing;
  end if;
  return new;
end $$;

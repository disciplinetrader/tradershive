-- ===========================================================================
-- JOURNAL REPLAY DEEP-LINK — journal_entries.observation_cursor
--
-- Paste ONE statement at a time. Run each VERIFY separately from the statement
-- it checks. Lovable's SQL editor truncates long pastes mid-statement and still
-- reports success — see docs/known-issues.md.
--
-- J-3 REPLACES create_journal_draft_from_trade(). It is a single statement and
-- cannot be split, so it is the one paste to be careful with. It INCLUDES the
-- tag_ids drain added by tag-consolidation chunk 10 — pasting a truncated
-- version would silently drop open-time tagging. Check the VERIFY.
-- ===========================================================================


-- --- J-1 statement ---------------------------------------------------------
alter table public.journal_entries
  add column if not exists observation_cursor integer;

-- --- J-1 verify (expect 1 row -> observation_cursor | integer) -------------
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'journal_entries'
   and column_name = 'observation_cursor';


-- --- J-2 statement ---------------------------------------------------------
-- Backfill entries created before the column existed. Only battle- and
-- replay-originated trades carry a cursor; live paper trades have none and
-- correctly stay null, falling back to timestamp reconstruction.
update public.journal_entries e
   set observation_cursor = t.observation_cursor
  from public.paper_trades t
 where t.id = e.trade_id
   and e.observation_cursor is null
   and t.observation_cursor is not null;

-- --- J-2 verify (expect linked = with_cursor for battle/replay trades) -----
select count(*)                                          as journal_entries,
       count(*) filter (where e.trade_id is not null)     as linked,
       count(*) filter (where e.observation_cursor is not null) as with_cursor
  from public.journal_entries e;


-- --- J-3 statement (single statement — do not split, do not truncate) ------
create or replace function public.create_journal_draft_from_trade()
returns trigger language plpgsql security definer set search_path = public as $$
declare sec integer; new_entry uuid;
begin
  if new.status <> 'closed' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'closed' then return new; end if;
  if exists (select 1 from public.journal_entries where trade_id = new.id) then return new; end if;
  sec := null;
  if new.opened_at is not null and new.closed_at is not null then
    sec := greatest(0, extract(epoch from (new.closed_at - new.opened_at))::integer);
  end if;
  insert into public.journal_entries (
    user_id, trade_id, account_id, market, symbol, direction,
    entry_price, exit_price, stop_loss, take_profit, lot_size,
    rr, pnl, commission, swap, opened_at, closed_at, duration_seconds,
    observation_cursor, status
  ) values (
    new.user_id, new.id, new.account_id, new.market, new.symbol, new.direction,
    new.entry_price, new.exit_price, new.stop_loss, new.take_profit, new.lot_size,
    coalesce(new.rr_realized, new.rr_planned), new.pnl,
    coalesce(new.commission, 0), coalesce(new.swap, 0),
    new.opened_at, new.closed_at, sec,
    new.observation_cursor, 'draft'
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

-- --- J-3 verify (expect BOTH true — proves nothing was truncated) ----------
-- carries_cursor  : the new column is written
-- drains_tag_ids  : chunk 10's tag drain survived the replace
select prosrc like '%observation_cursor%'   as carries_cursor,
       prosrc like '%journal_entry_tags%'   as drains_tag_ids
  from pg_proc
 where proname = 'create_journal_draft_from_trade';


-- --- J-4 verify (expect 2 rows — triggers still attached) ------------------
select tgname from pg_trigger where tgname like 'trg_paper_trades_auto_journal%';

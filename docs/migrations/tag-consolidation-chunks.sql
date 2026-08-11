-- ===========================================================================
-- TAG CONSOLIDATION — 12 chunks. Paste ONE chunk at a time.
-- Each chunk ends with a VERIFY query that returns a row you can eyeball.
-- If a VERIFY does not return what it says, STOP — do not run the next chunk.
-- Chunks are individually re-runnable: re-applying one is a no-op.
--
-- !! LOVABLE SQL EDITOR TRUNCATES LONG PASTES !!
-- Observed 2026-08-11: it silently drops characters mid-statement on a long
-- paste — `table_nam`, `group b`, `tgname lurnal%` — and then reports success.
-- A statement can therefore appear to apply while having been mangled.
-- MITIGATION: paste each statement on its own, and run each VERIFY separately
-- from the statement it checks. Do not trust "query succeeded" on a long paste.
-- This very likely explains earlier migrations that reported success without
-- fully applying.
--
-- ORDER: 1 -> 1B -> 2 -> 3 ... 12.  CHUNK 1B IS NOT OPTIONAL AND MUST RUN
-- BEFORE CHUNK 6 — see the note there.
-- ===========================================================================


-- === CHUNK 1 / 12 — journal_tags gains kind + value =========================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'journal_tag_kind') then
    create type journal_tag_kind as enum ('setup', 'mistake', 'emotion', 'custom');
  end if;
end $$;

alter table public.journal_tags
  add column if not exists kind  journal_tag_kind not null default 'custom',
  add column if not exists value text;

update public.journal_tags
   set value = regexp_replace(lower(btrim(name)), '[^a-z0-9]+', '_', 'g')
 where value is null;

alter table public.journal_tags alter column value set not null;

create unique index if not exists journal_tags_user_kind_value_key
  on public.journal_tags (user_id, kind, value);

-- VERIFY: expect 2 rows -> kind, value
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'journal_tags'
   and column_name in ('kind', 'value')
 order by column_name;


-- === CHUNK 1B / 12 — drop the pre-consolidation UNIQUE (user_id, name) ======
-- Superseded by (user_id, kind, value). It must go, not merely be ignored:
-- ON CONFLICT with an explicit target does not suppress violations of OTHER
-- unique constraints, so this one would abort chunks 6 and 11 the moment two
-- kinds share a label -- "Revenge" as both an emotion and a mistake, which is
-- precisely what `kind` exists to allow. Nothing targets it in code any more.
do $$
declare c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace ns on ns.oid = rel.relnamespace
     where ns.nspname = 'public'
       and rel.relname = 'journal_tags'
       and con.contype = 'u'
       and (
         select array_agg(att.attname order by att.attname)
           from unnest(con.conkey) k
           join pg_attribute att on att.attrelid = rel.oid and att.attnum = k
       ) = array['name','user_id']
  loop
    execute format('alter table public.journal_tags drop constraint %I', c.conname);
  end loop;
end $$;

-- VERIFY: expect 3 rows ->
--   journal_tags_pkey, journal_tags_user_kind_idx, journal_tags_user_kind_value_key
-- Query pg_indexes, NOT pg_constraint: chunk 1 creates the new uniqueness with
-- CREATE UNIQUE INDEX, which has no pg_constraint row. An earlier version of
-- this VERIFY looked in pg_constraint and so could never have seen it.
select indexname from pg_indexes
 where schemaname = 'public' and tablename = 'journal_tags'
 order by indexname;


-- === CHUNK 2 / 12 — paper_trades gains the tag staging buffer ==============
-- Tags are chosen at trade OPEN; journal_entry_tags needs an entry_id that
-- only exists at CLOSE. This column is the buffer chunk 9's trigger drains.
alter table public.paper_trades
  add column if not exists tag_ids uuid[] not null default '{}';

-- VERIFY: expect 1 row -> tag_ids | ARRAY
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'paper_trades'
   and column_name = 'tag_ids';


-- === CHUNK 3 / 12 — seed the setup vocabulary ==============================
insert into public.journal_tags (user_id, kind, value, name, color)
select p.id, 'setup'::journal_tag_kind, v.value, v.label, '#3b82f6'
from public.profiles p
cross join (values
  ('breakout','Breakout'), ('pullback','Pullback'),
  ('liquidity_sweep','Liquidity Sweep'), ('smc','SMC'), ('ict','ICT'),
  ('vwap','VWAP'), ('ema','EMA'), ('trend','Trend'), ('range','Range'),
  ('scalp','Scalp'), ('swing','Swing'), ('reversal','Reversal'),
  ('momentum','Momentum')
) as v(value, label)
on conflict (user_id, kind, value) do nothing;

-- VERIFY: expect setup_tags = 13 * (number of profiles)
select count(*) as setup_tags,
       (select count(*) from public.profiles) as profiles
  from public.journal_tags where kind = 'setup';


-- === CHUNK 4 / 12 — seed emotions + mistakes ===============================
insert into public.journal_tags (user_id, kind, value, name, color)
select p.id, v.kind::journal_tag_kind, v.value, v.label, v.color
from public.profiles p
cross join (values
  ('emotion','calm','Calm','#06b6d4'),
  ('emotion','disciplined','Disciplined','#3b82f6'),
  ('emotion','fear','Fear','#ef4444'),
  ('emotion','fomo','FOMO','#f59e0b'),
  ('emotion','revenge','Revenge','#dc2626'),
  ('mistake','entered_early','Entered Early','#f97316'),
  ('mistake','entered_late','Entered Late','#f97316'),
  ('mistake','no_stop_loss','No Stop Loss','#f97316'),
  ('mistake','moved_stop_loss','Moved Stop Loss','#f97316'),
  ('mistake','over_leveraged','Over Leveraged','#f97316'),
  ('mistake','overtrading','Overtrading','#f97316'),
  ('mistake','revenge_trade','Revenge Trade','#f97316'),
  ('mistake','ignored_plan','Ignored Plan','#f97316'),
  ('mistake','poor_risk_mgmt','Poor Risk Management','#f97316'),
  ('mistake','missed_confirmation','Missed Confirmation','#f97316')
) as v(kind, value, label, color)
on conflict (user_id, kind, value) do nothing;

-- VERIFY: expect 5 emotions and 10 mistakes per profile
select kind, count(*) from public.journal_tags
 where kind in ('emotion','mistake') group by kind order by kind;


-- === CHUNK 5 / 12 — fold journal_taxonomy into journal_tags ================
insert into public.journal_tags (user_id, kind, value, name, color)
select t.user_id, t.kind::text::journal_tag_kind, t.value, t.label,
       coalesce(t.color, '#3b82f6')
from public.journal_taxonomy t
on conflict (user_id, kind, value) do nothing;

-- VERIFY: expect migrated = source (0 = 0 today)
select (select count(*) from public.journal_taxonomy) as source,
       (select count(*) from public.journal_taxonomy t
         where exists (select 1 from public.journal_tags g
                        where g.user_id = t.user_id
                          and g.kind = t.kind::text::journal_tag_kind
                          and g.value = t.value)) as migrated;


-- === CHUNK 6 / 12 — fold trade_tags into journal_tags ======================
-- REQUIRES CHUNK 1B. While UNIQUE (user_id, name) still exists this insert
-- aborts the moment a trade tag shares a label with a seeded setup — which is
-- exactly what happened on 2026-08-11 with "Breakout"/"Pullback"/
-- "Liquidity Sweep".
--
-- A trade tag whose slug already exists under ANY kind is NOT re-created: a
-- trade tagged "Breakout" means the seeded *setup*, not a new custom tag.
-- Only genuinely unknown labels become custom. The old UNIQUE (user_id, name)
-- achieved this by accident, by erroring; this does it deliberately.
insert into public.journal_tags (user_id, kind, value, name, color)
select tt.user_id, 'custom'::journal_tag_kind,
       regexp_replace(lower(btrim(tt.name)), '[^a-z0-9]+', '_', 'g'),
       tt.name, tt.color
from public.trade_tags tt
where not exists (
  select 1 from public.journal_tags g
   where g.user_id = tt.user_id
     and g.value = regexp_replace(lower(btrim(tt.name)), '[^a-z0-9]+', '_', 'g')
)
on conflict (user_id, kind, value) do nothing;

-- VERIFY: every trade tag now resolves to exactly one journal tag, whether it
-- was adopted from an existing kind or created as custom. Expect unresolved = 0.
select count(*) filter (where g.id is null) as unresolved,
       count(*) filter (where g.kind <> 'custom') as adopted_existing,
       count(*) filter (where g.kind =  'custom') as created_custom
  from public.trade_tags tt
  left join public.journal_tags g
    on g.user_id = tt.user_id
   and g.value = regexp_replace(lower(btrim(tt.name)), '[^a-z0-9]+', '_', 'g');


-- === CHUNK 7 / 12 — fold trade_tag_relations into journal_entry_tags =======
-- Chunk 6 may have ADOPTED a trade tag into an existing kind rather than
-- creating it as custom, so match on value across kinds. `distinct on` keeps
-- one tag per (entry, trade tag) if a label exists under several kinds.
insert into public.journal_entry_tags (entry_id, tag_id, user_id)
select distinct on (je.id, tt.id) je.id, jt.id, r.user_id
from public.trade_tag_relations r
join public.trade_tags     tt on tt.id = r.tag_id
join public.journal_entries je on je.trade_id = r.trade_id and je.user_id = r.user_id
join public.journal_tags   jt on jt.user_id = r.user_id
   and jt.value = regexp_replace(lower(btrim(tt.name)), '[^a-z0-9]+', '_', 'g')
order by je.id, tt.id, (jt.kind = 'custom') desc, jt.created_at
on conflict do nothing;

-- VERIFY: orphans are relations whose trade has no journal entry. They are
-- NOT migrated. Expect source = 0, orphans = 0 today.
select (select count(*) from public.trade_tag_relations) as source,
       (select count(*) from public.trade_tag_relations r
         where not exists (select 1 from public.journal_entries je
                            where je.trade_id = r.trade_id
                              and je.user_id = r.user_id)) as orphans;


-- === CHUNK 8 / 12 — the array-projection function ==========================
-- emotions[] / mistakes[] / strategy_tags[] stop being writable state and
-- become projections of journal_entry_tags. 'custom' is deliberately not
-- projected: it is reachable only through the join, which is what keeps the
-- join authoritative rather than the arrays.
create or replace function public.journal_sync_tag_arrays_for(target uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.journal_entries e
     set emotions = coalesce((
           select array_agg(t.value order by t.value)
             from public.journal_entry_tags et
             join public.journal_tags t on t.id = et.tag_id
            where et.entry_id = target and t.kind = 'emotion'), '{}'),
         mistakes = coalesce((
           select array_agg(t.value order by t.value)
             from public.journal_entry_tags et
             join public.journal_tags t on t.id = et.tag_id
            where et.entry_id = target and t.kind = 'mistake'), '{}'),
         strategy_tags = coalesce((
           select array_agg(t.value order by t.value)
             from public.journal_entry_tags et
             join public.journal_tags t on t.id = et.tag_id
            where et.entry_id = target and t.kind = 'setup'), '{}')
   where e.id = target;
$$;

-- VERIFY: expect 1 row
select proname from pg_proc where proname = 'journal_sync_tag_arrays_for';


-- === CHUNK 9 / 12 — triggers that keep the arrays in step ==================
create or replace function public.journal_entry_tags_sync_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.journal_sync_tag_arrays_for(coalesce(new.entry_id, old.entry_id));
  return null;
end $$;

drop trigger if exists journal_entry_tags_sync on public.journal_entry_tags;
create trigger journal_entry_tags_sync
  after insert or update or delete on public.journal_entry_tags
  for each row execute function public.journal_entry_tags_sync_trg();

-- Renaming or re-kinding a tag must repaint every entry carrying it.
create or replace function public.journal_tags_rename_sync_trg()
returns trigger language plpgsql security definer set search_path = public as $$
declare e uuid;
begin
  if new.value is distinct from old.value or new.kind is distinct from old.kind then
    for e in select entry_id from public.journal_entry_tags where tag_id = new.id loop
      perform public.journal_sync_tag_arrays_for(e);
    end loop;
  end if;
  return null;
end $$;

drop trigger if exists journal_tags_rename_sync on public.journal_tags;
create trigger journal_tags_rename_sync
  after update on public.journal_tags
  for each row execute function public.journal_tags_rename_sync_trg();

-- VERIFY: expect 2 rows
select tgname from pg_trigger
 where tgname in ('journal_entry_tags_sync', 'journal_tags_rename_sync');


-- === CHUNK 10 / 12 — auto-journal trigger drains tag_ids ===================
-- Idempotent twice over: the existing trade_id guard returns before inserting
-- on a re-fire, and the tag insert is ON CONFLICT DO NOTHING. The join to
-- journal_tags means a tag deleted between open and close is silently skipped
-- rather than erroring, and enforces that the tag belongs to the same user.
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
    rr, pnl, commission, swap, opened_at, closed_at, duration_seconds, status
  ) values (
    new.user_id, new.id, new.account_id, new.market, new.symbol, new.direction,
    new.entry_price, new.exit_price, new.stop_loss, new.take_profit, new.lot_size,
    coalesce(new.rr_realized, new.rr_planned), new.pnl,
    coalesce(new.commission, 0), coalesce(new.swap, 0),
    new.opened_at, new.closed_at, sec, 'draft'
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

-- VERIFY: expect 2 rows (insert + update triggers still attached)
select tgname from pg_trigger where tgname like 'trg_paper_trades_auto_journal%';


-- === CHUNK 11 / 12 — adopt values already sitting in the arrays ============
insert into public.journal_tags (user_id, kind, value, name, color)
select distinct e.user_id, k.kind::journal_tag_kind, v.val,
       initcap(replace(v.val, '_', ' ')), '#3b82f6'
from public.journal_entries e
cross join lateral (values ('emotion', e.emotions), ('mistake', e.mistakes),
                           ('setup', e.strategy_tags)) as k(kind, arr)
cross join lateral unnest(k.arr) as v(val)
where v.val is not null and btrim(v.val) <> ''
on conflict (user_id, kind, value) do nothing;

insert into public.journal_entry_tags (entry_id, tag_id, user_id)
select distinct e.id, t.id, e.user_id
from public.journal_entries e
cross join lateral (values ('emotion', e.emotions), ('mistake', e.mistakes),
                           ('setup', e.strategy_tags)) as k(kind, arr)
cross join lateral unnest(k.arr) as v(val)
join public.journal_tags t on t.user_id = e.user_id
 and t.kind = k.kind::journal_tag_kind and t.value = v.val
on conflict do nothing;

-- VERIFY: every array value now has a join row. Expect unlinked = 0.
select count(*) as unlinked from public.journal_entries e
cross join lateral (values ('emotion', e.emotions), ('mistake', e.mistakes),
                           ('setup', e.strategy_tags)) as k(kind, arr)
cross join lateral unnest(k.arr) as v(val)
where not exists (
  select 1 from public.journal_entry_tags et
    join public.journal_tags t on t.id = et.tag_id
   where et.entry_id = e.id and t.value = v.val
     and t.kind = k.kind::journal_tag_kind);


-- === CHUNK 12 / 12 — indexes for tag-slice reads ===========================
create index if not exists journal_entry_tags_tag_idx   on public.journal_entry_tags (tag_id);
create index if not exists journal_entry_tags_entry_idx on public.journal_entry_tags (entry_id);
create index if not exists journal_tags_user_kind_idx   on public.journal_tags (user_id, kind);
create index if not exists journal_entries_emotions_gin on public.journal_entries using gin (emotions);
create index if not exists journal_entries_mistakes_gin on public.journal_entries using gin (mistakes);
create index if not exists journal_entries_setups_gin   on public.journal_entries using gin (strategy_tags);
create index if not exists paper_trades_tag_ids_gin     on public.paper_trades using gin (tag_ids);

-- VERIFY: expect 7 rows
select indexname from pg_indexes
 where schemaname = 'public'
   and indexname in ('journal_entry_tags_tag_idx','journal_entry_tags_entry_idx',
                     'journal_tags_user_kind_idx','journal_entries_emotions_gin',
                     'journal_entries_mistakes_gin','journal_entries_setups_gin',
                     'paper_trades_tag_ids_gin')
 order by indexname;


-- ===========================================================================
-- QUARANTINED — DO NOT RUN. Left commented deliberately.
-- The app no longer references these three tables, but carrying them costs
-- nothing and a reader we both missed would fail loudly against an empty
-- table rather than a missing one. Revisit in a month.
-- ===========================================================================
-- drop table if exists public.trade_tag_relations;
-- drop table if exists public.trade_tags;
-- drop table if exists public.journal_taxonomy;
-- drop type  if exists journal_taxonomy_kind;


-- ===========================================================================
-- APPLIED 2026-08-11 — project afhjjcivjkzcmdqzutfh
--   1  ok   kind + value on journal_tags
--   1B ok   UNIQUE (user_id, name) dropped  [run AFTER the fact; chunk 6 was
--           first applied with a hand-edited (user_id, name) conflict target]
--   2  ok   paper_trades.tag_ids
--   3  ok   689 setup tags (13 x 53 profiles)
--   4  ok   265 emotion, 530 mistake
--   5  ok   journal_taxonomy fold — 0 rows, no-op
--   6  ok   3 labels adopted from seeded setups, 1 ("holy67") created custom
--   7  ok   0 rows migrated — see KNOWN DATA LOSS below
--   8  ok   journal_sync_tag_arrays_for
--   9  ok   both array-sync triggers
--   10 ok   auto-journal trigger replaced, insert+update triggers attached
--   11 ok   0 rows — arrays were empty
--   12 ok   all 7 indexes
--
-- KNOWN DATA LOSS (accepted — test data)
-- All 4 trade_tag_relations rows were orphans: their trades had never closed,
-- so no journal_entries row existed to attach to and chunk 7 migrated nothing.
-- Those four tag assignments are gone. The trades still carry no tags, because
-- paper_trades.tag_ids defaults to '{}' and chunk 2 could not backfill it from
-- trade_tag_relations. If one of those trades ever closes, the auto-journal
-- trigger will create an entry with NO tags.
--
-- To recover them (NOT run — the affected rows are test data), tag_ids would
-- have to be backfilled BEFORE those trades close:
--   update public.paper_trades t
--      set tag_ids = sub.ids
--     from (select r.trade_id, array_agg(g.id) as ids
--             from public.trade_tag_relations r
--             join public.trade_tags tt on tt.id = r.tag_id
--             join public.journal_tags g on g.user_id = r.user_id
--              and g.value = regexp_replace(lower(btrim(tt.name)),'[^a-z0-9]+','_','g')
--            group by r.trade_id) sub
--    where t.id = sub.trade_id and t.status <> 'closed';
-- ===========================================================================

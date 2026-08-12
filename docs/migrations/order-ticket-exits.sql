-- Order ticket rebuild — multiple exit levels (OT-1 … OT-6)
--
-- DO NOT PASTE FROM THIS FILE. It is the annotated reference. The twelve bare
-- files in `order-ticket-exits/` are the ones to open, select-all and copy —
-- one statement each, no comments, no prose, same discipline as
-- `j3-statement.sql`, which chat mangled three times before it was isolated.
--
--   order-ticket-exits/ot-1.sql  →  ot-1-verify.sql
--   order-ticket-exits/ot-2.sql  →  ot-2-verify.sql
--   … through ot-6.
--
-- Run the statement alone, then its verify alone. A block success means
-- nothing (see README).
--
-- `paper_trades` is deliberately NOT altered. `stop_loss` / `take_profit` stay
-- exactly as they are and keep meaning "the primary level", which is what
-- `create_journal_draft_from_trade()` copies into `journal_entries` and what the
-- CSV importer and journal validation already read. This table is additive: a
-- trade with no ladder has no rows here and behaves precisely as it does today.
--
-- `percent` is a share of the ORIGINAL lot size, never of what remains, so
-- allocations stay stable as the position is scaled out. Same rule as
-- `src/lib/chart/orders/take-profit.ts`, which this mirrors on purpose.

---------------------------------------------------------------------------
-- OT-1  the table
---------------------------------------------------------------------------
create table if not exists public.paper_trade_exits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_id uuid not null references public.paper_trades(id) on delete cascade,
  kind text not null default 'take_profit' check (kind in ('take_profit','stop_loss')),
  idx integer not null check (idx >= 1),
  price numeric not null check (price > 0),
  percent numeric not null check (percent > 0 and percent <= 100),
  action text not null default 'none' check (action in ('none','break_even','trail')),
  status text not null default 'pending' check (status in ('pending','filled','cancelled')),
  filled_at timestamptz,
  filled_price numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- VERIFY OT-1 (run alone) — expect 13 rows
-- select column_name, data_type, is_nullable
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'paper_trade_exits'
--  order by ordinal_position;

---------------------------------------------------------------------------
-- OT-2  one leg per ladder slot
---------------------------------------------------------------------------
create unique index if not exists paper_trade_exits_slot_uidx
  on public.paper_trade_exits (trade_id, kind, idx);

-- VERIFY OT-2 (run alone) — expect 1 row
-- select indexname from pg_indexes
--  where schemaname = 'public' and tablename = 'paper_trade_exits'
--    and indexname = 'paper_trade_exits_slot_uidx';

---------------------------------------------------------------------------
-- OT-3  read path: every leg of a trade, in ladder order
---------------------------------------------------------------------------
create index if not exists paper_trade_exits_trade_idx
  on public.paper_trade_exits (trade_id, idx);

-- VERIFY OT-3 (run alone) — expect 1 row
-- select indexname from pg_indexes
--  where schemaname = 'public' and tablename = 'paper_trade_exits'
--    and indexname = 'paper_trade_exits_trade_idx';

---------------------------------------------------------------------------
-- OT-4  grants
---------------------------------------------------------------------------
grant select, insert, update, delete on public.paper_trade_exits to authenticated;

-- VERIFY OT-4 (run alone) — expect 4 rows
-- select privilege_type from information_schema.role_table_grants
--  where table_schema = 'public' and table_name = 'paper_trade_exits'
--    and grantee = 'authenticated';

---------------------------------------------------------------------------
-- OT-5  RLS — same shape as "own trades" on paper_trades
---------------------------------------------------------------------------
alter table public.paper_trade_exits enable row level security;

-- VERIFY OT-5 (run alone) — expect rowsecurity = true
-- select relrowsecurity as rowsecurity from pg_class
--  where oid = 'public.paper_trade_exits'::regclass;

---------------------------------------------------------------------------
-- OT-6  the policy
---------------------------------------------------------------------------
-- Wrapped so a re-run is a no-op: CREATE POLICY has no IF NOT EXISTS, and
-- partial re-application is the normal case when statements are hand-pasted.
do $$ begin
  create policy "own trade exits" on public.paper_trade_exits for all
    using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;

-- VERIFY OT-6 (run alone) — expect 1 row
-- select policyname, cmd from pg_policies
--  where schemaname = 'public' and tablename = 'paper_trade_exits';

-- ===========================================================================
-- JOURNAL BATCH — items 2 to 5.  APPLY IN THIS ORDER.
--
-- Paste ONE statement at a time; run each VERIFY separately from the statement
-- it checks. Lovable's SQL editor truncates long pastes mid-statement and still
-- reports success (docs/known-issues.md).
--
-- PREREQUISITE: J-1 .. J-4 (journal-observation-cursor.sql) must be applied
-- first — B-6 below depends on nothing from it, but the code that ships with
-- this batch assumes observation_cursor exists.
--
--   B-1  journal_days            daily journal page (item 2)
--   B-2  quick_notes extensions  notebook (item 3)
--   B-3  capture: rr_planned + rating                     (item 5.3, 5.6)
--   B-4  capture: MAE / MFE + running P&L path            (item 5.1, 5.2)
--   B-5  break-even band, per user                        (item 5.4)
--   B-6  commission / swap defaults, per account          (item 5.5)
-- ===========================================================================


-- --- B-1 statement — daily journal ----------------------------------------
create table if not exists public.journal_days (
  user_id     uuid not null references auth.users(id) on delete cascade,
  day         date not null,
  plan_text   text,
  recap_text  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, day)
);

-- --- B-1a statement — RLS --------------------------------------------------
alter table public.journal_days enable row level security;

-- --- B-1b statement — policy ----------------------------------------------
create policy "own journal days" on public.journal_days
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- --- B-1c statement — grants ----------------------------------------------
grant select, insert, update, delete on public.journal_days to authenticated;

-- --- B-1 verify (expect 1 row) --------------------------------------------
select tablename from pg_tables where schemaname='public' and tablename='journal_days';


-- --- B-2 statement — notebook, extending quick_notes ----------------------
-- Extended rather than replaced: `quick_notes` already backs the dashboard
-- widget. Every new column is nullable so that widget is untouched.
alter table public.quick_notes
  add column if not exists folder      text,
  add column if not exists template    text,
  add column if not exists entry_id    uuid references public.journal_entries(id) on delete set null,
  add column if not exists range_start date,
  add column if not exists range_end   date;

-- --- B-2a statement — search index ----------------------------------------
create index if not exists quick_notes_search_idx
  on public.quick_notes using gin (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(content,'')));

-- --- B-2b statement — folder listing index --------------------------------
create index if not exists quick_notes_user_folder_idx on public.quick_notes (user_id, folder);

-- --- B-2 verify (expect 5 rows) -------------------------------------------
select column_name from information_schema.columns
 where table_schema='public' and table_name='quick_notes'
   and column_name in ('folder','template','entry_id','range_start','range_end')
 order by column_name;


-- --- B-3 statement — planned RR + trade rating ----------------------------
-- `rr` already holds the ACTUAL R. `rr_planned` is the R the trade was taken
-- for, so "planned vs actual" is a subtraction rather than a reconstruction.
-- `rating` is the trader's own 1-5 score; it is NOT the AI `rating` column that
-- never existed (see docs/known-issues.md JR-1 history).
alter table public.journal_entries
  add column if not exists rr_planned numeric,
  add column if not exists rating     smallint;

-- --- B-3a statement — bound the rating ------------------------------------
alter table public.journal_entries
  add constraint journal_entries_rating_range check (rating is null or rating between 1 and 5);

-- --- B-3 verify (expect 2 rows) -------------------------------------------
select column_name, data_type from information_schema.columns
 where table_schema='public' and table_name='journal_entries'
   and column_name in ('rr_planned','rating') order by column_name;


-- --- B-4 statement — MAE / MFE + running P&L ------------------------------
-- Excursions are computed from STORED historical candles only. `excursion_source`
-- records which, and must never be 'synthetic': a fabricated candle would
-- produce an authoritative-looking MAE that never happened.
alter table public.journal_entries
  add column if not exists mae_price            numeric,
  add column if not exists mfe_price            numeric,
  add column if not exists mae_r                numeric,
  add column if not exists mfe_r                numeric,
  add column if not exists excursion_path       jsonb,
  add column if not exists excursion_timeframe  text,
  add column if not exists excursion_source     text,
  add column if not exists excursion_computed_at timestamptz;

-- --- B-4a statement — refuse synthetic excursions at the DB level ---------
alter table public.journal_entries
  add constraint journal_entries_excursion_source_real
  check (excursion_source is null or excursion_source in ('stored','backfilled'));

-- --- B-4 verify (expect 8 rows) -------------------------------------------
-- Columns listed explicitly rather than matched with LIKE: the earlier version
-- read `A and B and C or D or E`, which Postgres groups as
-- `(A and B and C) or D or E` — so it scanned every table and returned an
-- inflated count that looked like a pass.
select column_name from information_schema.columns
 where table_schema='public' and table_name='journal_entries'
   and column_name in ('mae_price','mfe_price','mae_r','mfe_r',
                       'excursion_path','excursion_timeframe',
                       'excursion_source','excursion_computed_at')
 order by column_name;


-- --- B-5 statement — break-even band, per user ----------------------------
-- A result inside +/- this band counts as break-even everywhere, not a 1-cent
-- "win". Stored per user because it is a judgement about noise, not a fact.
alter table public.user_settings
  add column if not exists breakeven_band numeric not null default 0;

-- --- B-5a statement — it cannot be negative -------------------------------
alter table public.user_settings
  add constraint user_settings_breakeven_band_nonneg check (breakeven_band >= 0);

-- --- B-5 verify (expect 1 row -> breakeven_band | numeric) ----------------
select column_name, data_type from information_schema.columns
 where table_schema='public' and table_name='user_settings' and column_name='breakeven_band';


-- --- B-6 statement — commission / swap defaults per account ---------------
alter table public.paper_accounts
  add column if not exists default_commission numeric not null default 0,
  add column if not exists default_swap       numeric not null default 0;

-- --- B-6 verify (expect 2 rows) -------------------------------------------
select column_name, data_type from information_schema.columns
 where table_schema='public' and table_name='paper_accounts'
   and column_name in ('default_commission','default_swap') order by column_name;

-- public.detect_session — the SQL half of the session rule.
--
-- Mirrors `src/lib/market-sessions/index.ts`. The two are asserted against the
-- SAME fixture (`src/lib/market-sessions/cases.ts`) by
-- `scripts/check-session-parity.ts`, which is the only reason having the rule
-- in two languages is acceptable. A rule changed here and not there — or the
-- reverse — fails that gate.
--
-- ── UPDATED 2026-08-20: weekday gating (MS-1 / MD-6) ──────────────────────
--
-- Previously this asked only "is the local clock inside the centre's hours",
-- with no notion of a trading week. It therefore returned `london` on a
-- Saturday, and `london_ny_overlap` on a Saturday afternoon — the highest
-- liquidity label of the week, on a day nothing trades. That value reaches
-- `journal_entries.session` through the draft trigger and then the
-- which-session-do-I-trade-best-in statistic.
--
-- The gate is each centre's LOCAL weekday, never UTC. Those differ for several
-- hours around every local midnight, and that gap is exactly where the FX
-- week's edges live: Sydney's local Monday morning IS Sunday evening in UTC,
-- so gating on UTC weekday would delete the week's real open.
--
-- `isodow` is 1=Monday .. 7=Sunday, so the trading week is `between 1 and 5`.
-- Expressed locally the week is simply Monday-to-Friday at every centre, and
-- the ragged UTC edges — open ~21:00Z Sunday, close ~21:00Z Friday — fall out
-- for free without a single hardcoded UTC hour.
--
-- Local hours, unchanged, matching SESSION_HOURS:
--   London   08:00-17:00  ->  480-1020
--   New York 08:00-17:00  ->  480-1020
--   Tokyo    09:00-18:00  ->  540-1080
--   Sydney   07:00-16:00  ->  420-960
--
-- APPLY BY HAND, per this project's convention, then run
-- `bun run check:sessions` — it compares this function against the TypeScript
-- rule over every fixture case, including the nine weekend cases added
-- 2026-08-20. That check FAILS until this file is applied.

create or replace function public.detect_session(at timestamptz)
returns text
language sql
stable
as $$
  select case
    when at is null                then 'off_hours'
    when lon_open and ny_open      then 'london_ny_overlap'
    when ny_open                   then 'new_york'
    when lon_open                  then 'london'
    when tok_open                  then 'tokyo'
    when syd_open                  then 'sydney'
    else 'off_hours'
  end
  from (
    select
      extract(isodow from lon_t) between 1 and 5
        and extract(epoch from lon_t::time) / 60 >= 480
        and extract(epoch from lon_t::time) / 60 <  1020 as lon_open,
      extract(isodow from ny_t) between 1 and 5
        and extract(epoch from ny_t::time) / 60 >= 480
        and extract(epoch from ny_t::time) / 60 <  1020 as ny_open,
      extract(isodow from tok_t) between 1 and 5
        and extract(epoch from tok_t::time) / 60 >= 540
        and extract(epoch from tok_t::time) / 60 <  1080 as tok_open,
      extract(isodow from syd_t) between 1 and 5
        and extract(epoch from syd_t::time) / 60 >= 420
        and extract(epoch from syd_t::time) / 60 <  960  as syd_open
    from (
      select
        at at time zone 'Europe/London'    as lon_t,
        at at time zone 'America/New_York' as ny_t,
        at at time zone 'Asia/Tokyo'       as tok_t,
        at at time zone 'Australia/Sydney' as syd_t
    ) t
  ) s;
$$;

grant execute on function public.detect_session(timestamptz) to authenticated, service_role;

create or replace function public.detect_session_batch(ats timestamptz[])
returns text[]
language sql
stable
as $$
  select array_agg(public.detect_session(t) order by ord)
  from unnest(ats) with ordinality as u(t, ord);
$$;

grant execute on function public.detect_session_batch(timestamptz[]) to authenticated, service_role;

-- ── Spot-check after applying, before trusting the parity gate ────────────
-- Expect, in order: off_hours, off_hours, off_hours, sydney, london.
-- The fourth is the week OPEN on a Sunday in UTC — if it returns off_hours,
-- the gate was written against UTC weekday instead of local.

select public.detect_session(timestamptz '2026-07-10T21:30:00Z') as fri_2130z_sydney_local_sat,
       public.detect_session(timestamptz '2026-07-11T10:00:00Z') as sat_1000z,
       public.detect_session(timestamptz '2026-07-11T14:00:00Z') as sat_1400z_was_overlap,
       public.detect_session(timestamptz '2026-07-12T21:30:00Z') as sun_2130z_week_opens,
       public.detect_session(timestamptz '2026-07-15T10:00:00Z') as wed_1000z_control;

-- ── Existing rows are NOT rewritten by this ───────────────────────────────
-- `journal_entries.session` rows written before this lands keep whatever the
-- old rule said. `docs/migrations/session-backfill.sql` is the separate,
-- deliberate step for that, and it should not be run without deciding whether
-- re-labelling a trader's history is wanted.

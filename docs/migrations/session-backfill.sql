with e as (
  select
    id,
    session::text as stored,
    extract(hour from opened_at at time zone 'UTC')::int as h
  from public.journal_entries
  where session is not null
    and opened_at is not null
    and deleted_at is null
),
j as (
  select
    id,
    stored,
    case
      when h >= 12 and h < 16 then 'london_ny_overlap'
      when h >= 16 and h < 21 then 'new_york'
      when h >= 7 and h < 12 then 'london'
      when h >= 0 and h < 7 then 'tokyo'
      when h >= 22 then 'sydney'
    end as legacy
  from e
)
update public.journal_entries t
set session_auto_detected = false
from j
where t.id = j.id
  and j.stored is distinct from j.legacy
  and t.session_auto_detected;

with e as (
  select
    id,
    extract(hour from opened_at at time zone 'Europe/London') as lon,
    extract(hour from opened_at at time zone 'America/New_York') as ny,
    extract(hour from opened_at at time zone 'Asia/Tokyo') as tok,
    extract(hour from opened_at at time zone 'Australia/Sydney') as syd
  from public.journal_entries
  where session is null
    and opened_at is not null
    and deleted_at is null
),
c as (
  select
    id,
    case
      when lon >= 8 and lon < 17 and ny >= 8 and ny < 17 then 'london_ny_overlap'
      when ny >= 8 and ny < 17 then 'new_york'
      when lon >= 8 and lon < 17 then 'london'
      when tok >= 9 and tok < 18 then 'tokyo'
      when syd >= 7 and syd < 16 then 'sydney'
    end as corrected
  from e
)
update public.journal_entries t
set session = c.corrected::public.journal_session,
    session_auto_detected = true
from c
where t.id = c.id
  and c.corrected is not null;

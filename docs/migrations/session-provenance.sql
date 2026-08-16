with e as (
  select
    session::text as stored,
    extract(hour from opened_at at time zone 'UTC')::int as h,
    extract(hour from opened_at at time zone 'Europe/London') as lon,
    extract(hour from opened_at at time zone 'America/New_York') as ny,
    extract(hour from opened_at at time zone 'Asia/Tokyo') as tok,
    extract(hour from opened_at at time zone 'Australia/Sydney') as syd
  from public.journal_entries
  where opened_at is not null
    and deleted_at is null
),
j as (
  select
    stored,
    case
      when h >= 12 and h < 16 then 'london_ny_overlap'
      when h >= 16 and h < 21 then 'new_york'
      when h >= 7 and h < 12 then 'london'
      when h >= 0 and h < 7 then 'tokyo'
      when h >= 22 then 'sydney'
    end as legacy,
    case
      when lon >= 8 and lon < 17 and ny >= 8 and ny < 17 then 'london_ny_overlap'
      when ny >= 8 and ny < 17 then 'new_york'
      when lon >= 8 and lon < 17 then 'london'
      when tok >= 9 and tok < 18 then 'tokyo'
      when syd >= 7 and syd < 16 then 'sydney'
    end as corrected
  from e
)
select
  stored,
  legacy,
  corrected,
  stored = legacy as machine_written,
  count(*) as n
from j
where corrected is distinct from stored
group by stored, legacy, corrected
order by n desc;

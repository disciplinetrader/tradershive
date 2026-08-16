with e as (
  select
    session::text as stored,
    extract(hour from opened_at at time zone 'Europe/London') as lon,
    extract(hour from opened_at at time zone 'America/New_York') as ny,
    extract(hour from opened_at at time zone 'Asia/Tokyo') as tok,
    extract(hour from opened_at at time zone 'Australia/Sydney') as syd
  from public.journal_entries
  where opened_at is not null
    and session_auto_detected
    and deleted_at is null
),
c as (
  select
    stored,
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
  corrected,
  count(*) as n
from c
where stored is distinct from corrected
group by stored, corrected
order by n desc;

create or replace function public.detect_session(at timestamptz)
returns text
language sql
stable
as $$
  select case
    when at is null then 'off_hours'
    when lon >= 480 and lon < 1020 and ny >= 480 and ny < 1020 then 'london_ny_overlap'
    when ny >= 480 and ny < 1020 then 'new_york'
    when lon >= 480 and lon < 1020 then 'london'
    when tok >= 540 and tok < 1080 then 'tokyo'
    when syd >= 420 and syd < 960 then 'sydney'
    else 'off_hours'
  end
  from (
    select
      extract(epoch from (at at time zone 'Europe/London')::time) / 60 as lon,
      extract(epoch from (at at time zone 'America/New_York')::time) / 60 as ny,
      extract(epoch from (at at time zone 'Asia/Tokyo')::time) / 60 as tok,
      extract(epoch from (at at time zone 'Australia/Sydney')::time) / 60 as syd
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

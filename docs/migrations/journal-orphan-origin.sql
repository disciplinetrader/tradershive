select
  observation_cursor is not null as was_trigger_created,
  opened_at is null as no_timestamp,
  opened_at is not distinct from closed_at as zero_duration,
  duration_seconds,
  count(*) as n,
  min(created_at) as first_created,
  max(created_at) as last_created
from public.journal_entries
where deleted_at is null
  and trade_id is null
  and account_id is null
group by was_trigger_created, no_timestamp, zero_duration, duration_seconds
order by n desc;

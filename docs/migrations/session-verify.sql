select
  user_id,
  opened_at is null as no_timestamp,
  trade_id is null and account_id is null as orphaned,
  count(*) as n,
  min(created_at) as first_created,
  max(created_at) as last_created
from public.journal_entries
where deleted_at is null
group by user_id, no_timestamp, orphaned
order by n desc;

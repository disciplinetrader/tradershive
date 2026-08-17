select
  n.nspname as schema,
  p.oid,
  p.prosrc like '%session%' as has_session,
  p.prosrc like '%session_auto_detected%' as has_session_auto_detected,
  p.prosrc like '%observation_cursor%' as has_observation_cursor,
  p.prosrc like '%source%' as has_source,
  p.prosrc like '%detect_session%' as calls_detect_session,
  length(p.prosrc) as src_len
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname = 'create_journal_draft_from_trade';

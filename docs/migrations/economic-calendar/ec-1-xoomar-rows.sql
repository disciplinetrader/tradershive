select count(*) as rows,
       min(event_time) as earliest,
       max(event_time) as latest,
       count(*) filter (where actual is not null) as with_actual,
       count(*) filter (where actual is null) as without_actual,
       count(*) filter (where raw_payload is not null) as with_payload
  from public.economic_events
 where source = 'xoomar';

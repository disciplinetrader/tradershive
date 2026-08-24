select id,
       event_time,
       title,
       raw_payload->>'periodLabel' as period_label,
       actual,
       extract(day from event_time at time zone 'UTC') as day_of_month
  from public.economic_events
 where source = 'xoomar'
   and actual is not null
   and (raw_payload->>'periodLabel' ~ '^[0-9]{4}-[0-9]{2}$'
     or extract(day from event_time at time zone 'UTC') = 1
     or (raw_payload->>'periodLabel' ~ '^[A-Za-z]+ [0-9]{4}$'
         and (event_time at time zone 'UTC')
             < to_date(raw_payload->>'periodLabel', 'Month YYYY') + interval '1 month'))
 order by event_time;

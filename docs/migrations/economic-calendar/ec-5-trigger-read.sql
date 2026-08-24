select id,
       created,
       status_code,
       timed_out,
       left(coalesce(error_msg, ''), 90) as error,
       left(coalesce(content, ''), 1500) as body
  from net._http_response
 where created > now() - interval '5 minutes'
   and coalesce(content, '') not like 'Unauthorized%'
 order by id desc
 limit 5;

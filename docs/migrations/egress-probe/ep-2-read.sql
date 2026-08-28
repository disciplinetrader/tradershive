-- Read the probe response back. Wait ~15s after firing.
--
-- No `content not like 'Unauthorized%'` filter here, unlike ec-5: a 401 is a
-- result worth seeing, not noise to hide.
select id,
       created,
       status_code,
       timed_out,
       left(coalesce(error_msg, ''), 90) as error,
       left(coalesce(content, ''), 4000) as body
  from net._http_response
 where created > now() - interval '10 minutes'
 order by id desc
 limit 5;

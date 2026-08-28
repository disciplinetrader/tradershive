-- Optional: the same response as one row per target, if ep-2's blob is awkward.
-- Errors if the body is not JSON (e.g. a bare "Unauthorized"), so run ep-2 first.
select r.id,
       r.status_code as endpoint_status,
       t->>'host'        as host,
       t->>'status'      as http_status,
       t->>'ms'          as ms,
       t->>'bars'        as bars,
       t->>'contentType' as content_type,
       left(t->>'bodyPrefix', 140) as body_prefix,
       t->>'error'       as error
  from net._http_response r
 cross join lateral jsonb_array_elements((r.content::jsonb) -> 'results') t
 where r.created > now() - interval '10 minutes'
   and coalesce(r.content, '') like '{%'
 order by r.id desc
 limit 9;

select id,
       created,
       status_code,
       (content::jsonb)->'xoomar'->>'fetched' as fetched,
       (content::jsonb)->'xoomar'->>'filtered' as filtered,
       (content::jsonb)->'xoomar'->>'upserted' as upserted,
       (content::jsonb)->'xoomar'->>'withActual' as with_actual,
       (content::jsonb)->'xoomar'->>'errors' as errors,
       (content::jsonb)->'xoomar'->>'warnings' as warnings
  from net._http_response
 where content like '%"xoomar"%'
 order by id desc
 limit 20;

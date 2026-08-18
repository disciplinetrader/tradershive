-- EC-2 — one statement, nothing to fill in, no secret to locate.
--
-- The secret is not typed in. It is read out of an existing cron job's command
-- text, where it already sits in plain form. Nothing leaves the database and
-- there is nothing to find in a settings page.
--
-- Caveat, and it is useful rather than a problem: five jobs are currently
-- failing with 401 (EC-4), so the secret borrowed here may be the stale one.
-- Both outcomes answer the EC-2 question:
--
--   200  → the endpoint works and the secret in those jobs is fine, so EC-4 is
--          something else (header name, URL, or the job body).
--   401  → the borrowed secret is stale, which CONFIRMS EC-4's diagnosis — and
--          still proves the published host is reachable from pg_net and
--          answers fast, because a 401 is a completed round trip. That rules
--          out H2 and leaves H1: the original 5 s timeout happened only on the
--          call that had a VALID secret and therefore got past auth into real
--          work.
--   timed out → H2 after all. The host is not reachable from pg_net; move the
--          job to the project--<uuid> alias.
--
-- Run it and wait. It sleeps 25 seconds internally, so the result comes back
-- in one go.

with fired as materialized (
  select net.http_post(
    url                  := 'https://tradershive.lovable.app/api/public/hooks/economic-calendar',
    headers              := jsonb_build_object(
                              'Content-Type', 'application/json',
                              'x-cron-secret',
                              (select substring(command from 'x-cron-secret"\s*:\s*"([^"]+)')
                                 from cron.job
                                where command like '%x-cron-secret%'
                                limit 1)
                            ),
    body                 := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) as request_id
),
waited as materialized (
  select pg_sleep(25) as slept from fired limit 1
)
select f.request_id,
       r.status_code,
       r.timed_out,
       left(coalesce(r.error_msg, ''), 90) as error,
       left(coalesce(r.content,  ''), 300) as body
  from fired f
  left join net._http_response r on r.id = f.request_id
 where (select count(*) from waited) >= 0;

-- If status_code and timed_out both come back NULL, the response simply had
-- not landed when the row was read — nothing is wrong. Re-run just this to
-- see it, no substitution needed:
--
--   select id, status_code, timed_out,
--          left(coalesce(error_msg,''),90) as error,
--          left(coalesce(content,''),300)  as body
--     from net._http_response
--    where created > now() - interval '5 minutes'
--    order by id desc
--    limit 5;

-- ── if you do want to see the secret itself ───────────────────────────────
-- Two places it can be read from, both without leaving SQL:
--
--   select jobname, command from cron.job where command like '%x-cron-secret%';
--   select name, decrypted_secret from vault.decrypted_secrets;   -- if used
--
-- The first shows what the failing jobs are actually sending, which is the
-- thing EC-4 needs compared against the server's CRON_SECRET.

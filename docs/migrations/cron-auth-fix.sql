-- BA-3 / EC-4 — repair cron authentication on all six jobs.
--
-- Root cause: every job sends `"apikey":"sb_publishable_..."`. That is the
-- PUBLISHABLE key, in a header `checkCronAuth` never reads — it wants
-- `x-cron-secret` (or Authorization: Bearer). So every call has been rejected
-- 401 since the jobs were written.
--
-- The guard reads `CRON_SECRET ?? HISTORICAL_SYNC_CRON_SECRET`. The latter has
-- been set since Jul 21 (hence 401 rather than 503) but its value cannot be
-- read back from the Secrets panel — the menu offers only delete. So a fresh
-- CRON_SECRET is added instead, which also takes precedence once present.
--
-- ORDER MATTERS. Publish BEFORE rewriting the jobs. Between adding the secret
-- and publishing, the server still expects HISTORICAL_SYNC_CRON_SECRET; jobs
-- rewritten early would send the new value and keep 401ing until the publish
-- lands. Harmless and self-healing, but it muddies the verification.

-- ── STEP 1 · generate the value ───────────────────────────────────────────
-- Copy the output. It is the only time it is convenient to read.

select encode(gen_random_bytes(32), 'hex') as new_cron_secret;

-- ── STEP 2 · add it, then PUBLISH ─────────────────────────────────────────
-- In the Lovable Secrets panel: Add secret, name it exactly CRON_SECRET,
-- paste the value. No VITE_ prefix — that would compile it into the client
-- bundle and make every /api/public/hooks/* endpoint world-callable.
-- Then Publish, because the cron jobs call tradershive.lovable.app, which is
-- the PUBLISHED deployment (200 + x-deployment-id), not the preview alias.
--
-- Nothing below works until the publish completes.

-- ── STEP 3a · repair battle-settlement FIRST, alone ───────────────────────
-- Highest-value and lowest-risk: 7 battles sit past end_at unfinalised, the
-- oldest since 2026-08-07, four still showing `live`. It is also idempotent
-- and touches nothing a user sees except finishing what should have finished.
-- Proving the mechanism on one job before rewriting five is the same sequence
-- BA-3's own runbook used.
--
-- Substitute <NEW_CRON_SECRET> once, here.

do $$
declare j record; newcmd text;
begin
  for j in
    select jobname, schedule, command from cron.job
     where command like '%apikey%' and jobname like '%settle%'
  loop
    newcmd := regexp_replace(j.command, '"apikey"\s*:\s*"[^"]*"',
                             '"x-cron-secret":"<NEW_CRON_SECRET>"');
    perform cron.schedule(j.jobname, j.schedule, newcmd);
    raise notice 'rewrote %', j.jobname;
  end loop;
end $$;

-- Wait ~2 minutes (these fire every minute), then look for a 200 appearing
-- among the 401s. A mix is the expected state at this point.

select status_code, count(*), max(created) as latest
  from net._http_response
 where created > now() - interval '3 minutes'
 group by status_code
 order by count(*) desc;

-- The real proof is not the status code — it is the work getting done:

select status, count(*)
  from public.battles
 where end_at < now()
 group by status
 order by count(*) desc;

-- Expect the four `live` past end_at to start moving to a final status. If
-- status codes say 200 but battles do not move, the auth is fixed and the
-- settlement logic is a separate problem.

-- ── STEP 3b · repair the remaining jobs ───────────────────────────────────
-- Same rewrite, no jobname filter. Reads each job's own name and schedule, so
-- nothing needs to be known or retyped, and only jobs still carrying `apikey`
-- are touched — running it twice is safe.

do $$
declare j record; newcmd text;
begin
  for j in select jobname, schedule, command from cron.job where command like '%apikey%'
  loop
    newcmd := regexp_replace(j.command, '"apikey"\s*:\s*"[^"]*"',
                             '"x-cron-secret":"<NEW_CRON_SECRET>"');
    perform cron.schedule(j.jobname, j.schedule, newcmd);
    raise notice 'rewrote %', j.jobname;
  end loop;
end $$;

-- ── STEP 4 · verify ───────────────────────────────────────────────────────

-- No job should still carry the publishable key.
select jobname, command like '%apikey%' as still_broken,
       command like '%x-cron-secret%' as fixed
  from cron.job
 order by jobname;

-- And every recent response should be 200.
select status_code, count(*), max(created) as latest
  from net._http_response
 where created > now() - interval '5 minutes'
 group by status_code
 order by count(*) desc;

-- ── Known follow-up, deliberately NOT bundled here ────────────────────────
-- These jobs inherit pg_net's 5000 ms default. `email-queue-process` sends up
-- to 50 emails per run and may not fit inside it; `historical-sync`, when it
-- is eventually scheduled (EC-5), certainly will not. Raise those timeouts as
-- a separate change once auth is proven, so one verification covers one
-- variable.

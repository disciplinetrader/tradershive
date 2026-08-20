-- EC-3 — repoint scheduled jobs off the PREVIEW alias onto the published host.
--
-- `project--<uuid>.lovable.app` is the gated preview: 403 + noindex on normal
-- pages, no x-deployment-id. The hook answers there only because
-- /api/public/* is exempt from site auth. It works TODAY and breaks whenever
-- that alias changes. `tradershive.lovable.app` is the published deployment
-- and is what the calendar job and the five repaired jobs already use.
--
-- This changes the HOST ONLY. Headers, schedules, bodies and timeouts are read
-- back from each job's own row and preserved, so it is idempotent and needs no
-- secret and no publish.
--
-- Run the steps SEPARATELY, and check each one landed — the SQL editor
-- silently truncates long pastes and still reports success.

-- ── STEP 1 · measure, do not assume ───────────────────────────────────────
-- EC-3 was logged against battle-tick. Confirm whether it is the only one:
-- repointing the one job you already knew about, while a second sits on the
-- same alias, is how this gets rediscovered in a month.

select jobname,
       active,
       substring(command from 'https://[^'']*') as url
  from cron.job
 order by (command like '%project--%') desc, jobname;

-- Expect: battle-tick on project--<uuid>.lovable.app, everything else on
-- tradershive.lovable.app. If a second job appears on the alias, it is in
-- scope for step 2 as written — no edit needed.

-- ── STEP 2 · repoint every job on the alias ───────────────────────────────

do $$
declare j record; newcmd text;
begin
  for j in
    select jobname, schedule, command from cron.job
     where command like '%project--%'
  loop
    newcmd := regexp_replace(j.command,
                             'https://project--[^/'']*\.lovable\.app',
                             'https://tradershive.lovable.app', 'g');
    perform cron.schedule(j.jobname, j.schedule, newcmd);
    raise notice 'repointed %', j.jobname;
  end loop;
end $$;

-- ── STEP 3 · verify the URL actually changed ──────────────────────────────
-- Check the VALUE, not that the statement ran. A zero-row loop raises no
-- notice and no error — indistinguishable from success if you do not look.

select jobname,
       substring(command from 'https://[^'']*') as url,
       command like '%project--%' as still_on_preview
  from cron.job
 order by jobname;

-- Expect still_on_preview = false for every row.

-- ── STEP 4 · confirm by work done, not by inspection ──────────────────────
-- battle-tick runs every minute, so this answers within ~2 minutes. A 200 is
-- necessary but not sufficient; EC-5's jobResponse means a run that failed
-- now returns 207 or 500, so anything other than 200 is a real signal.

select status_code, count(*), max(created) as latest
  from net._http_response
 where created > now() - interval '3 minutes'
 group by status_code
 order by count(*) desc;

-- If battle-tick starts answering non-200 after the repoint and did not
-- before, the published deployment is serving a different build of that route
-- than the preview was. src/routes/api/public/hooks/battle-tick.ts exists, so
-- a 404 would mean the publish is stale — republish rather than reverting.

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

-- MEASURED 2026-08-20: FIVE jobs were on the alias, not one —
-- battle-settlement-every-minute and all four email jobs. Only
-- economic-calendar-daily was on the published host. `battle-tick`, which
-- this issue was originally logged against, is not in cron.job at all and
-- never has been (see EC-7). Step 2 is driven off the same predicate, so it
-- covered all five without an edit — which is the argument for surveying
-- rather than repointing the one job you already knew about.

-- ── STEP 2 · repoint every job on the alias ───────────────────────────────
-- NOT a `do` block. Proved 2026-08-20: in this SQL editor a DO block runs,
-- raises every NOTICE, and its writes are discarded — the first version of
-- this step reported success twice and changed nothing. Plain statements
-- commit. See docs/known-issues.md and never use `for ... loop` here.
--
-- This is one set-returning select: cron.schedule is called once per matching
-- row, reading each job's own name, schedule and command. The returned rows
-- ARE the evidence — one jobid per job repointed, so an empty result means
-- nothing matched rather than nothing happened.

select cron.schedule(
         jobname,
         schedule,
         regexp_replace(command,
                        'https://project--[^/'']*\.lovable\.app',
                        'https://tradershive.lovable.app', 'g')
       ) as jobid,
       jobname
  from cron.job
 where command like '%project--%';

-- ── STEP 3 · verify the URL actually changed ──────────────────────────────
-- Check the VALUE, not that the statement ran. A zero-row loop raises no
-- notice and no error — indistinguishable from success if you do not look.

select jobname,
       substring(command from 'https://[^'']*') as url,
       command like '%project--%' as still_on_preview
  from cron.job
 order by jobname;

-- Expect still_on_preview = false for every row.
--
-- RUN THIS IN A SEPARATE RUN, AFTER RELOADING THE EDITOR. A re-read inside
-- the session that made the change sees the uncommitted write and reports
-- success — it cannot detect the failure this step exists to catch.

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

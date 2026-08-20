-- EC-7 — schedule battle-tick, and unschedule the job it supersedes.
--
-- This is step 4 of docs/battle-arena-fixes.md, written 2026-08-07 and never
-- applied. Steps 2, 3 and 5 were completed 2026-08-19; this one was missed,
-- which is why the SUPERSEDED job (`battle-settlement-every-minute`) is the
-- one that works and the state machine has never run server-side.
--
-- What is actually broken without it: nothing advances a battle
-- `upcoming -> open -> ready -> countdown -> live`. `battle-settlement` only
-- filters `status = 'live' AND end_at <= now()`, so it settles and cannot
-- promote. The only other caller of the state machine is a browser tab
-- polling `tick_battle(uuid)`. A battle nobody has open never starts.
--
-- Two departures from the 2026-08-07 runbook, both deliberate:
--   * Host is `tradershive.lovable.app`. The runbook hardcodes
--     `project--<uuid>.lovable.app`, the gated preview — that runbook is
--     where EC-3 came from, and repeating it would re-create it.
--   * The secret is READ BACK from a working job instead of pasted. Yesterday
--     took three attempts because `<NEW_CRON_SECRET>` was pasted literally and
--     "the header name changed" verified as success. A placeholder cannot be
--     mistyped if there is no placeholder.
--
-- Run the steps SEPARATELY. The editor truncates long pastes silently.

-- ── STEP 0 · GATE. Do not skip. ───────────────────────────────────────────
-- Scheduling this runs `tick_battles()` every minute, and the matchmaking
-- block lives in `tick_battles()` (plural) — NOT in `tick_battle(uuid)`,
-- which is all the client ever calls. So BA-1's broken matchmaking has never
-- executed once. It pairs two queued players, creates a battle, deletes both
-- from the queue, notifies both, and never joins either.
--
-- If this returns 0, BA-1 stays dormant and the swap is safe.
-- If it returns anything else, STOP: fix BA-1 first, or real users get
-- "Match Found!" for battles they are not in, every minute.

select count(*) as queued from public.matchmaking_queue;

-- ── STEP 1 · the swap, atomically ─────────────────────────────────────────
-- Both in one block so there is no window with two finalizers pointed at the
-- same rows, and none with no settlement at all.

do $do$
declare secret text; newcmd text;
begin
  -- Borrow the secret from the job proven working at 05:17 today.
  select substring(command from '"x-cron-secret"\s*:\s*"([^"]+)"')
    into secret
    from cron.job
   where jobname = 'economic-calendar-daily';

  if secret is null or length(secret) < 32 then
    raise exception 'refusing: read no plausible secret (got %)',
                    coalesce(secret, '<null>');
  end if;

  newcmd := format($cmd$
  select net.http_post(
    url                  := 'https://tradershive.lovable.app/api/public/hooks/battle-tick',
    headers              := '{"Content-Type":"application/json","x-cron-secret":"%s"}'::jsonb,
    body                 := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$cmd$, secret);

  perform cron.schedule('battle-tick-every-minute', '* * * * *', newcmd);
  raise notice 'scheduled battle-tick-every-minute (secret %% chars: %)', length(secret);

  if exists (select 1 from cron.job where jobname = 'battle-settlement-every-minute') then
    perform cron.unschedule('battle-settlement-every-minute');
    raise notice 'unscheduled battle-settlement-every-minute';
  else
    raise notice 'battle-settlement-every-minute was already absent';
  end if;
end $do$;

-- ── STEP 2 · verify the VALUE, not that it ran ────────────────────────────
-- Checking that a job exists is not checking what it will send.

select jobname,
       schedule,
       active,
       substring(command from 'https://[^'']*') as url,
       substring(command from '"x-cron-secret"\s*:\s*"([^"]+)"')
         = substring((select command from cron.job where jobname = 'economic-calendar-daily')
                     from '"x-cron-secret"\s*:\s*"([^"]+)"') as secret_matches
  from cron.job
 order by jobname;

-- Expect: battle-tick-every-minute present, '* * * * *', active, on
-- tradershive.lovable.app, secret_matches = true. And
-- battle-settlement-every-minute GONE from the list entirely.

-- ── STEP 3 · confirm by a real fire ───────────────────────────────────────
-- Wait ~2 minutes. battle-tick's body reports the in-flight fleet, so a job
-- that runs while achieving nothing is visible without platform logs.

select id, status_code, left(content, 200) as body, created
  from net._http_response
 where created > now() - interval '3 minutes'
 order by created desc
 limit 10;

-- Expect a 200 with {"ticked":true,"in_flight":{...},"ok":true}. Anything
-- else is real: jobResponse now returns 207/500 for a run that failed, so a
-- non-200 is a genuine signal rather than the old always-200 blind spot.

-- ── ROLLBACK, if step 3 goes wrong ────────────────────────────────────────
-- Restores the previous arrangement exactly. Settlement's command is rebuilt
-- from the same borrowed secret and the published host.
--
-- do $do$
-- declare secret text;
-- begin
--   select substring(command from '"x-cron-secret"\s*:\s*"([^"]+)"') into secret
--     from cron.job where jobname = 'economic-calendar-daily';
--   perform cron.unschedule('battle-tick-every-minute');
--   perform cron.schedule('battle-settlement-every-minute', '* * * * *', format($cmd$
--   select net.http_post(
--     url     := 'https://tradershive.lovable.app/api/public/hooks/battle-settlement',
--     headers := '{"Content-Type":"application/json","x-cron-secret":"%s"}'::jsonb,
--     body    := '{}'::jsonb
--   );
-- $cmd$, secret));
-- end $do$;

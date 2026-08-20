-- Schedule `historical-sync`. It has NEVER been scheduled — confirmed
-- 2026-08-18 and again 2026-08-20 against `cron.job`, which holds six jobs and
-- none of them this one. A create, not a repair.
--
-- REWRITTEN 2026-08-20. The previous version of this file proposed
-- `historical-sync-nightly` at `40 2 * * *` with a `<NEW_CRON_SECRET>`
-- placeholder. Both are superseded:
--
--   * The placeholder is the exact pattern that cost three attempts on
--     2026-08-19 — it was pasted literally into five jobs and "the header
--     changed" verified as success. The secret is now READ from a job already
--     proven working, so there is nothing to mistype.
--   * Nightly does not reach the target. See the arithmetic below.
--
-- ── Why every 15 minutes, and not nightly ─────────────────────────────────
--
-- Every symbol's base timeframe is 1m. One forward step (~1 day, 1,440 bars)
-- and one backward step (2 days, 2,880 bars) each fit a single 5,000-bar
-- Twelve Data page — one credit apiece. The 8 crypto symbols route to Binance
-- and are excluded entirely (CX-1: permanent 403 to this deployment), leaving
-- 25 symbols on Twelve Data.
--
-- The measured budget is 8 credits/min and 800/day.
--
--   Nightly at the old slice of 8, forward only:  8 credits fired near-
--   instantly with no inter-symbol delay — EXACTLY at the per-minute cap, zero
--   margin. Adding a backward phase to that run would have guaranteed a 429 on
--   its first execution rather than merely risked one.
--
--   Nightly at a budget-safe slice (5 forward + 3 backward): the backward
--   phase covers 6 symbol-days per night against 25 x 120 = 3,000 needed.
--   That is 500 nights. It never arrives.
--
--   Every 15 minutes at 2 + 2:  4 credits per run.
--     peak   4/min  against 8/min       — 2x headroom
--     daily  96 runs x 4 = 384/day      against 800/day  — 2x headroom
--     depth  2 symbols x 2 days x 96 = 384 symbol-days/day
--            3,000 / 384 = about 8 days to full 120-day depth.
--
-- ── Timeout ───────────────────────────────────────────────────────────────
--
-- 60 s, not pg_net's 5000 ms default — that default is what made the calendar
-- job fail on its first manual fire. A run is now 4 provider requests plus two
-- chunked upserts, which is seconds, so this is roughly 10x margin and still
-- far inside the 15-minute cadence. Note a pg_net timeout does NOT cancel the
-- server-side run; it only stops us hearing the answer.
--
-- NOT a `do` block. In this SQL editor a DO block runs, raises every NOTICE,
-- and discards its writes (EC-8). Plain statements only, verified from
-- returned values.

-- ── STEP 1 · schedule it ──────────────────────────────────────────────────
-- The secret is read from `economic-calendar-daily`, which has been firing
-- unattended and authenticating since 2026-08-20 05:17 UTC. The
-- `where length(s.secret) = 64` guard means that if it cannot be read this
-- returns ZERO ROWS and never calls cron.schedule, rather than quietly
-- scheduling a job with an empty secret.
--
-- A returned `jobid` means it happened. Zero rows means nothing did.

select cron.schedule(
  'historical-sync-15min',
  '*/15 * * * *',
  format(
    $cmd$select net.http_post(url:='https://tradershive.lovable.app/api/public/hooks/historical-sync',headers:='{"Content-Type":"application/json","x-cron-secret":"%s"}'::jsonb,body:='{}'::jsonb,timeout_milliseconds:=60000);$cmd$,
    s.secret
  )
) as jobid
from (
  select substring(command from '"x-cron-secret"\s*:\s*"([^"]+)"') as secret
    from cron.job where jobname = 'economic-calendar-daily'
) s
where length(s.secret) = 64;

-- ── STEP 2 · verify, in a SEPARATE run AFTER RELOADING the editor ─────────
-- A re-read inside the session that made the change sees its own uncommitted
-- work and reports success. That is EC-8, and it is why the battle-tick swap
-- appeared to land twice before it actually did.

select jobname,
       schedule,
       active,
       substring(command from 'https://[^'']*') as url,
       substring(command from '"x-cron-secret"\s*:\s*"([^"]+)"')
         = substring((select command from cron.job where jobname = 'economic-calendar-daily')
                     from '"x-cron-secret"\s*:\s*"([^"]+)"') as secret_matches
  from cron.job
 order by jobname;

-- Expect a SEVENTH row: historical-sync-15min, '*/15 * * * *', active, on
-- tradershive.lovable.app, secret_matches = true.

-- ── STEP 3 · observe it working — NOT from the fire response ──────────────
--
-- `net._http_response` says the endpoint answered. It does not say the sync
-- did anything, and a 200 over an empty run is exactly the blind spot EC-5
-- was about. The job table is the evidence.
--
-- Wait for two fires (~30 minutes), then:

select triggered_by,
       status,
       phase,
       count(*)                as runs,
       sum(candles_inserted)   as bars,
       max(created_at)         as latest
  from public.historical_import_jobs
 where created_at > now() - interval '1 hour'
 group by 1, 2, 3
 order by latest desc;

-- Expect BOTH `cron` and `cron:backfill` rows. They are deliberately
-- distinguishable so a backward walk that starts failing is attributable
-- without reading timestamps — the same table where GBP/USD's two 429s were
-- found.
--
-- `cron:backfill` absent means the backward phase was skipped. That is not
-- necessarily wrong: it skips when the forward phase hit a rate limit, and
-- per symbol when the target is reached, the provider is exhausted, or no
-- forward seed exists yet. The response body's `backfillSkipped` says which.

-- ── STEP 4 · confirm depth is actually growing ────────────────────────────
-- The point of the whole exercise. Run it now, then again tomorrow.

select symbol,
       min(ts)::date  as earliest,
       max(ts)::date  as latest,
       (max(ts)::date - min(ts)::date) as days_deep,
       count(*)       as bars
  from public.historical_candles
 group by symbol
 order by days_deep asc;

-- `days_deep` should climb by ~2 per backward step a symbol receives. At 2
-- symbols per run and 96 runs a day across 25 eligible symbols, each symbol
-- gets roughly 7-8 steps a day, so expect a shallow symbol to gain ~15 days
-- of depth per day until it reaches 120 and stops.

-- ── Rollback ──────────────────────────────────────────────────────────────
-- select cron.unschedule('historical-sync-15min');

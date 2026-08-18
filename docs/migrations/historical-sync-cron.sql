-- Create the historical-sync job. It has NEVER been scheduled — confirmed
-- 2026-08-18, zero rows in cron.job matching the endpoint. This is a create,
-- not a repair.
--
-- ── First: you do not need to recover the old CRON_SECRET ─────────────────
--
-- All six jobs need rewriting anyway. So do not go hunting for the existing
-- value — MINT A NEW ONE and set both sides to agree:
--
--   1. Generate one:  select encode(gen_random_bytes(32), 'hex');
--   2. Set CRON_SECRET to that value in the deployment's environment
--      variables (no VITE_ prefix — that would compile it into the client
--      bundle and make every /api/public/hooks/* endpoint world-callable).
--   3. Use the same value in every job body below and in the five repairs.
--
-- If it happens to be in Supabase Vault, this reads it without leaving SQL:
--   select name, decrypted_secret from vault.decrypted_secrets;
--
-- ── Timeout ───────────────────────────────────────────────────────────────
--
-- 120 s, not pg_net's 5000 ms default — that default is what made the calendar
-- job fail, and this endpoint does far more work. Note that pg_net timing out
-- does NOT cancel the server-side run; it only stops us hearing the answer.
-- The platform's own request limit is the real ceiling (see the note below).

select cron.schedule(
  'historical-sync-nightly',
  '40 2 * * *',
  $$
  select net.http_post(
    url                  := 'https://tradershive.lovable.app/api/public/hooks/historical-sync',
    headers              := '{"Content-Type":"application/json","x-cron-secret":"<NEW_CRON_SECRET>"}'::jsonb,
    body                 := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- ── Manual trigger, for the ETH/USDT test ─────────────────────────────────
-- Run this once after scheduling, then check bars with the query at the end.

select net.http_post(
  url                  := 'https://tradershive.lovable.app/api/public/hooks/historical-sync',
  headers              := '{"Content-Type":"application/json","x-cron-secret":"<NEW_CRON_SECRET>"}'::jsonb,
  body                 := '{}'::jsonb,
  timeout_milliseconds := 120000
) as request_id;

-- ── Did a previously-empty Binance symbol actually fill? ──────────────────
-- ETH/USDT is the right first test: Binance needs no API key and its provider
-- throttles itself, so it is the case most likely to succeed cleanly.
-- runIncrementalUpdate seeds an empty symbol with `now() - 30 days`, so expect
-- roughly 30 days of bars at that symbol's base_timeframe, ending near now.

select symbol, timeframe, count(*) as bars, min(ts) as first_bar, max(ts) as last_bar
  from public.historical_candles
 where symbol in ('ETH/USDT', 'SOL/USDT', 'BTC/USDT')
 group by symbol, timeframe
 order by symbol, timeframe;

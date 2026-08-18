-- EC-2 — the decisive probe. No secret needed; do not substitute anything.
--
-- Three unauthenticated GETs against root paths. Root does no work on our
-- server, so duration cannot be the cause of a timeout here. That is the whole
-- point: this separates "our endpoint is slow" (H1) from "pg_net cannot reach
-- the published host" (H2) without involving the endpoint at all.
--
-- STEP 1 — run this. It returns three request ids.

select 'A · baseline (example.com)' as probe, net.http_get(url := 'https://example.com') as request_id
union all
select 'B · published host root',      net.http_get(url := 'https://tradershive.lovable.app/')
union all
select 'C · preview alias root',       net.http_get(url := 'https://project--237f7325-035a-4d38-a67f-36c64e02b573.lovable.app/');

-- STEP 2 — wait ~10 seconds (pg_net is asynchronous; the default timeout is
-- 5 s, so everything has resolved by then), then run this and match on id.

select id, status_code, timed_out, left(coalesce(error_msg, ''), 70) as error
  from net._http_response
 order by id desc
 limit 3;

-- ── what settles it ───────────────────────────────────────────────────────
--
-- A 403 or 200 both count as SUCCESS here. Any status code at all means a
-- full round trip completed, which is the only thing being tested.
--
--   B times_out, C has a status   → H2 CONFIRMED. The published host is
--                                   unreachable from pg_net. Point the job at
--                                   the alias; BA-3 was right by accident.
--
--   B and C both have a status    → H2 REFUTED, both hosts reachable. The
--                                   timeout was duration — go run probe D in
--                                   economic-calendar-cron-diagnose.sql (the
--                                   endpoint with a 30 s budget) to confirm
--                                   H1, and keep the published host.
--
--   A also times out              → not our hosts at all. pg_net egress is
--                                   broken generally; escalate to Supabase.
--
-- Note on the job inventory: every existing job targeting the alias and none
-- targeting the published host does NOT prove the published host is
-- unreachable. It only means today's timeout has no contradicting precedent —
-- H2 is unfalsified, not established. This probe is what establishes it.

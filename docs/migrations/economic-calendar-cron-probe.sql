-- EC-2 — the decisive probe. No secret needed; do not substitute anything.
--
-- Three unauthenticated GETs against root paths. Root does no work on our
-- server, so duration cannot cause a timeout here. That is the point: this
-- separates "our endpoint is slow" (H1) from "pg_net cannot reach the
-- published host" (H2) without involving the endpoint at all.
--
-- ── READ THIS FIRST ───────────────────────────────────────────────────────
--
-- `order by id desc limit 3` DOES NOT WORK for reading these back. Several
-- jobs are scheduled every minute and are currently failing with 401s; they
-- insert rows between the two statements below and take the top of that list.
-- Reading them by mistake looks like a clean result — three identical rows —
-- and is how a wrong conclusion gets drawn confidently. Filter by the exact
-- request ids instead.
--
-- Built-in sanity check: probe A is example.com, which returns 200. If row A
-- is not 200, you are looking at the wrong rows. No exceptions.

-- ── STEP 1 ────────────────────────────────────────────────────────────────
-- Run this. WRITE DOWN the three request ids it returns.

select 'A · baseline (example.com)' as probe, net.http_get(url := 'https://example.com') as request_id
union all
select 'B · published host root',      net.http_get(url := 'https://tradershive.lovable.app/')
union all
select 'C · preview alias root',       net.http_get(url := 'https://project--237f7325-035a-4d38-a67f-36c64e02b573.lovable.app/');

-- ── STEP 2 ────────────────────────────────────────────────────────────────
-- Wait ~10 seconds, then substitute the three ids from step 1 and run this.
-- Nothing else can leak in, because the ids are exact.

select id, status_code, timed_out, left(coalesce(error_msg, ''), 70) as error
  from net._http_response
 where id in (<A_ID>, <B_ID>, <C_ID>)
 order by id;

-- ── what settles it ───────────────────────────────────────────────────────
--
-- A 403 and a 200 both count as SUCCESS. Any status code means a full round
-- trip completed, which is the only thing under test. `timed_out = true` with
-- an empty status_code is the failure.
--
-- First, confirm A = 200. Then:
--
--   B timed out, C has a status   → H2 CONFIRMED. The published host is
--                                   unreachable from pg_net. Point the job at
--                                   the alias and record why.
--
--   B and C both have a status    → H2 REFUTED, both hosts reachable, so the
--                                   timeout was duration. Confirm H1 with
--                                   probe D in the diagnose file (the endpoint
--                                   at a 30 s budget) and keep the published
--                                   host.
--
--   A timed out too               → not our hosts. pg_net egress is broken
--                                   generally; escalate to Supabase.
--
-- ── two things that do NOT settle it ──────────────────────────────────────
--
-- 1. The job inventory. Every job targeting the alias and none the published
--    host means today's timeout has no contradicting precedent. That leaves
--    H2 unfalsified, not established.
--
-- 2. The 401s themselves. `checkCronAuth` rejects BEFORE the handler does any
--    work, so a 401 is fast by construction and tests neither duration nor the
--    published host — those jobs all target the alias. The calendar trigger is
--    the only call carrying a valid secret, which is the only reason it got
--    far enough to be slow. That asymmetry is the confound; these probes
--    remove it by testing a path that needs no auth on either host.

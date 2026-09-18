# TradersHIVE — Read-Only Production Preflight Record

**Date:** 2026-09-18 · **Mode:** READ-ONLY (no production writes were made) · **Author:** security remediation (Claude)
**Production:** `THIVE ARENA` (`237f7325-035a-4d38-a67f-36c64e02b573`, cluster `7662742571317219726`)
**Rehearsal:** `a4d32bcf-…` (cluster `7678069749886157684`) — distinct cluster, confirmed.

Every production statement in this preflight was a `SELECT` / read. No INSERT/UPDATE/DELETE/DDL/GRANT was issued against production. The 5 overdue-active prop challenges and the frozen ingestion were observed and **left untouched**.

## D-7 decision (owner) — RESOLVED for this deployment
Historical suspicious data is **LEFT UNCHANGED**: no voiding, no rank/balance/reward recompute, no historical result edits. The reconciliation recommendations (`phase-2-reconciliation-and-status.md` §5) are retained for a **later, separate, owner-approved** cleanup. This closes D-7 for now.

---

## 1. N-13 — historical ingestion root cause

**Evidence (read-only):**
- Last 10 days: essentially every `historical_import_jobs` row is `status=success` with **0 fetched / 0 inserted**; **zero failed jobs**. 384/386 recent `historical_sync_logs` are *"Provider confirmed this window is empty — recording an empty step"* (the `confirmedEmpty` path).
- Last 7 days of forward cron touched **only AMZN & MSFT (twelvedata, 1m)** — 1,344 jobs, all 0 bars — while a **5-minute** twelvedata job **did** fetch 312 bars.
- Every request has `range_from` frozen at **2026-09-04 20:00** → now (~14 days), real provider latency ~240 ms, no error.
- All 30 enabled symbols (twelvedata **and** bybit crypto) have `latest_imported` frozen at **2026-09-04..07**.
- The `isEmptyWindowError` matcher is narrow and correct (`code:400 ∧ status:error ∧ "no data is available on the specified dates"`); a plan-lock message would instead **throw** (a failed job), which is not happening.

**Root cause (classified):** primarily **provider credentials/plan** — the Twelve Data plan does not serve **1-minute** intraday history back to the frozen edge; TD returns a genuine *"No data on the specified dates"* (400), correctly read as an empty window (5-minute history works → account/key valid, 1-minute depth is the shallowest tier and is exhausted). Amplified by a **code ratchet**: the forward walk sets `from = edge + step`; once the edge aged past TD's rolling 1-minute window (during a cron lapse around 2026-09-04) the request is permanently older than the plan serves, so nothing inserts, the edge never advances, and `from` stays pinned — freezing every symbol at once. Crypto (bybit) is a **separate egress cause (CX-1)**: it is excluded from the automatic slice, so it also froze at 2026-09-04 and is never retried automatically.

**CODE fix shipped (rehearsal, not deployed):**
- `boundedIncrementalFrom` (commit this session): when the edge is > `MAX_INCREMENTAL_LOOKBACK_MS` (3 days) behind, the forward walk RESUMES at `now − cap` (inside any plan's 1-minute depth) and leaves the intervening gap for backfill / reseed — breaking the ratchet so a transient lapse can no longer become a permanent stall. Unit-tested (4 cases).
- `nextForwardEmptyState` + `ingestion_frozen` one-shot alert (committed earlier): makes a frozen front edge visible (Phase 0's core complaint was "no alert"). Unit-tested (5 cases).

**Required OWNER action (config — not code, do NOT guess/expose credentials):** confirm the Twelve Data plan's 1-minute intraday history window; either upgrade to a plan whose 1-minute depth covers ongoing sync, or accept the `boundedIncrementalFrom` behavior (resume recent + backfill the gap). Separately, resolve crypto egress (CX-1) so bybit re-enters the automatic slice, or route crypto through the reachable pg_net path. After deploy, the `ingestion_frozen` alert and the front edges advancing are the success signals.

---

## 2. O-2 — cron inventory & single finalizer

**Active cron jobs (7), read from `cron.job`; 24 h health from `cron.job_run_details`:**

| job | schedule | endpoint | 24h runs / ok | notes |
|-----|----------|----------|---------------|-------|
| battle-tick-every-minute | `* * * * *` | /hooks/battle-tick | 1440 / 1440 | ticks + finalizes battles (single finalizer) |
| historical-sync-15min | `*/15 * * * *` | /hooks/historical-sync | 96 / 96 | HTTP 200 but inserts 0 (N-13) |
| email-queue-process | `* * * * *` | /hooks/email-queue | 1440 / 1440 | |
| email-reengagement | `0 * * * *` | /hooks/email-reengagement | 24 / 24 | |
| economic-calendar-daily | `17 5 * * *` | /hooks/economic-calendar | 1 / 1 | |
| email-weekly-report | `0 9 * * 1` | /hooks/email-weekly-report | (not due in 24h) | |
| email-monthly-report | `0 9 1 * *` | /hooks/email-monthly-report | (not due in 24h) | |

**Findings:**
- **Single authoritative battle finalizer** — only `battle-tick` finalizes (via `tick_battle → finalize_battle`); **no** separate `battle-settlement` job. **B-9 is not a duplicate-finalizer risk on production.**
- **MISSING: championship lifecycle cron.** `tick_championships` / `start_championship` / `finalize_championship` are invoked **only** by a manual admin action (`adminChampionshipAction`, `adminGuard`). Nothing schedules `tick_championships`, which is built to batch-tick all championships → championships do not start/finalize by time on their own.
- **MISSING: prop-challenge cron** (see §5).
- **HTTP-200-but-app-failed:** `historical-sync` (N-13) — surfaced now by the `ingestion_frozen` alert.
- No obsolete/duplicate jobs found.

**Desired final cron inventory (owner installs; NOT installed here):** keep the 7 above, **add** two pure-DB jobs (no external egress, no HTTP hook/secret needed):
```
SELECT cron.schedule('championship-tick-every-minute', '* * * * *', $$ SELECT public.tick_championships(); $$);
SELECT cron.schedule('prop-expiry-hourly',            '5 * * * *', $$ SELECT public.expire_prop_challenges(); $$);
```
Also recommended (O-2 hygiene, not blocking): an HTTP-outcome monitor over `net._http_response` that alerts on non-2xx per job.

---

## 3. O-1 — email

**Evidence (read-only):** `email_queue` = 92 rows, **all `sent`**, **0 stuck in `processing`**. Provider is an env var (`EMAIL_PROVIDER`) — not readable via SQL — and defaults to `noop` in production; 92 `sent` over two months is consistent with noop. The code bug was present: `noop` returned `ok:true` and both send paths mapped `ok → 'sent'`, so undelivered mail was recorded as delivered; no reaper existed for `processing`.

**CODE fix shipped (rehearsal/vitest, not deployed):** `EmailSendResult.skipped`; `noop` sets it; immediate-send and worker paths record **`skipped`** (not `sent`) and don't count it as a real send; `reapStuckEmailJobs` returns `processing` jobs older than 15 min to `pending` (or `failed` when out of attempts), conditional on status (idempotent). Verified by vitest; no mail sent to real users. **Owner action:** confirm `EMAIL_PROVIDER` in production (still `noop` → expected until a real provider is wired).

---

## 4. O-3 — secrets (READ-ONLY; no values printed, nothing rotated)

Runtime secrets live in the Lovable/Supabase environment and are **not readable via SQL**, so status is reported as observable/inferred only:

| secret | status | basis |
|--------|--------|-------|
| TWELVE_DATA_API_KEY | **SET (inferred)** | 5-minute fetch returned 312 bars; 1-minute returns structured "no data", not auth error |
| SUPABASE_SERVICE_ROLE_KEY | **SET (inferred)** | service-role RPC/admin writes succeed; no MD-11-style 401 stalls |
| cron secret | **SET (inferred)** | all crons hit authed endpoints and return 200 |
| EMAIL_PROVIDER | **UNKNOWN** (defaults to `noop` in prod) | env var; queue behavior consistent with noop |
| crypto provider (bybit) egress | **reachability issue (CX-1)** | excluded from automatic slice; not a missing key per se |
| LOVABLE_AI_KEY / FINNHUB_API_KEY | **UNKNOWN** | not observable read-only |

**Inline cron-secret exposure (CONFIRMED):** all 7 `cron.job` commands embed the cron secret as an **inline plaintext literal** (`x-cron-secret` header; none use `current_setting`/vault). **Supabase Vault IS available** (`vault.decrypted_secrets` present). **Owner action:** move the cron secret into Vault and rewrite the 7 cron commands to read it from `vault.decrypted_secrets` (or a `current_setting` GUC) instead of a literal; rotate the exposed secret. Not doable read-only.

---

## 5. Prop-challenge lifecycle cron — DECISION: needed (for expiry)

Breach/pass depend on equity, which only moves when trades close (covered by the trade path / HUD). **Expiry is purely time-based** and browser-independent: a challenge whose duration elapses without hitting target must fail even if the trader never returns. Nothing does this today — production has **5 active challenges already past `ends_at`**. `evaluateChallenge` has no expiry branch either.

**CODE shipped (rehearsal, not deployed):** `expire_prop_challenges()` (service-role, idempotent) transitions overdue active challenges → `failed` with a clear reason; a future challenge is untouched; returns count; authenticated cannot execute. Cron spec in §2 (owner-installs). Breach/daily-rollover need no cron (trade-driven).

---

## 6. supabase_admin default privileges (D2/D4/D6)

**Confirmed on production (read-only):** `current_user = postgres`, `pg_has_role(postgres,'supabase_admin','MEMBER') = false` — same **K1** limitation as rehearsal. `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin …` cannot be run by `postgres` (42501). **Owner/Supabase-support action required** for D2/D4/D6; they affect only supabase_admin-created objects, not app functions. Do NOT weaken security to work around it. D1/D3/D5 (postgres) are self-serve and rehearsed.

---

## Production drift check (read-only) — clean
For every object the migrations touch, production is exactly in the pre-Phase-2 state the migrations assume:
- The 8 new Phase 2 functions (`open_trade`, `close_trade`, `partial_close_trade`, `_apply_settlement_stats`, `record_battle_replay_trade`, `award_xp_coins`, `get_shared_journal_entry`, `expire_prop_challenges`) are **absent** on prod → created fresh.
- The 4 CREATE-OR-REPLACE targets (`finalize_battle`, `finalize_championship`, `record_practice_activity`, `journal_sync_tag_arrays_for`) **exist** as their **old** versions (finalize_battle has no I3f guard; finalize_championship not wired to `award_xp_coins`) → replace cleanly.
- Contract targets **open**: authenticated has INSERT on all 35 `paper_trades` columns; 70 write privileges across prop tables → REVOKEs apply.
- The enumerable `journal_entries` anon read policy **exists** → I3d drop applies.
- `postgres` public-function default still grants `anon=X` → D1/D3/D5 will change it (matches Phase 0 baseline).
No conflicting drift; no partially-applied Phase 2 state on production.

## Verification
- `bun run typecheck` → exit 0.
- Full `vitest run` → **67 files, 927 passed, 2 skipped, 0 failed**.
- Rehearsal regression → all Phase 2 objects present and in the applied state (settlement RPCs; finalize_battle I3f; finalize_championship wired; record_practice_activity guard + anon revoked; paper_trades INSERT / account_statistics / prop_challenges write locks; journal anon policy dropped).

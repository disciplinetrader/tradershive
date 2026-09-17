---
title: TradersHIVE remediation — Phase 0 live verification report
status: PARTIAL — awaiting operator execution of phase-0-readonly-queries.sql
created: 2026-09-17
plan: _bmad-output/planning-artifacts/remediation-plan.md
query_package: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql
repo_commit: 99644e0d (branch claude-tradershive-audit)
---

# Phase 0: Live verification report

> **Read this first.** This session **does not have catalog-level access to the
> live Supabase database.** The only live credential on this machine is the
> **publishable (anon) key** in the tracked `.env`:
>
> - no `psql`
> - no Supabase CLI
> - no service-role or secret key
> - no DB password
> - no E2E user credentials in the environment
>
> This matches known-issues JR-3.
>
> As a result:
>
> - **Every finding that needs catalog or data access is marked AWAITING LIVE
>   VERIFICATION.** None of them was inferred from migrations.
> - The only live evidence in this report comes from **24 anonymous PostgREST
>   requests**, all read-only. Each was either a `HEAD` count request (no row
>   bodies) or a `GET … limit=0`. They ran between 2026-09-17 06:21:21 and
>   06:21:54 UTC. §12 lists the exact commands.
> - Everything else is packaged in `phase-0-readonly-queries.sql`: 61 numbered
>   queries, all `SELECT`/`WITH`, with the cron secret redacted. Run them one at
>   a time in the Lovable SQL editor. Then fill the **Live result** columns
>   marked `⏳`.
>
> **No production state was changed.** No RPC was called, no row was read, no
> code or migration was edited, and Phase 1 has not started.

Status vocabulary used below:

| Status | Meaning |
|---|---|
| **CONFIRMED** | Established by live evidence captured in this session. |
| **REFUTED** | Live evidence contradicts the finding. |
| **STILL UNKNOWN (⏳ Q-xx)** | Not established live. The query that will settle it is named. |

---

## 1. Executive summary

- **Live access achieved: anonymous role only.** That was enough to verify
  what `anon` can read. It was not enough to verify anything about the
  `authenticated` role, function privileges, function bodies, cron, or data.
- **Confirmed live (5 facts):**
  1. `anon` is denied SELECT on `profiles` (`42501`).
  2. `anon` is denied SELECT on `historical_candles` (`42501`). This matches
     the repo's latest intent (`20260805110114` revoke), so the MIG-1 entry's
     "failed grant" reading is stale (plan O-7).
  3. `anon` is denied EXECUTE on `is_platform_admin`. This shows the
     2026-07-22 revoke sweep landed for at least that function.
  4. `anon` **holds table-level SELECT** on 13 tables the repo never granted to
     `anon` (the 12 in D-1 plus `historical_import_jobs`), including
     `paper_trades`, `paper_accounts` and `prop_challenges`.
     That is a live-vs-repo difference. It points strongly to Supabase's
     default privileges being active, which raises the likelihood of plan
     finding C-7 (new functions executable by `anon`/`authenticated`).
  5. Row-level security returns **zero rows to `anon`** on the 12 D-1 tables
     and on `journal_entries`, as of 06:21 UTC. (`historical_import_jobs` is
     blocked inside its policy instead.)
- **Refuted:** none.
- **Still unknown:** every score-integrity, function-privilege, battle,
  championship, cron, ingestion, data-contamination and environment finding.
  That covers 23 plan findings. The SQL package settles all of them.
- **Four new risks were found in source this phase** (§10). They make the
  C-1 exposure worse:
  - Battle and championship rule triggers only fire on INSERT, so an UPDATE
    can attach an existing trade to a competition and skip the rules.
  - A policy lets users insert themselves into any battle.
  - The championship window check trusts a client-supplied `opened_at`.
  - An older `join_battle(uuid)` overload may still exist live.
- **Phase 1 is NO-GO** until the §11 prerequisites are met. Most of them mean
  running Sections A–C and G of the query package.

---

## 2. Live-vs-repo differences

| # | Object | Repo intent | Live (evidence) | Status |
|---|---|---|---|---|
| D-1 | Table SELECT for `anon` on `paper_trades`, `paper_accounts`, `account_statistics`, `prop_challenges`, `prop_challenge_days`, `battles`, `battle_participants`, `battle_results`, `battle_rankings`, `championships`, `championship_rankings`, `provider_market_assignments` | No `anon` grant in any migration. Grants go to `authenticated` and `service_role` only (e.g. `20260717065801:28,67`; `20260727080806:41`; `20260718081017:133,221`; `20260806095941:2`). | `anon` HEAD returns **200** with `Content-Range */0`. Without the privilege PostgREST returns 401/42501, as it did for `profiles`. So `anon` has SELECT. (P-02…P-11, P-14, P-15R) | **CONFIRMED difference** |
| D-2 | `historical_import_jobs`: `anon` table SELECT | Not granted in repo | GET returns `42501 permission denied for function is_platform_admin`. Postgres reaches policy evaluation only after the table privilege check passes, so `anon` has table SELECT and is then blocked inside the policy. (P-16G) | **CONFIRMED difference** (harmless: blocked by the policy) |
| D-3 | `profiles`: `anon` SELECT | Revoked (`20260718070533:8`, `20260719130616:3`, `20260722114130:3`) | `42501 permission denied for table profiles` (P-12G) | **CONFIRMED match** |
| D-4 | `historical_candles`: `anon` SELECT | Granted `20260720091538:90`, then revoked `20260805110114:3` | `42501 permission denied for table historical_candles` (P-13G) | **CONFIRMED match** with latest intent |
| D-5 | `is_platform_admin(uuid)`: `anon` EXECUTE | Revoked by sweep `20260722114130:24-35` | Denied, as shown by the D-2 error text (P-16G) | **CONFIRMED match** |
| D-6 | Function bodies (23 security-definer functions) | Repo fingerprints are embedded in Q-C1 | ⏳ Q-C1 / Q-C2 | STILL UNKNOWN |
| D-7 | Policies, table and column grants for `authenticated` | See §6 | ⏳ Q-A2…Q-A6 | STILL UNKNOWN |
| D-8 | Function EXECUTE for PUBLIC / `authenticated` | See §7 | ⏳ Q-B1…Q-B4 | STILL UNKNOWN |
| D-9 | Cron jobs | Only in `docs/migrations/*.sql`, applied by hand | ⏳ Q-G1…Q-G4 | STILL UNKNOWN |

**Why D-1 matters:** Supabase projects normally set
`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES|FUNCTIONS|SEQUENCES TO anon, authenticated, service_role`.
D-1 is the live signature of that for tables. If the same default ACL covers
functions (⏳ Q-B3), then every function created after the 2026-07-22 sweep
without an explicit `REVOKE` is executable by `anon` and `authenticated`. That
includes `commit_settlement` and `_join_battle_as`. D-1 is **not** proof of
C-7; Q-B1 and Q-B3 are.

---

## 3. Confirmed findings

| Plan ID | Finding | Result | Evidence |
|---|---|---|---|
| O-7 | The MIG-1 known-issues entry treats `anon`'s missing `historical_candles` grant as a failed migration | **CONFIRMED stale.** Live denial matches the deliberate revoke in `20260805110114`. The live state matches the latest repo intent, though a probe can't show which statement produced it. | P-13G |
| (anon surface) | `anon` can't read profiles, candles or import jobs, and gets zero rows from the competition and paper-trading tables | **CONFIRMED** at 2026-09-17 06:21 UTC | P-02…P-16G |
| S-4 (anon part only) | The 2026-07-22 sweep removed `anon` EXECUTE from pre-existing security-definer functions | **CONFIRMED for `is_platform_admin` only.** Not generalisable: every other function still needs Q-B1/Q-B2. | P-16G |

---

## 4. Refuted findings

None. No live evidence obtained in this session contradicts any plan finding.

**Partial note on S-2 (journal shares):** `anon` enumeration of
`journal_entries` returned **0 rows** at 06:21 UTC (P-11). That does **not**
refute S-2. Two explanations fit:

- (a) no entry currently has `is_public AND share_token IS NOT NULL`, or
- (b) the live policy differs from the repo.

⏳ Q-I13 counts rows under the repo policy's predicate, and ⏳ Q-A2 shows the
live policy. S-2's second vector, `authenticated` users enumerating shared
entries, was not testable without a user session.

---

## 5. Still-unverified findings

Every row is **STILL UNKNOWN**. No live result has been captured for these.

| Plan ID | Finding | Settled by | Confirm if … | Refute if … |
|---|---|---|---|---|
| C-1 | Users can write score-source tables directly | Q-A2, Q-A3, Q-A5, Q-A6, Q-D2 | `authenticated` has INSERT or UPDATE, a permissive ALL/INSERT/UPDATE policy with `auth.uid() = user_id` exists, and no trigger blocks `pnl`/`balance` | privilege absent, or a policy/trigger blocks those columns |
| C-5 | Users can set their own ELO and battle stats | Q-D1, Q-D2, Q-D3, Q-A5 | `auth_can_update_column` is true and `trigger_resets_column` is false for `elo`, `battle_wins`, `battles_played`, `*_battle_streak` | the trigger resets them, or column UPDATE is not granted |
| C-6 | `commit_settlement` can move any account's balance | Q-B1, Q-C1, Q-C3 | the function exists, `authenticated_exec` or `anon_exec` is true, and it takes `_user_id` | absent live (`LIVE MISSING`), or not executable by those roles |
| C-7 | Post-sweep functions are executable by PUBLIC / `anon` / `authenticated` | Q-B1, Q-B2, Q-B3 | `_join_battle_as` shows `anon_exec` or `authenticated_exec` true; Q-B3 shows function default ACL entries for `anon`/`authenticated` | both false |
| C-8 | Existing competition data is contaminated | Q-I1…Q-I12 | any non-zero anomaly count needing explanation | all zero (or explained by BA-11/BA-8 known causes) |
| S-2 | Shared journal entries can be listed | Q-A2, Q-A3, Q-I13 | the policy lacks a token comparison, `anon`/`authenticated` have SELECT, and the count is > 0 | the policy compares the token, or SELECT is not granted |
| S-4 | Championship lifecycle functions callable by `authenticated` | Q-B1, Q-B2 | `authenticated_exec` is true for `start_championship`, `finalize_championship`, `tick_championships` or `emit_championship_activity` | all false |
| S-5 | `finalize_battle` trusts `auth.uid() IS NULL` | Q-B1, Q-C1, Q-C3 | `null_uid_branch` is true and `anon_exec` is true (**critical**); `null_uid_branch` true with `anon_exec` false is the latent form | no such branch live |
| S-6 | The protection trigger reads the legacy role setting | Q-C3 (`reads_legacy_role_guc`), Q-D4 | the legacy setting is read **and** Q-D4 shows ledger/profile mismatches | not read, or no mismatches |
| B-1 | A non-host viewer's tick can't finalize a battle | Q-C1/Q-C2 (bodies), Q-B1, Q-E3 | the live `tick_battle` calls `finalize_battle` directly, the live `finalize_battle` rejects non-hosts, and Q-E3 median lag is minutes rather than seconds | the live bodies differ |
| B-2 | Host early finalize / finalize-rule mismatch | Q-C2, Q-E3, Q-E4 | Q-E4 returns rows (battles completed before `end_at`) | no body path allows it and Q-E4 is empty |
| B-3 | Battles below `min_participants` never expire | Q-C2, Q-E2 | Q-E2 returns stuck battles | the live `tick_battle` has an expiry branch and Q-E2 is empty |
| B-4 | Rewards recorded but not paid; user-client awards reverted | Q-C2, Q-I12, Q-D4 | Q-I12 `no_matching_xp_ledger` > 0; Q-D4 `xp_mismatch` > 0 | both zero |
| B-5 | Nothing schedules `tick_championships` | Q-F1, Q-F2, Q-F3, Q-F4 | no cron or caller, and Q-F3 shows overdue transitions | a cron job or caller exists |
| B-9 | Duplicate battle finalizer crons | Q-G1, Q-G3, Q-G4 | both `battle-tick` and `battle-settlement` are active | only one exists |
| P-1 | Users can set their own prop challenge result | Q-A2, Q-A3, Q-A5, Q-I9 | an owner UPDATE/ALL policy, UPDATE on `status`, and Q-I9 flagged rows | the privilege or policy is absent |
| H-6 | Stale `running` import jobs | Q-H2 | rows returned | empty |
| H-7 | Two writers to `historical_candles` | Q-H1 (`triggered_by`), md4-probe (existing) | writes from an unauthenticated proxy path appear | — |
| H-8 | Pending hs-* verifications | existing `docs/migrations/historical-sync/hs-*` | — | — |
| H-9 | Service-role key / crypto provider | Q-J1, Q-H5 | — | — |
| O-1 | Email noop provider marks jobs sent | Q-J3 | sent rows with no provider evidence, or stuck `processing` rows | — |
| O-2 | Cron HTTP outcomes unmonitored | Q-G3, Q-G4 | non-2xx responses while `job_run_details` says succeeded | all 2xx |
| O-3 | Secrets inventory | §8 / Q-J* | — | — |
| H-1 (data signal) | Page loop stops early | Q-H4 | successful 1m jobs with fetched far below expected | — |

---

## 6. Current RLS / policy matrix

**Live columns** are only filled where the anon probes established something.
The **repo intent** column is from migrations and is **not** live evidence.

### 6.1 RLS and anon access

| Table | RLS enabled (live) | Repo RLS | anon SELECT privilege (live) | anon rows visible (live) | Settled by |
|---|---|---|---|---|---|
| paper_trades | ⏳ (effectively on for `anon`) | enabled `20260717065801:69` | **yes** (P-02) | **0** | Q-A1 |
| paper_accounts | ⏳ | enabled `…065801:30` | **yes** (P-03) | **0** | Q-A1 |
| account_statistics | ⏳ | enabled `…065801` | **yes** (P-04R) | **0** | Q-A1 |
| prop_challenges | ⏳ | enabled `20260727080806:44` | **yes** (P-05) | **0** | Q-A1 |
| prop_challenge_days | ⏳ | enabled `20260727080806` | **yes** (P-06) | **0** | Q-A1 |
| battle_participants | ⏳ | enabled `20260718081017:135` | **yes** (P-07) | **0** | Q-A1 |
| battle_results | ⏳ | enabled `…081017:223` | **yes** (P-08) | **0** | Q-A1 |
| battle_rankings | ⏳ | enabled | **yes** (P-09) | **0** | Q-A1 |
| battles | ⏳ | enabled | **yes** (P-10) | **0** | Q-A1 |
| journal_entries | ⏳ | enabled `20260717072505:72` | **yes** (P-11). The repo grants this deliberately. | **0** | Q-A1, Q-I13 |
| profiles | ⏳ | enabled `20260717060543:39` | **no, 42501** (P-12G) | n/a | Q-A1 |
| historical_candles | ⏳ | enabled `20260720091538:92` | **no, 42501** (P-13G) | n/a | Q-A1 |
| championships | ⏳ | enabled | **yes** (P-14) | **0** | Q-A1 |
| championship_rankings | ⏳ | enabled | **yes** (P-15) | **0** | Q-A1 |
| provider_market_assignments | ⏳ | enabled | **yes** (P-15R) | **0** | Q-A1 |
| historical_import_jobs | ⏳ | enabled | **yes** (P-16G) | blocked by `is_platform_admin` EXECUTE | Q-A1 |

"RLS effectively on for anon" is an inference: `battles` and `paper_trades`
are known to be non-empty (`battle-arena-fixes.md`; BA-11), yet `anon` sees 0
rows. Q-A1 confirms the flag directly.

### 6.2 Authenticated write surface (repo intent, all ⏳ live)

| Table | Repo policies (latest) | Repo grants to `authenticated` | Score fields the user could write under repo intent | Live |
|---|---|---|---|---|
| paper_trades | `own trades` FOR ALL `auth.uid()=user_id` | SELECT, INSERT, UPDATE, DELETE | `pnl`, `exit_price`, `status`, `closed_at`, `opened_at`, `battle_id`, `championship_id` | ⏳ Q-A2/A5/A6 |
| paper_accounts | `own accounts` FOR ALL | SELECT, INSERT, UPDATE, DELETE | `balance`, `equity`, `starting_balance`, `battle_id`, `championship_id` | ⏳ |
| prop_challenges | `prop_challenges_owner_all` FOR ALL TO authenticated | SELECT, INSERT, UPDATE, DELETE | `status`, `result`, `current_equity`, `trading_days_used`, delete | ⏳ |
| battle_participants | `bp read`; `bp insert self` (`user_id=auth.uid()`, no battle checks); `bp update self or host`; `bp delete self or host` | **ALL** (`20260806095941:2`) | `battle_id`, `paper_account_id`, `status` on own row, plus insert into **any** battle | ⏳ |
| battle_results | `bres read` (SELECT only) | SELECT, INSERT, UPDATE, DELETE (no write policy, so RLS blocks) | none under RLS | ⏳ |
| profiles | owner INSERT/UPDATE; SELECT owner + privileged admin | INSERT, UPDATE, DELETE (+ column SELECT) | `elo`, `peak_elo`, `battle_wins`, `battles_played`, `*_battle_streak` (not reset by trigger); `xp`, `coins`, `level`, `league`, `rank`, `streak`, `is_premium` (reset by trigger if it's live) | ⏳ Q-D1…D4 |
| journal_entries | owner FOR ALL; `Public can read shared journal entries` (anon, authenticated) `is_public AND share_token IS NOT NULL` | SELECT, INSERT, UPDATE, DELETE; anon SELECT | n/a (S-2 is a read exposure) | ⏳ |
| historical_candles | `hc_admin_write` FOR ALL (admin); `hc_read_auth`/`hc_read` history, `hc_read` dropped `20260805110114` | SELECT | none | ⏳ |

---

## 7. Function privilege matrix

**Live values: all ⏳ Q-B1** (plus Q-B2 for the full list and Q-B3 for
default ACLs). No RPC was called in this session. An EXECUTE probe would run
the function, which is not read-only.

| Function | Repo: explicit REVOKE | Repo: explicit GRANT | Created after 07-22 sweep? | PUBLIC | anon | authenticated | service_role | Search path (repo) |
|---|---|---|---|---|---|---|---|---|
| commit_settlement(uuid,uuid,numeric) | **none** | authenticated, service_role | **yes** (09-03) | ⏳ | ⏳ | ⏳ | ⏳ | public |
| _join_battle_as(uuid,uuid) | **none** | service_role | **yes** (09-05) | ⏳ | ⏳ | ⏳ | ⏳ | (⏳ Q-C3) |
| join_battle(uuid,boolean) | none | authenticated (`ba1:169`) | yes (new signature in 08-07) | ⏳ | ⏳ | ⏳ | ⏳ | public |
| join_battle(uuid) (legacy overload) | swept 07-22 | authenticated (`20260722114130`) | no | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ exists? Q-B4 |
| finalize_battle(uuid) | PUBLIC, anon (`auth_guard:39`) | service_role, authenticated | no | ⏳ | ⏳ | ⏳ | ⏳ | public |
| tick_battle(uuid) | none | authenticated (`state_machine:123`) | **yes** (08-07) | ⏳ | ⏳ | ⏳ | ⏳ | public |
| tick_battles() | swept 07-22 (if it existed then) | service_role (`ba1:286`) | no | ⏳ | ⏳ | ⏳ | ⏳ | public |
| start_championship(uuid) | swept 07-22 (PUBLIC, anon only) | none | no | ⏳ | ⏳ | ⏳ (S-4) | ⏳ | public |
| finalize_championship(uuid) | swept 07-22 (PUBLIC, anon only) | none | no | ⏳ | ⏳ | ⏳ (S-4) | ⏳ | public |
| tick_championships() | swept 07-22 (PUBLIC, anon only) | none | no | ⏳ | ⏳ | ⏳ (S-4) | ⏳ | public |
| emit_championship_activity(…) | swept 07-22 (PUBLIC, anon only) | none | no | ⏳ | ⏳ | ⏳ (S-4) | ⏳ | public |
| recompute_battle_ranking(uuid,uuid) | PUBLIC, anon, authenticated (`auth_guard:18`) | service_role | no | ⏳ | ⏳ | ⏳ | ⏳ | public |

Under the 07-22 sweep, "swept" removed PUBLIC and `anon` but **not
`authenticated`**. Whether `authenticated` still holds EXECUTE depends on
Supabase's per-function default grant at creation time (⏳ Q-B3).

**What to look for in Q-C3:** security-definer functions where
`takes_user_or_account_param` and `authenticated_exec` are both true. Those
are the caller-supplied-identity pattern behind C-6 and C-7.

---

## 8. Cron inventory

**Live: all ⏳ Q-G1 (inventory, redacted), Q-G2 (same-secret boolean), Q-G3
(statement history), Q-G4 (HTTP outcomes), Q-F1 (championship).**

The table below is the **expected** inventory reconstructed from docs. It is
not live evidence.

| Expected job | Hook | Expected schedule | Doc source (historical, not live) | Live exists / active / secret_len |
|---|---|---|---|---|
| battle-tick | `/api/public/hooks/battle-tick` → `tick_battles()` | every minute | `docs/migrations/battle-tick-schedule.sql`; EC-7 | ⏳ |
| battle-settlement | `/api/public/hooks/battle-settlement` → `finalize_battle` | every minute | `battle-arena-fixes.md`; BA-3 | ⏳ |
| economic-calendar-daily | `/api/public/hooks/economic-calendar` | daily | `economic-calendar-cron.sql`; ec-4/ec-5 verified 2026-08-24 | ⏳ |
| historical-sync | `/api/public/hooks/historical-sync` | every 15 min | `historical-sync/hs-1-schedule.sql` (jobid 23, verified 2026-08-21) | ⏳ |
| email-queue | `/api/public/hooks/email-queue` | frequent | BA-3 resolution | ⏳ |
| email-weekly-report / monthly / reengagement | respective hooks | weekly / monthly | hooks exist in `src/routes/api/public/hooks/` | ⏳ |
| **tick_championships** | none exists | none | **no schedule SQL exists anywhere in the repo or docs** | ⏳ Q-F1 / Q-F2 |

Historical doc evidence (2026-08-19, BA-3): 6 jobs were rewritten with a fresh
64-character `CRON_SECRET`. That is a month old and **not re-verified** here.

### 8.1 Environment presence

App env vars live in the Lovable / Cloudflare runtime and **can't be read from
the database or the anon API.** Nothing here was read directly.

| Variable | Status | Indirect evidence to collect |
|---|---|---|
| SUPABASE_SERVICE_ROLE_KEY | **UNKNOWN** | Q-J1: recent `success` imports with `triggered_by` cron (the cron path uses `supabaseAdmin`) |
| CRON_SECRET | **UNKNOWN** | Q-G1 `x_cron_secret_len` = 64 (DB side only); Q-G4 HTTP 200s and Q-J2 side effects (runtime side) |
| HISTORICAL_SYNC_CRON_SECRET | **UNKNOWN** | Not distinguishable. It's only a fallback in `cron-guard.ts:28`. |
| TWELVE_DATA_API_KEY | **UNKNOWN** | Q-J1: `source_code='twelvedata'` successes in 24 h |
| LOVABLE_API_KEY | **UNKNOWN** | Q-J4 is weak evidence: it shows the rate limiter was reached, not that the gateway call succeeded |
| FINNHUB_API_KEY | **UNKNOWN** | none from the DB |
| MARKET_PROVIDER_KEY_SECRET / provider keys | **UNKNOWN** | Q-H7: provider credential rows (presence only, ciphertext not selected) |
| EMAIL_PROVIDER | **UNKNOWN** | Q-J3 can't tell noop from real (O-1) |

---

## 9. Suspicious-data findings

**No data was read in this session.** Every result is ⏳ AWAITING LIVE
VERIFICATION. Detection queries are ready:

| Signal | Query | What a hit means | Known benign causes to rule out |
|---|---|---|---|
| Impossible P&L: sign or price contradictions | Q-I1 | a direct write, or a client exit-price forgery (C-1/C-2) | swap/commission-dominated tiny moves; BA-9 lots/units on the battle path before 2026-08-10 |
| Impossible P&L: per-symbol magnitude outliers (10× off the symbol median) | Q-I2 | a forged `pnl`, or a BA-8/BA-10 cross-pair error | JPY pairs (BA-8), pre-fix battle size (BA-9) |
| Closed trades with no server close event | Q-I3 | a PostgREST direct insert or update (C-1) | replay battle rows (BA-11 writer inserts closed rows), reported separately; rows older than position_history |
| Duplicate settlement | Q-I4 | the C-3 double close race | none expected |
| Balance vs settlements drift | Q-I5, Q-I5b | a direct balance edit (C-1) or the BA-11 unsettled battle P&L | negative-balance-protection clamp (negative drift only); BA-11 rows (`battle_pnl` column) |
| Trades updated after close | Q-I6 | post-close `pnl` or `battle_id` edits (C-1, N-1) | journal and exit-ladder maintenance touching `updated_at` |
| Event trades outside window or by non-participants | Q-I7 | N-1 / N-2 / N-3 exploitation | clock skew of a few seconds |
| ELO and battle stats without history | Q-I8 | C-5 profile self-edit | pre-`elo_history` accounts (compare against `elo_history` start date) |
| Prop challenges passed without an evaluation trail | Q-I9, Q-I9b | P-1 direct status edit, or P-2 funded-account link | legitimate fast passes with a large first-day profit |
| Battle results vs trades | Q-I10 | a result or ranking not derived from trades | trades closed after finalize (finalize snapshot) |
| Championship rankings vs trades | Q-I11 | the same, for championships | ranking not recomputed since last trade |
| Rewards recorded but unpaid | Q-I12 | B-4 | `source_id` convention differs; check `xp_transactions.source` |
| Journal share exposure size | Q-I13 | the S-2 blast radius | — |

---

## 10. Newly discovered risks (this phase, from source)

These are new since the remediation plan. All are **LIVE?** (the defect is in
repo SQL, so it needs live confirmation) and all are ⏳.

| ID | Risk | Evidence | Settled by | Impact |
|---|---|---|---|---|
| **N-1** | **Competition rule triggers only fire on INSERT.** `trg_enforce_battle_rules` (`20260808150000_…sql:108-110`), `trg_paper_trade_champ_rules` (`20260718092213_…sql:658-659`), `trg_set_trade_battle_id` and `trg_paper_trade_champ_assign` are all `BEFORE INSERT`. The ranking recompute triggers fire on `AFTER INSERT OR UPDATE`. Under C-1, a user can UPDATE an existing closed trade's `battle_id` or `championship_id`. That skips the live-status, time-window, symbol, market **and participant** checks, and the recompute puts the trade on the leaderboard. | source | Q-D2 (trigger events), Q-A5 (`battle_id`/`championship_id` UPDATE), Q-I6, Q-I7 | Critical if C-1 is confirmed |
| **N-2** | **Users can insert themselves into any battle.** Policy `bp insert self` checks only `user_id = auth.uid()` (`20260718081017_…sql:167-168`). With `GRANT ALL … TO authenticated` (`20260806095941:2`), a user can join private, full, completed or not-joinable battles without `join_battle`'s checks. `bp update self or host` also lets a participant change their own `battle_id`/`paper_account_id`. | source | Q-A2, Q-A3, Q-E5 | High. It bypasses capacity, visibility and state checks, and combines with N-1. |
| **N-3** | **The championship window check trusts a client-supplied `opened_at`.** `enforce_championship_rules_on_trade` checks `NEW.opened_at` (`…092213:639`), and `opened_at` is user-writable on direct insert (C-1). A backdated `opened_at` puts a trade inside any window. | source | Q-A5 (`opened_at`), Q-I7 | High if C-1 is confirmed |
| **N-4** | **A legacy `join_battle(uuid)` overload may still be live.** The repo defines both `join_battle(uuid)` (`20260805094542`) and `join_battle(uuid,boolean)` (`20260807102317`, `20260905000001`). `CREATE OR REPLACE` with a different signature adds an overload rather than replacing it. The 07-22 sweep granted `join_battle(uuid)` to `authenticated`, so the old body (without BA-1's participant and account logic) may be callable. | source | Q-B4, Q-C1 (two join_battle rows) | Medium |
| **N-5** | **D-1 (confirmed) implies default privileges are active for tables,** so functions probably get them too. This raises the prior for C-7 and S-4, and for every future `CREATE FUNCTION`. | live P-02…P-15R | Q-B3 | High as a class |
| **N-6** | **`docs/migrations/check-stored-secret.sql` prints the cron secret in plaintext** to the SQL editor output, and from there to screenshots and chat. | `check-stored-secret.sql:1-2` | n/a (source) | Operational. Replace it with a length/boolean check before reuse. Not changed in this phase. |
| **N-7** | **Non-participants can appear on live battle leaderboards.** `enforce_battle_rules_on_trade` doesn't check participation, and `set_trade_battle_id_from_account` copies `paper_accounts.battle_id`, which is user-writable under C-1. `recompute_battle_ranking` upserts rankings for any (battle, user) pair. Finalize only writes results for participants, but the live `battle_rankings` table would show outsiders. | source | Q-A5 (`paper_accounts.battle_id`), Q-I7 | Medium |

---

## 11. Phase 1 go/no-go prerequisites

**Current decision: NO-GO.** Phase 1's steps (revokes, default-privilege
change, S-1 auth) must be written against the live object state. That state
has not been captured.

| # | Prerequisite | Satisfied by | Status |
|---|---|---|---|
| G-1 | The live function privilege map is captured for every public function | Q-B1 + Q-B2 results saved | ⏳ |
| G-2 | Live default ACLs are captured (the object and role for the `ALTER DEFAULT PRIVILEGES` in step 1.3) | Q-B3 | ⏳ |
| G-3 | Overloads are known, so a REVOKE doesn't miss a signature (N-4) | Q-B4 | ⏳ |
| G-4 | Live bodies are captured for every function Phase 1 touches (rollback baseline), and Q-C1 verdicts are recorded | Q-C1 + Q-C2 exported | ⏳ |
| G-5 | Every app `.rpc("…")` call is reconciled against the live map, so step 1.2's allow-list doesn't break a live caller | Grep of `src/` (repo) cross-checked with Q-B2 | ⏳ (the repo half can be done any time) |
| G-6 | The cron inventory is known, so service-role paths revoked in 1.2 are confirmed not to run as `authenticated` | Q-G1, Q-G3, Q-G4 | ⏳ |
| G-7 | Rollback files are generated from G-1/G-2/G-4 output, one GRANT per revoked privilege | derived from results | ⏳ |
| G-8 | A test project exists, or an explicit decision is recorded to run 1.1–1.3 in production with rollback rehearsed on paper (plan D-2) | decision | ⏳ |
| G-9 | C-6 and C-7 are CONFIRMED or REFUTED. If refuted, their Phase 1 steps are dropped. | Q-B1 | ⏳ |
| G-10 | Suspicious-data baseline saved (Q-I*), so Phase 1–2 effects can be measured against it | Q-I1…Q-I13 | ⏳ (doesn't block 1.1–1.3, but blocks 2G) |

**Minimum to flip Phase 1 to GO for steps 1.1–1.3:** G-1, G-2, G-3, G-4, G-5,
G-7, G-9, plus a recorded G-8 decision.

**Steps 1.4–1.5 (app code: S-1 auth, S-7 fail-closed)** have no database
dependency. They're blocked only by the instruction not to start Phase 1.

---

## 12. Evidence and queries for every conclusion

### 12.1 Live probes executed (all anonymous, all read-only)

**Environment:**

- The key was loaded from the tracked `.env` inside the shell and never
  printed. Only `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` were used.
- Host: the project's REST URL from `.env`. Project id is `afhjjcivjkzcmdqzutfh`,
  per `supabase/config.toml`.

**Command shapes.** `<KEY>` means the publishable key, redacted here.

```bash
# P-01 — schema document (refused)
curl -s "$SUPABASE_URL/rest/v1/" -H "apikey: <KEY>" -H "Accept: application/openapi+json"

# P-02..P-16 — HEAD row-count probe, no body returned
curl -s -I "$SUPABASE_URL/rest/v1/<table>?select=id" -H "apikey: <KEY>" -H "Prefer: count=exact" -H "Range: 0-0"

# P-xxR — retry with select=* for tables without an `id` column (HEAD, no body)
curl -s -I "$SUPABASE_URL/rest/v1/<table>?select=*" -H "apikey: <KEY>" -H "Prefer: count=exact"

# P-xxG — error-code capture, zero rows requested
curl -s "$SUPABASE_URL/rest/v1/<table>?select=*&limit=0" -H "apikey: <KEY>"
```

**Raw results (UTC 2026-09-17):**

| Probe | Time | Target | HTTP | Content-Range / body | Used for |
|---|---|---|---|---|---|
| P-01 | 06:21:21 | `/rest/v1/` OpenAPI | 401 | `{"message":"Secret API key required",…}` | Establishes that the anon key can't read the schema |
| P-02 | 06:21:30 | paper_trades HEAD | 200 | `*/0` | D-1, §6.1 |
| P-03 | 06:21:30 | paper_accounts HEAD | 200 | `*/0` | D-1 |
| P-04 | 06:21:30 | account_statistics HEAD `select=id` | 400 | (no `id` column) | superseded by P-04R |
| P-04R | 06:21:54 | account_statistics HEAD `select=*` | 200 | `*/0`; GET limit=0 → `[]` | D-1 |
| P-05 | 06:21:30 | prop_challenges HEAD | 200 | `*/0` | D-1 |
| P-06 | 06:21:30 | prop_challenge_days HEAD | 200 | `*/0` | D-1 |
| P-07 | 06:21:30 | battle_participants HEAD | 200 | `*/0` | D-1 |
| P-08 | 06:21:30 | battle_results HEAD | 200 | `*/0` | D-1 |
| P-09 | 06:21:30 | battle_rankings HEAD | 200 | `*/0` | D-1 |
| P-10 | 06:21:30 | battles HEAD | 200 | `*/0` | D-1 |
| P-11 | 06:21:30 | journal_entries HEAD | 200 | `*/0` | §4 S-2 note |
| P-12 | 06:21:30 | profiles HEAD | 401 | — | superseded by P-12G |
| P-12G | 06:21:54 | profiles GET limit=0 | 401 | `42501 permission denied for table profiles` | D-3 |
| P-13 | 06:21:30 | historical_candles HEAD | 401 | — | superseded by P-13G |
| P-13G | 06:21:54 | historical_candles GET limit=0 | 401 | `42501 permission denied for table historical_candles` | D-4, O-7 |
| P-14 | 06:21:30 | championships HEAD | 200 | `*/0` | D-1 |
| P-15 | 06:21:30 | championship_rankings HEAD | 200 | `*/0` | D-1 |
| P-15a | 06:21:30 | provider_market_assignments HEAD `select=id` | 400 | (no `id` column) | superseded by P-15R |
| P-15R | 06:21:54 | provider_market_assignments HEAD `select=*` | 200 | `*/0`; GET limit=0 → `[]` | D-1 |
| P-16 | 06:21:30 | historical_import_jobs HEAD | 401 | — | superseded by P-16G |
| P-16G | 06:21:54 | historical_import_jobs GET limit=0 | 401 | `42501 permission denied for function is_platform_admin` | D-2, D-5, S-4 (anon) |

**Interpretation rules applied:**

- PostgREST returns `42501` with a "permission denied for **table**" message
  when the role lacks the table privilege. A `200` means the privilege exists.
- A "permission denied for **function**" message during a table read means
  the table privilege passed, and a policy then called a function the role
  can't execute.
- A `200` with `*/0` on a table known to hold rows means RLS filtered every row.

**Not done, deliberately:**

- No `POST /rpc/*` call: invoking a function to test EXECUTE is not read-only.
- No `GET` returning rows: no user data was read.
- No authenticated session.

### 12.2 Repo-side evidence (source, not live)

| Conclusion | Files |
|---|---|
| D-1 repo intent: no `anon` grants | `20260717065801_…sql:28-29,67-68`; `20260727080806_…sql:41-42`; `20260718081017_…sql:133-134,221-222`; `20260806095941_…sql:2-3` |
| D-3 / D-4 repo intent | `20260718070533_…sql:8`; `20260719130616_…sql:3`; `20260722114130_…sql:3,13`; `20260720091538_…sql:90`; `20260805110114_…sql:2-3` |
| §7 revoke and grant history | `20260722114130_…sql:24-49`; `20260903120000_…sql:101-103`; `20260903120001_…sql:18-22,39-43`; `20260905000001_…sql:90,169,286`; `20260807102317_…sql:123` |
| N-1 | `20260808150000_…sql:45-110`; `20260718092213_…sql:361-395,617-659`; `20260718081017_…sql:284-296,405-417` |
| N-2 | `20260718081017_…sql:158-172`; `20260806095941_…sql:2` |
| N-3 | `20260718092213_…sql:617-659` |
| N-4 | `20260805094542_…sql` (`join_battle(uuid)`); `20260807102317_…sql:200`; `20260905000001_…sql:101`; `20260722114130_…sql:44` |
| N-6 | `docs/migrations/check-stored-secret.sql:1-2` |
| N-7 | `20260808150000_…sql:45-106`; `20260718081017_…sql:284-296`; `20260805113333_…sql:11-90` |
| Access constraints | `docs/known-issues.md` JR-3 ("no service-role key or DB password — only a publishable key and an e2e user login"); tool check this session (no `psql`, no `supabase` CLI) |

### 12.3 Repo function fingerprints

The package embeds these in Q-C1. They were computed with this
normalisation, applied to the dollar-quoted body of the **latest** migration
defining each function:

```
md5( btrim( regexp_replace(body, '\s+', ' ', 'g') ) )
```

Q-C1 applies the identical expression to live `pg_proc.prosrc`.

| Function | Repo md5 | Latest defining migration |
|---|---|---|
| _join_battle_as(uuid,uuid) | db7d7f95b4c0fa3f9146e65b7bdefb7d | 20260905000001_ba1_matchmaking_fix |
| commit_settlement(uuid,uuid,numeric) | 77d2b30c055367503aab0206ae2cd79a | 20260903120000_commit_settlement |
| emit_championship_activity(…) | 62ee45b5af7b7b5d6d4be9d8376dfaeb | 20260718092213 |
| enforce_battle_rules_on_trade() | 88315c4e54b21e2fc0cc7e9164074934 | 20260808150000_battle_replay_trades |
| finalize_battle(uuid) | 04f6b9eedc7f76f4644b09e921e89bad | 20260903120001_auth_guard_battle |
| finalize_championship(uuid) | 905c887d70b87ce1bf2dd367fe967da0 | 20260718092213 |
| has_permission(uuid,text) | 946dc8fe97bbf31e136e1a5a744332ab | 20260717105748 |
| is_platform_admin(uuid) | 090a52c0a72324ffd81d30c97466b8a0 | 20260717105748 |
| join_battle(uuid) | b2d0bab23a0d40e7aaadee97cc15c9d9 | 20260805094542 |
| join_battle(uuid,boolean) | b9e0e869bd922ab18d59842949a7c312 | 20260905000001_ba1_matchmaking_fix |
| join_battle_by_code(text) | 18745d342fe89fd9780159d163b5672f | 20260807102317_battle_arena_state_machine |
| join_championship_live(uuid) | 061e179876c8a3ce9f02ab7224bd97a5 | 20260720064256 |
| protect_profile_privileged_columns() | e3beb795e8eb559c413207610560a20f | 20260727104342 |
| recompute_battle_ranking(uuid,uuid) | 524368524cb6204a2767663d5c72f9b1 | 20260805113333 |
| recompute_championship_ranking(uuid,uuid) | 309dd17bc8652a88164c9a8bc80885a4 | 20260718092213 |
| register_for_championship(uuid) | c24082dd449cd9ed4fc3010ac5517551 | 20260718092213 |
| set_trade_championship_id() | 007336c963e0b97eb0a5a142a7c7211c | 20260718092213 |
| start_championship(uuid) | 122afded6f0d54aa8b1694d0209152f3 | 20260718092213 |
| tick_battle(uuid) | 2234ab6e344d6cb49677d4b95bbb10fd | 20260807102317_battle_arena_state_machine |
| tick_battles() | 43eabfc8826f815e030b35e63b663c50 | 20260905000001_ba1_matchmaking_fix |
| tick_championships() | 34fc0abffdd8a1944acde3232e5e9e4e | 20260718092213 |
| trg_recompute_battle_ranking() | f90d66410150bf88acd9849e1647dfdf | 20260718081017 |
| trg_recompute_championship_ranking() | 1ae6ac35795129ab3ed67e6f55fe94c3 | 20260718092213 |

**Caveat:** a `DIFFERS` verdict can also come from a hand-applied edit that
never reached the repo. Treat every `DIFFERS` as "live is authoritative", and
diff Q-C2 output against the repo by hand before Phase 1 writes anything that
touches that function.

### 12.4 Query-to-conclusion index

| Conclusion area | Queries |
|---|---|
| A. RLS, policies, table and column privileges | Q-A1, Q-A2, Q-A3, Q-A4, Q-A5, Q-A6 |
| B. Function EXECUTE (PUBLIC / anon / authenticated / service_role) | Q-B1, Q-B2, Q-B3, Q-B4 |
| C. Security-definer definitions vs repo, ownership, `auth.uid()`, caller IDs, search path | Q-C1, Q-C2, Q-C3 |
| D. Profile integrity | Q-D1, Q-D2, Q-D3, Q-D4, Q-A5 |
| E. Battle integrity | Q-E1…Q-E6, Q-B1, Q-C2 |
| F. Championship lifecycle | Q-F1…Q-F4 |
| G. Cron inventory | Q-G1…Q-G5 |
| H. Historical ingestion | Q-H1…Q-H8 |
| I. Suspicious data | Q-I1…Q-I13 |
| J. Environment (indirect) | Q-J1…Q-J4 |

---

## 13. How to complete Phase 0

1. Run `phase-0-readonly-queries.sql` one query at a time in the Lovable SQL
   editor, in section order. Section 0 first confirms the role.
2. Save each result to
   `docs/migrations/remediation/phase0-results/2026-MM-DD_Q-xx.csv`.
3. Hand the results back. Every ⏳ in §5–§9 is then resolved to CONFIRMED or
   REFUTED against the listed confirm/refute conditions, and §11 is re-scored.
4. If a query errors (for example, `vault.secrets` may be permission-denied or
   `email_queue` may be absent), record the error text as the result. An error
   is evidence too.

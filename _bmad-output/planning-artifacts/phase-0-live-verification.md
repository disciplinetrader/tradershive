---
title: TradersHIVE remediation — Phase 0 live verification report
status: COMPLETE — all 61 Phase 0 queries executed read-only on 2026-09-17
created: 2026-09-17
updated: 2026-09-17
plan: _bmad-output/planning-artifacts/remediation-plan.md
query_package: docs/migrations/remediation/phase0/ (split from phase-0-readonly-queries.sql @ 01c242f2)
evidence: docs/migrations/remediation/phase0-results/ (RUNLOG.md + one file per query)
live_target: Lovable project THIVE ARENA 237f7325-035a-4d38-a67f-36c64e02b573 (Supabase, PostgreSQL 17.6)
---

# Phase 0: Live verification report

## How the evidence was obtained

| Item | Detail |
|---|---|
| **Access** | Lovable MCP `get_database_status` (enabled, supabase), then `query_database` |
| **Role** | `postgres` (owner), per Q-00a. Every catalog is visible, so no result is truncated by permissions. |
| **When** | 2026-09-17, 07:39 to about 07:55 UTC |
| **What ran** | The unmodified text of the 61 files in `docs/migrations/remediation/phase0/`. All `SELECT`/`WITH`. |
| **What did not run** | No write, DDL, GRANT/REVOKE, cron call, `net.http_*` or mutating RPC. No confirmation prompt appeared. Q-D1 was not re-run because it is identical to the `profiles` rows of Q-A2. |
| **Extra reads** | One repo-side grep of `.rpc("…")` call sites for gate G-5, done locally and read-only. No extra SQL was run. |
| **Sanitisation** | No user ID, username, account ID or name, trade ID, battle ID or secret in any saved file. Cron secrets appear as length only. Scan verified. |
| **Earlier supporting evidence** | Before the MCP run, 24 anonymous read-only REST probes were taken at 06:21 UTC (§12.3). They are kept as independent corroboration from the API side. Every conclusion they supported was re-confirmed by the catalog queries above, and none is relied on alone. |

Status vocabulary:

| Status | Meaning |
|---|---|
| **CONFIRMED** | Live catalog or data evidence proves it |
| **REFUTED** | Live evidence contradicts it |
| **STILL UNKNOWN** | Not settled by the evidence obtained |
| **SRC (app)** | Application-code finding with no database component. Classified in the plan and unchanged here. |

---

## 1. Executive summary

- **The repo and the live database agree on logic:**
  - **22 of 23** fingerprinted security-definer bodies **MATCH** the latest repo migration (Q-C1).
  - The 23rd, the legacy `join_battle(uuid)` overload, **no longer exists**.
  - Every trigger in the repo is present and enabled (Q-D2).
  - Policies match the repo (Q-A2).
- **The repo and the live database disagree on privileges.** The live project has Supabase **default ACLs** that grant `anon` and `authenticated` full rights on every new table (`arwdDxtm`) and function (`X`) in `public` (Q-B3). The repo's migrations never account for this. As a result:
  - **`commit_settlement`** and **`_join_battle_as`** are executable by **PUBLIC, anon and authenticated** (Q-B1). Both are **CONFIRMED CRITICAL**.
  - `anon`/`authenticated` hold **INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER and REFERENCES** on every audited table (Q-A3, Q-A4). RLS is the only barrier, and TRUNCATE is not subject to RLS.
- **Score integrity is broken at the database layer, not just in app code:**
  - **C-1 CONFIRMED:** users can write `paper_trades.pnl`, `paper_accounts.balance` and `account_statistics` directly.
  - **C-5 CONFIRMED:** users can set their own `elo`, `battle_wins` and battle streaks. The protection trigger does not cover them.
  - **N-1 and N-3 CONFIRMED:** competition rule triggers fire on INSERT only, and ranking recomputes also fire on UPDATE.
  - **N-10 (new):** a battle host can edit any column of their own battle, including `status`, `end_at` and `winner_user_id`.
  - **N-12 (new):** DENSE_RANK ties give **rank 1, its XP/coins and +25 ELO to every tied participant**, including zero-trade ones. There are 12 such rank-1 rows across the completed battles, 4 of them ranked.
- **Production operations are silently failing:**
  - **Championships:** the July 2026 championship is still `live`, **47 days past its end**. No August, September or October season exists. Nothing schedules `tick_championships`, and the admin button calls it with a role that cannot execute it (N-20).
  - **Historical data:** in the last 7 days the ingestion cron produced **1,344 "successful" jobs that inserted 0 bars**. Every symbol's front edge is frozen at 2026-09-04 to 09-07 (N-13).
  - **Battles:** 26 of 27 battle results have **no XP ledger entry**, so 13,000 XP and 5,200 coins were recorded but never paid (B-4). Median finalize lag was 3 to 47 hours (B-1). 2 battles are stuck in `filling` since August (B-3).
  - **AI Mentor:** the rate limiter is **effectively disabled**. It calls `bump_ai_rate_limit` as `authenticated`, which lacks EXECUTE, and it fails open (S-7 escalated, N-20).
- **Production data is contaminated, but there's no evidence of deliberate forgery:**
  - The BA-5 +$71,087,279.90 balance drift and the BA-11 −$180.10 drift are present.
  - 7 battle trades sit outside their battle window, and 6 closes show zero P&L on a moved price.
  - No duplicate settlements, no ELO anomalies against history, no sign-contradicting P&L, and no passed prop challenges.
- **Phase 1: NO-GO for production.** All evidence gates are satisfied. The G-7 rollback package and G-8 rehearsal plan are now prepared under `docs/migrations/remediation/phase1/`. Production stays blocked until the rehearsal passes. See §11 for the one decision worth taking before Phase 1 opens.

---

## 2. Live-vs-repo differences

| # | Object | Repo | Live | Evidence |
|---|---|---|---|---|
| D-1 | Default ACL, `public` schema, owner `postgres` | Not represented in any migration | functions: `anon=X, authenticated=X, service_role=X`; tables: `anon=arwdDxtm, authenticated=arwdDxtm`; sequences: `anon=rwU, authenticated=rwU`; plus a non-Supabase role `sandbox_exec` with `ar` on tables in public, extensions and auth | Q-B3 |
| D-2 | `commit_settlement(uuid,uuid,numeric)` EXECUTE | GRANT to authenticated, service_role; no REVOKE | **PUBLIC, anon, authenticated, service_role** | Q-B1 raw ACL `{=X/postgres,…,anon=X,…}` |
| D-3 | `_join_battle_as(uuid,uuid)` EXECUTE | GRANT to service_role only | **PUBLIC, anon, authenticated, service_role** | Q-B1 |
| D-4 | `tick_battle(uuid)` EXECUTE | GRANT to authenticated | **PUBLIC, anon**, authenticated | Q-B1 |
| D-5 | `join_battle(uuid,boolean)` EXECUTE | GRANT to authenticated | **PUBLIC, anon**, authenticated (body rejects NULL `auth.uid()`) | Q-B1, Q-C2 |
| D-6 | `journal_sync_tag_arrays_for(uuid)`, `journal_entry_tags_sync_trg()`, `journal_tags_rename_sync_trg()`, `social_follow_counts(uuid)` | hand-applied journal files / `20260916125502` | **PUBLIC, anon**, authenticated | Q-B2 |
| D-7 | Table privileges for `anon` on all 23 audited tables | No `anon` grants except `journal_entries` SELECT | anon holds INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES on all 23, and SELECT on 21 (not `profiles`, `historical_candles`) | Q-A3, Q-A4 |
| D-8 | Table privileges for `authenticated` | Varies per table (e.g. `battle_results` SELECT-only intent in policies) | Full `arwdDxt` on all 23 (SELECT absent only on `profiles` table level) | Q-A3, Q-A4 |
| D-9 | `join_battle(uuid)` legacy overload | defined in `20260805094542` | **absent**. Only `join_battle(uuid,boolean)` exists. | Q-B4, Q-C1 |
| D-10 | Cron job `battle-settlement` | Hook exists (`src/routes/api/public/hooks/battle-settlement.ts`); BA-3 resolution mentions it | **not scheduled**. Only `battle-tick-every-minute` finalizes. | Q-G1 |
| D-11 | Cron secret storage | docs assume `cron.job` command | Stored **inline** in 7 `cron.job.command` strings (64 characters, identical). `vault.secrets` is empty. | Q-G1, Q-G2, Q-G5 |
| D-12 | Extensions | — | `pg_cron 1.6.4`, `pg_net 0.20.4`, `pgcrypto 1.3`, `supabase_vault 0.3.1`. **No** `pg_graphql` or `pgsodium`. | Q-00b |
| D-13 | `provider_credentials` | Admin UI stores provider keys here | **0 rows**. Provider keys come only from runtime env vars. | Q-H7 |

**Everything else matches the repo:**

- All 22 existing fingerprinted function bodies (Q-C1)
- `search_path=public` on every security-definer function (Q-C3: `no_search_path` false everywhere)
- All policies on audited tables (Q-A2)
- RLS enabled on all 23 audited tables, not forced (Q-A1)
- All repo triggers present and enabled (Q-D2)
- `recompute_battle_ranking`, `finalize_championship`, `start_championship`, `tick_championships`, `tick_battles`, `emit_championship_activity` and `bump_ai_rate_limit` are service_role-only, matching `20260722114130` and `20260903120001`

---

## 3. Confirmed findings

### 3.1 Critical

| ID | Finding | Evidence | Why critical |
|---|---|---|---|
| **C-6** | **`commit_settlement` lets any caller rewrite any paper account's balance.** EXECUTE is held by PUBLIC, anon and authenticated. Ownership is `WHERE id=_account_id AND user_id=_user_id`, both caller-supplied, with no `auth.uid()`. Only negative P&L is floored, so a positive `_clamped_pnl` is unbounded. Not called by the app. | Q-B1, Q-C2, Q-C3 (`takes_user_or_account_param` true, `uses_auth_uid` false), repo grep (0 call sites) | Any signed-in user can read `(user_id, paper_account_id)` for every participant of a public battle (`bp read` policy, Q-A2) and inflate or zero their balance. anon can do it with leaked IDs. |
| **C-7** | **`_join_battle_as` lets any caller enrol any user into any battle.** EXECUTE is held by PUBLIC, anon and authenticated. No auth, status, capacity or visibility check. Creates a funded `paper_accounts` row plus a participant row. Root cause is D-1. | Q-B1, Q-B3, Q-C2 | Forced enrolment into completed, private or full battles, and unbounded account creation for any user ID |
| **C-1** | **Users can write score-source tables directly.** `own trades` / `own accounts` / `own account stats` are `FOR ALL` to `{public}` with `auth.uid() = user_id`. `authenticated` has UPDATE/INSERT on `pnl`, `exit_price`, `status`, `closed_at`, `opened_at`, `created_at`, `battle_id`, `championship_id`, `balance`, `equity`, `starting_balance`, and `account_statistics.*`. `trg_paper_trades_battle_ranking` and `trg_paper_trade_champ_recompute` fire AFTER INSERT OR UPDATE. | Q-A2, Q-A5, Q-A6, Q-D2 | A PostgREST INSERT of a closed trade, or an UPDATE of `pnl`, rewrites battle and championship leaderboards |
| **C-5** | **Users can set their own ELO and battle record.** `Users can update their own profile` (UPDATE, `{public}`, `auth.uid() = id`), with `authenticated` UPDATE on `elo, peak_elo, battle_wins, battles_played, current_battle_streak, best_battle_streak`. The protection trigger resets only `xp, coins, level, league, rank, streak, is_premium`. | Q-A2, Q-A5, Q-D3 (`trigger_resets_column` false for all 6 battle columns) | The global ELO leaderboard (`ranking.functions.ts:43`) is directly forgeable |

### 3.2 High

| ID | Finding | Evidence |
|---|---|---|
| **N-1** | **Competition rules can be bypassed via UPDATE.** `trg_enforce_battle_rules`, `trg_paper_trade_champ_rules`, `trg_set_trade_battle_id` and `trg_paper_trade_champ_assign` are **BEFORE INSERT** only. The ranking recomputes are AFTER INSERT OR UPDATE and fire when `status` or `pnl` changes. An existing trade can be re-pointed (`battle_id`/`championship_id` are user-updatable) and its `pnl` nudged, which puts it on a leaderboard without the live-status, window, symbol, market or participant checks. | Q-D2, Q-A5, Q-C2 (`trg_recompute_*` bodies) |
| **N-2** | **Users can insert themselves into any battle.** `bp insert self` is INSERT `WITH CHECK (user_id = auth.uid())` only. `bp update self or host` has **no WITH CHECK**, so a participant can move their row to another `battle_id`. | Q-A2, Q-A6. Q-E5: 3 participant rows joined after their battle's `end_at`. |
| **N-3** | **Championship window uses a client-controlled `opened_at`.** `enforce_championship_rules_on_trade` gates on `NEW.opened_at`, which `authenticated` can INSERT or UPDATE. | Q-A5, Q-D2, repo `20260718092213:639` (body unchanged live per Q-C1 family) |
| **N-7** | **Non-participants can post battle trades.** Live `enforce_battle_rules_on_trade` has no participant check. `paper_accounts.battle_id` is user-updatable and `set_trade_battle_id_from_account` copies it. | Q-C2, Q-A5 |
| **N-10 (new)** | **A host can rewrite their battle.** `battles update host` is UPDATE `USING/CHECK (host_id = auth.uid() OR is_platform_admin)` with full column privileges, so a host can change `status`, `start_at`, `end_at`, `ranked`, `allowed_symbols`, `winner_user_id` or `min_participants` at any time, including mid-battle. Setting `status='completed'` and `winner_user_id=self` bypasses `finalize_battle` entirely. `battles insert host` also lets users create battles with any initial `status`/`ranked`. | Q-A2, Q-A3 |
| **N-12 (new)** | **Ties hand rank 1 to every tied participant.** `recompute_battle_ranking` uses `DENSE_RANK()` over (score, drawdown, breaches, target time). Participants with identical stats, typically zero trades, all get `rank = 1`. `finalize_battle` then gives each of them rank-1 XP/coins and, in ranked battles, **+25 ELO** and a win. `battles.winner_user_id` is an arbitrary `LIMIT 1`. | Q-C2 (bodies); Q-I10: 12 rank-1 result rows ≠ `winner_user_id`, all zero trades and zero P&L, **4 in ranked battles** |
| **P-1** | **Prop challenge state is user-writable.** `prop_challenges_owner_all` / `prop_challenge_days_owner_all` are FOR ALL to authenticated, with UPDATE on `status, result, current_equity, peak_equity, lowest_equity, trading_days_used, breach_reason, completed_at, paper_account_id` and DELETE. | Q-A2, Q-A5, Q-A6. No exploitation seen: Q-I9 0 rows, Q-I9b 6 active, 0 passed. |
| **B-4** | **Battle and championship rewards are never paid.** `finalize_battle` writes `battle_results.xp_awarded/coins_awarded` and never touches `profiles.xp/coins` or the ledgers. `finalize_championship` writes ledgers but never `profiles`. | Q-C2. Q-I12: **26 of 27** battle results with XP have **no** matching `xp_transactions` row (13,000 XP and 5,200 coins recorded, unpaid). |
| **B-5** | **Championship lifecycle has no working driver.** No cron job references it (Q-F1). No function calls it (Q-F2). The admin path calls `tick_championships`/`start_championship`/`finalize_championship` through the user-scoped client (`championship.functions.ts:283-297`), and `authenticated` lacks EXECUTE on all three (Q-B1). | Q-F3: 1 championship `live`, `end_at` 2026-07-31, **47 days overdue**. Q-F4: no 2026-08/09/10 season. |
| **B-1** | **End-of-battle settlement depends on the host or cron.** Live `tick_battle` → `finalize_battle` raises for a non-host `auth.uid()`. | Q-C2. Q-E3: median finalize lag 3.3 to 46.8 h, max 11.7 days (partly the pre-2026-08-19 cron outage). Q-E1: last completion 2026-08-20. |
| **N-13 (new)** | **Historical ingestion has silently stalled.** In 7 days the cron produced 1,344 `success`/`completed` jobs with **0 bars inserted**. 199 of 199 sampled 1m jobs over ~12-day ranges fetched **0 candles** and still reported success. Enabled symbols' front edges are frozen at **2026-09-04 19:59 to 2026-09-07 10:02**. No failed or stale jobs, so no alert. | Q-H1, Q-H4, Q-H6, Q-H2 (0), Q-H3 (0) |
| **S-7 → N-20** | **AI rate limiting is effectively off.** `enforceAiRateLimit` calls `bump_ai_rate_limit` with the **user-scoped** client (`api/ai/chat.ts:151`, `replay-coach.functions.ts:321,471,556`), but `authenticated` lacks EXECUTE on it. Every call errors, and `if (error) continue` fails open. | Q-B1 (`bump_ai_rate_limit`: postgres, service_role only), source. Q-J4: 0 rate-limit windows in 7 days, consistent with never recording. |
| **N-8 (new)** | **anon and authenticated hold TRUNCATE, TRIGGER and REFERENCES on every audited table.** TRUNCATE ignores RLS. It isn't reachable through PostgREST today (and `pg_graphql` is not installed), but any future SQL-executing path running as those roles inherits table-wiping rights. | Q-A3, Q-A4, Q-B3 |
| **S-2** | **Journal shares would be publicly listable.** The policy is live and identical to the repo (`is_public AND share_token IS NOT NULL`, no token comparison, roles anon and authenticated), with anon SELECT. | Q-A2, Q-A3. **Current exposure is zero**: Q-I13 shows 0 public rows and 0 tokens. The vulnerability is latent until the first share. |

### 3.3 Medium and low

| ID | Finding | Evidence |
|---|---|---|
| **B-3** | Battles below `min_participants` never expire: **2 battles stuck in `filling`** since 2026-08-07 / 08-10 | Q-E1, Q-E2, Q-C2 (no expiry branch) |
| **B-2** | `finalizeBattle` server rule and SQL host rule disagree; a host can finalize early. **No exploitation**: 0 battles completed before `end_at`. | Q-C2, Q-E4 (0 rows) |
| **S-5** | Latent `finalize_battle` trusts `auth.uid() IS NULL`. anon cannot call it directly, but **anon can call `tick_battle`**, which reaches it. Impact is limited to the legitimate live→completed transition after `end_at`. | Q-B1, Q-C3 (`null_uid_branch` true only for `finalize_battle`) |
| **S-6** | `protect_profile_privileged_columns` reads the legacy `request.jwt.claim.role`. **Runtime effect is inconclusive**: Q-D4 shows 4 of 15 ledger users with `xp` ≠ latest `balance_after`, 1 with profile XP 0 but ledger > 0. | Q-C3, Q-D4 |
| **N-9 (new)** | Users can INSERT arbitrary `xp_transactions` / `coin_transactions` rows for themselves (`own xp_tx insert`, `own coin_tx insert`). The ledger is forgeable, so ledger-based evidence (Q-I12, Q-D4) is advisory only. | Q-A2 |
| **N-11 (new)** | **Battle rule-violation logging never persists.** `enforce_battle_rules_on_trade` inserts into `battle_logs` and then `RAISE EXCEPTION`s, which rolls back the log row. `battle_logs` is **empty**. Separately, `recompute_battle_ranking` counts breaches from `battle_events`, so the breach tiebreak is effectively always 0. | Q-C2, Q-E6 (0 rows) |
| **N-15 (new)** | Security-definer functions with caller-supplied identity, executable by broad roles: `journal_sync_tag_arrays_for(uuid)` (**anon**) and `record_practice_activity(uuid,text,jsonb)` (authenticated, `uses_auth_uid` false; called by `activity.functions.ts`). Cross-user impact not assessed: bodies not captured. | Q-B2, Q-C3 |
| **N-16 (new)** | anon can drive the battle state machine through `tick_battle` (upcoming→open→ready→countdown→live→completed at legitimate times only) | Q-B1, Q-C2 |
| **N-17 (new)** | The cron secret is stored inline in 7 `cron.job.command` values rather than in Vault, so anyone who can read `cron.job` sees it (also N-6: `check-stored-secret.sql` prints it) | Q-G1, Q-G2, Q-G5 |
| **N-20 (new, beyond S-7)** | **App calls that cannot work with live privileges.** These are called with the user-scoped client, but `authenticated` lacks EXECUTE: `tick_championships`, `start_championship`, `finalize_championship` (admin console), `recompute_battle_live_stats` (`battle-arena-live.functions.ts:126`), `community_recompute_trending` (`community.functions.ts:139,225`, `sharing.functions.ts:158`; errors swallowed, so trending never recomputes), `admin_ai_usage_series` (`admin/console.functions.ts:50,438`). | Q-B1, Q-B2 (none of these appear as authenticated-executable), repo grep |
| **B-7** | BA-11 replay-battle P&L never settles: 5 closed battle trades with no close event, P&L sum **180.10**, matching one account's **−180.10** drift | Q-I3, Q-I5 |
| **O-7** | MIG-1 entry is stale: anon has no SELECT on `historical_candles`, matching the deliberate `20260805110114` revoke | Q-A3, Q-A4 |
| **O-2** | pg_cron "succeeded" is not HTTP success, but in the retained window **all 751 responses were HTTP 200**, none timed out. The monitoring gap remains a source-level finding. | Q-G3, Q-G4 |
| **H-9** | Live crypto provider is `binance`. Historical crypto symbols are `bybit` (8 enabled). The MD-12 split is confirmed. | Q-H5, Q-H6 |

---

## 4. Refuted findings

| ID | Finding | Refuting evidence |
|---|---|---|
| **S-4** | Championship lifecycle functions callable by `authenticated` | `start_championship`, `finalize_championship`, `tick_championships`, `emit_championship_activity`: `authenticated_exec = false`, `public_exec = false` (Q-B1). The sweep's missing `authenticated` revoke did not leave these exposed. (Other functions are exposed; see C-6, C-7, N-15.) |
| **N-4** | Legacy `join_battle(uuid)` overload still live | Q-B4: 1 overload. Q-C1: `join_battle(uuid)` **LIVE MISSING**. |
| **B-9** | Two cron jobs finalize battles (`battle-tick` and `battle-settlement`) | Q-G1: only `battle-tick-every-minute` exists. `battle-settlement` is not scheduled. |
| **H-6** | Killed imports leave jobs `running` indefinitely | Q-H2: **0** jobs in `running/queued/pending/processing` without progress for 30+ minutes |
| **Body drift** | Live security-definer bodies may differ from the repo | Q-C1: all 22 existing fingerprinted bodies match |
| **C-3 (exploitation)** | Double settlement has occurred | Q-I4: **0** trades with more than one `closed` event. The race still exists in source (SRC). |
| **C-5 (exploitation)** | ELO has been self-edited | Q-I8: **0** profiles whose ELO, wins, played count or streak disagree with `elo_history`/`battle_results`. The hole is confirmed, but there's no sign it has been used. |
| **P-1 (exploitation)** | Prop challenges have been manually passed | Q-I9: **0** passed challenges |

---

## 5. Still-unknown findings

| ID | Why still unknown | What would settle it (read-only) |
|---|---|---|
| **S-6 (runtime)** | Q-D4 is mixed (11 of 15 match), and N-9 makes the ledger forgeable | A read of the PostgREST version / `pgrst.db_pre_request` setting; or a controlled test on a non-production project |
| **N-15 impact (record_practice_activity only)** | Body not in the Q-C2 set. `journal_sync_tag_arrays_for` is resolved from the repo: `docs/migrations/tag-consolidation-chunks.sql` chunk 8, applied 2026-08-11. It only recomputes the `emotions`/`mistakes`/`strategy_tags` arrays of one entry from its own `journal_entry_tags`. Live body not fingerprinted. | `pg_get_functiondef('public.record_practice_activity(uuid,text,jsonb)'::regprocedure)`. Not run: outside the verified package. |
| **N-13 root cause** | Symptom confirmed. The cause could be H-1 (page loop), HD-4 empty-window handling, provider or egress, or a Twelve Data plan limit. | `historical_sync_logs` messages for the latest cron run (`docs/migrations/historical-sync/hs-hd4-verify-logs.sql`); hs-4-depth |
| **N-18 (new)** | 6 closed trades with **pnl = 0.00 on a non-zero price move** (5 BTC/USDT, 1 XRP/USDT; 4 inside the July championship, 3 by one user within ~4 s). Could be an NBP clamp at zero balance, BA-9 sizing, or a direct write. | Join to `position_history` payloads and account balance at close time for those trades |
| **N-19 (new)** | 5 battle trades updated more than 1 day after close (Q-I6). Likely the BA-11 replay rows, but not proven. | Compare their IDs with the Q-I3 set |
| **C-8 (contamination source)** | Anomalies exist (§9). None proves deliberate forgery, and all fit known bugs. | Per-row review against `position_history`, under plan Phase 2G |
| **H-7** | Two writers to `historical_candles` (MD-4) was not probed | `docs/migrations/md4-probe/*` |
| **H-8** | Pending `hs-*` verifications were not in the Phase 0 package | `docs/migrations/historical-sync/hs-3`, `hs-4`, `hs-hd3-check`, `hs-hd4-*` |
| **O-1** | Email provider identity (noop vs real). 91 `sent`, last 2026-09-09, 0 stuck. | Runtime env inspection (Lovable secrets panel) |
| **Env: `LOVABLE_API_KEY`, `HISTORICAL_SYNC_CRON_SECRET`, `FINNHUB_API_KEY`, `EMAIL_PROVIDER`** | No database side effect distinguishes them | Lovable secrets panel (names only) |

---

## 6. Current RLS / policy matrix (live)

**RLS is enabled on all 23 audited tables and forced on none** (Q-A1). The live privileges are **identical for every table**: `anon` and `authenticated` hold SELECT, INSERT, UPDATE, DELETE and TRUNCATE. The only exceptions are that `anon` lacks SELECT on `profiles` and `historical_candles`, and `authenticated` lacks table-level SELECT on `profiles` (Q-A3, Q-A4). Policies are therefore the only control.

| Table | Live policies (roles → command: condition) | Can `authenticated` directly modify score-authoritative fields? |
|---|---|---|
| paper_trades | `own trades` {public} ALL: `auth.uid()=user_id` | **YES**: `pnl`, `pnl_pct`, `exit_price`, `entry_price`, `status`, `opened_at`, `closed_at`, `created_at`, `battle_id`, `championship_id`, `lot_size`, `rr_realized` (C-1, N-1, N-3) |
| paper_accounts | `own accounts` {public} ALL: `auth.uid()=user_id` | **YES**: `balance`, `equity`, `starting_balance`, `negative_balance_protection`, `battle_id`, `championship_id` (C-1, N-7) |
| account_statistics | `own account stats` {public} ALL: `auth.uid()=user_id` | **YES**: `net_pnl`, `total_trades`, `win_rate` |
| prop_challenges | `prop_challenges_owner_all` {authenticated} ALL: `auth.uid()=user_id` | **YES**: `status`, `result`, equity fields, `trading_days_used`, `breach_reason`, `completed_at`, `paper_account_id`; DELETE (P-1) |
| prop_challenge_days | `prop_challenge_days_owner_all` {authenticated} ALL | **YES**: `breached`, `start_equity`, `end_equity` |
| battle_participants | `bp read` SELECT (self / host / public battle / admin); `bp insert self` INSERT CHECK `user_id=auth.uid()`; `bp update self or host` UPDATE (**no CHECK**); `bp delete self or host` DELETE | **YES**: insert into any battle; move own row's `battle_id`/`paper_account_id`/`status` (N-2) |
| battle_results | `bres read` SELECT only | **NO**: no write policy. RLS blocks despite full grants. |
| battle_rankings | `br read` SELECT only | **NO**: no write policy. (Indirectly **yes** via paper_trades triggers, C-1/N-1.) |
| battles | `battles read` SELECT; `battles insert host` INSERT CHECK `host_id=auth.uid()`; `battles update host` UPDATE host/admin; `battles delete host` DELETE host in draft/upcoming/cancelled or admin | **YES for hosts**: every column of own battle incl. `status`, `end_at`, `winner_user_id`, `ranked` (N-10) |
| championships | `read championships` SELECT true; `admins manage championships` ALL admin | No (admin only) |
| championship_participants | `read own participation` SELECT; `admins manage participants` ALL admin | No (admin only) |
| championship_rankings | `read rankings` SELECT true | **NO** directly; **yes** indirectly via paper_trades (C-1, N-1, N-3) |
| championship_rewards | `read own rewards` SELECT | No |
| profiles | `Users can insert their own profile` {public} INSERT; `Profiles viewable by owner` / `by privileged admins` SELECT; `Users can update their own profile` {public} UPDATE `auth.uid()=id` | **YES**: `elo`, `peak_elo`, `battle_wins`, `battles_played`, `current_battle_streak`, `best_battle_streak` (C-5). `xp`, `coins`, `level`, `league`, `rank`, `streak`, `is_premium` are reset by trigger unless the legacy role GUC = service_role (S-6). |
| elo_history | `Users can view their own ELO history` SELECT | No |
| xp_transactions / coin_transactions | own INSERT; own SELECT | **YES (ledger)**: arbitrary own rows (N-9) |
| journal_entries | `Owners manage their journal entries` {public} ALL; `Public can read shared journal entries` {anon,authenticated} SELECT `is_public AND share_token IS NOT NULL` | n/a (S-2 read exposure; 0 shared rows today) |
| historical_candles | `hc_admin_write` {public} ALL `is_platform_admin`; `hc_read_auth` {authenticated} SELECT true | No (admin only) |
| historical_import_jobs | `hij_admin_all` {public} ALL admin; `hij_admin_read` SELECT admin | No |
| provider_market_assignments | `admin writes` ALL `is_privileged_admin`; `assignments readable to admins` SELECT `is_platform_admin` | No |
| matchmaking_queue | own ALL | Own queue row only |
| position_history | `own pos history` {public} ALL | **YES**: own events can be forged, which weakens Q-I3/Q-I4 as evidence |

Full policy text: `phase0-results/2026-09-17_Q-A2.csv`.

---

## 7. Function privilege matrix (live)

| Function | Security definer | PUBLIC | anon | authenticated | service_role | Caller identity check | Risk |
|---|---|---|---|---|---|---|---|
| **commit_settlement(uuid,uuid,numeric)** | yes | **X** | **X** | **X** | X | none: `_account_id` + `_user_id` supplied by caller | **CRITICAL** (C-6) |
| **_join_battle_as(uuid,uuid)** | yes | **X** | **X** | **X** | X | none | **CRITICAL** (C-7) |
| **tick_battle(uuid)** | yes | **X** | **X** | X | X | none (time-gated transitions only) | Low (N-16) |
| **join_battle(uuid,boolean)** | yes | **X** | **X** | X | X | `auth.uid()` required | Low for anon (raises) |
| finalize_battle(uuid) | yes | – | – | X | X | host check unless `auth.uid()` IS NULL | Medium (S-5, B-1, B-2) |
| tick_battles() | yes | – | – | – | X | n/a | OK |
| start_championship(uuid) | yes | – | – | – | X | n/a | OK (but N-20: admin UI can't call) |
| finalize_championship(uuid) | yes | – | – | – | X | n/a | OK (N-20) |
| tick_championships() | yes | – | – | – | X | n/a | OK (N-20, B-5) |
| emit_championship_activity(…) | yes | – | – | – | X | n/a | OK |
| recompute_battle_ranking(uuid,uuid) | yes | – | – | – | X | n/a | OK (matches `auth_guard_battle`) |
| recompute_championship_ranking(uuid,uuid) | yes | – | – | – | X | n/a | OK |
| register_for_championship(uuid) | yes | – | – | X | X | `auth.uid()` | OK |
| join_championship_live(uuid) | yes | – | – | X | X | `auth.uid()` | OK |
| cancel_championship_registration(uuid) | yes | – | – | X | X | `auth.uid()` | OK |
| join_battle_by_code(text) | yes | – | – | X | X | delegates to join_battle | OK |
| bump_ai_rate_limit(…) | yes | – | – | **–** | X | caller-supplied `_user_id` | App calls it as authenticated, so it always fails (N-20/S-7) |
| recompute_battle_live_stats(uuid) | yes | – | – | – | X | n/a | App calls it as authenticated (N-20) |
| record_practice_activity(uuid,text,jsonb) | yes | – | – | X | X | **none** (`uses_auth_uid` false) | Medium (N-15) |
| journal_sync_tag_arrays_for(uuid) | yes | **X** | **X** | X | X | none | Low: anon can force a recompute of any entry's tag arrays from that entry's own tags (repo body). No app caller. |
| journal_entry_tags_sync_trg(), journal_tags_rename_sync_trg() | yes | **X** | **X** | X | X | trigger functions (cannot run outside a trigger) | Low |
| social_follow_counts(uuid) | yes | **X** | **X** | X | X | none (read-only counts) | Low |
| has_role, has_permission, is_platform_admin, is_privileged_admin, is_battle_host, is_battle_participant, is_study_group_visible | yes | – | – | X | X | take arbitrary user ID; boolean result | Low (role disclosure) |
| calculate_elo_change(…) | no | X | X | X | X | pure function | None |

Every public security-definer function has `search_path=public` pinned (Q-C3). The full lists are in `Q-B1.csv`, `Q-B2.csv` and `Q-C3.csv`.

---

## 8. Cron inventory (live)

| jobid | Job | Schedule | Active | Hook | Secret | Statement runs (7 d) | Status |
|---|---|---|---|---|---|---|---|
| 18 | battle-tick-every-minute | `* * * * *` | yes | `/api/public/hooks/battle-tick` (30 s timeout) | x-cron-secret, len 64 | 10,080 succeeded | running |
| 16 | economic-calendar-daily | `17 5 * * *` | yes | `/api/public/hooks/economic-calendar` (30 s) | len 64 | 7 succeeded | running; 143 `economic_events` updated in 24 h |
| 2 | email-queue-process | `* * * * *` | yes | `/api/public/hooks/email-queue` | len 64 | 10,080 succeeded | running; queue idle (91 sent, last 2026-09-09) |
| 5 | email-reengagement | `0 * * * *` | yes | `/api/public/hooks/email-reengagement` | len 64 | 168 succeeded | running |
| 3 | email-weekly-report | `0 9 * * 1` | yes | `/api/public/hooks/email-weekly-report` | len 64 | 1 succeeded | running |
| 4 | email-monthly-report | `0 9 1 * *` | yes | `/api/public/hooks/email-monthly-report` | len 64 | 0 in window (monthly) | scheduled |
| 23 | historical-sync-15min | `*/15 * * * *` | yes | `/api/public/hooks/historical-sync` (60 s) | len 64 | 672 succeeded | **running but importing 0 bars (N-13)** |
| — | battle-settlement | — | — | hook exists in code | — | — | **not scheduled** (B-9 refuted) |
| — | championships (`tick_championships`) | — | — | none | — | — | **missing** (B-5) |

- All targets are `https://tradershive.lovable.app`. No `apikey` or bearer headers are used, and no placeholder secrets remain.
- All 7 jobs carry the **same** secret (Q-G2). It is stored inline, not in Vault (Q-G5 empty; N-17).
- **HTTP outcomes** (Q-G4, ~6.5 h pg_net retention): 751 responses, **all 200**, 0 timeouts.

### 8.1 Environment presence (indirect, values never read)

| Variable | Status | Basis |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | **SET** (indirect) | Cron and on-demand import jobs are written through `supabaseAdmin` (Q-H1/Q-J1: 194 jobs in 24 h, 390 bars inserted on-demand 2026-09-16) |
| `CRON_SECRET` | **SET** (indirect) | 751 HTTP 200 hook responses in 6.5 h (Q-G4), and hook side effects in 24 h (Q-J2). The stored DB-side secret is 64 characters (Q-G1). |
| `HISTORICAL_SYNC_CRON_SECRET` | **UNKNOWN** | Only a fallback in `cron-guard.ts`; not distinguishable |
| `TWELVE_DATA_API_KEY` | **SET** (indirect) | On-demand Twelve Data import inserted 390 bars on 2026-09-16 (Q-H1) |
| `LOVABLE_API_KEY` | **UNKNOWN** | No AI rate-limit windows in 7 days (Q-J4), which is uninformative given N-20 |
| `FINNHUB_API_KEY` | **UNKNOWN** | No database side effect |
| Provider keys in DB (`provider_credentials`) | **NOT SET** | 0 rows (Q-H7) |
| `EMAIL_PROVIDER` | **UNKNOWN** | Queue shows `sent` rows, which noop also produces (O-1) |

---

## 9. Suspicious-data findings (live, sanitized)

**Dataset size:** 163 closed trades, 120 non-deleted paper accounts, 35 battles, 1 championship, 6 prop challenges, 15 users with ledgers.

| Signal | Result | Assessment |
|---|---|---|
| Impossible P&L sign / flat-move P&L (Q-I1) | **0** of 163 | Clean |
| P&L magnitude outliers (Q-I2) | **6**, all `pnl = 0.00` on a moved price (5 BTC/USDT, 1 XRP/USDT; **4 in the July championship**, 3 by one user within ~4 s) | STILL UNKNOWN (N-18). A zero-P&L close is not an inflation attack, but it is not a normal outcome either. |
| Closed without server close event (Q-I3) | **5** battle trades, P&L 180.10, also no open event | Matches BA-11 replay writer (B-7). Known cause. |
| Duplicate settlement (Q-I4) | **0** | Clean |
| Balance vs settlements (Q-I5b / Q-I5) | 117 of 120 consistent. **3 drifted:** demo account **+71,087,279.90** (closed P&L −71,093,697.11 over 75 trades; stats disagree by −70,482,279.90); battle account **+239.05**; replay battle account **−180.10** | +71M is the historical **BA-5** row. −180.10 is **BA-11**. +239.05 equals one out-of-window battle trade's loss (Q-I7), so that loss never reached balance. |
| Trades modified after close (Q-I6) | **5** battle trades updated more than 1 day after close | STILL UNKNOWN (N-19) |
| Event trades outside window / non-participant (Q-I7) | **7** battle trades in **one** battle, one participant, created 2026-07-21..23, all outside the window; P&L sum 204.47. 0 non-participant, 0 championship. | Predates the 2026-08-08 rules rewrite. The battle result records 0 P&L / 0 trades (Q-I10), so results and trades disagree. |
| ELO / battle stats vs history (Q-I8) | **0** | Clean. No evidence C-5 has been exploited. |
| Prop challenges passed without trail (Q-I9) | **0** (6 active, 0 passed, last update 2026-09-07) | Clean. The 10-day-stale `updated_at` on active challenges supports P-3 (browser-only evaluation). |
| Battle results vs trades (Q-I10) | **13**: 12 `winner_mismatch` (all zero-trade rank-1 ties, **4 ranked battles**) and 1 `pnl_mismatch` (the Q-I7 battle) | **N-12 confirmed in data.** Multiple rank-1 awards per battle. |
| Championship rankings vs trades (Q-I11) | **0** | Clean |
| Unpaid rewards (Q-I12) | **26 of 27** battle results with XP have no ledger entry (13,000 XP / 5,200 coins) | **B-4 confirmed in data** |
| Ledger vs profile (Q-D4) | 15 users with ledgers: 4 XP mismatches, 4 coin mismatches, 1 XP 0 with ledger > 0 | S-6 inconclusive |
| Journal share exposure (Q-I13) | **0** public / tokenised entries | S-2 latent |

**Overall:** the data shows **defects**, not deliberate forgery. The unpaid rewards, rank ties, BA-5 and BA-11 drift, out-of-window trades and zero-P&L closes are all explained, or explainable, by known bugs. Because the forgeable paths (C-1, C-5, C-6, C-7, N-1, N-9, N-10) leave little trace, and `position_history` and the ledgers are themselves user-writable, **"no evidence of forgery" is not proof of absence.**

---

## 10. Newly discovered risks (this run)

| ID | Severity | Risk | Class |
|---|---|---|---|
| N-8 | High | anon/authenticated hold TRUNCATE, TRIGGER and REFERENCES on every audited table (default ACL) | CONFIRMED |
| N-9 | Medium | XP/coin ledgers are user-insertable | CONFIRMED |
| N-10 | High | A host can rewrite any column of their battle, including status, window and winner, bypassing finalize | CONFIRMED |
| N-11 | Medium | Battle rule-violation logs roll back with the rejected insert, so `battle_logs` is always empty and the breach tiebreak is always 0 | CONFIRMED |
| N-12 | High | DENSE_RANK ties give rank-1 rewards and +25 ELO to every tied participant, including zero-trade ones | CONFIRMED (12 rows, 4 ranked battles) |
| N-13 | High | Historical ingestion reports success while inserting nothing; front edges frozen since 2026-09-04..07 | CONFIRMED (cause STILL UNKNOWN) |
| N-15 | Medium | Security-definer functions with caller-supplied identity exposed to anon/authenticated (`journal_sync_tag_arrays_for`, `record_practice_activity`) | CONFIRMED privilege, impact STILL UNKNOWN |
| N-16 | Low | anon can drive `tick_battle` | CONFIRMED |
| N-17 | Medium | Cron secret stored inline in `cron.job` (not Vault), identical across 7 jobs | CONFIRMED |
| N-18 | Medium | Zero-P&L closes on moved prices, including championship trades | STILL UNKNOWN |
| N-19 | Low | Battle trades updated more than 1 day after close | STILL UNKNOWN |
| N-20 | High | App calls service_role-only functions with the user client: AI rate limiter off, admin championship controls dead, live battle stats and trending never recompute, admin AI usage chart fails | CONFIRMED |
| D-1 root cause | High | Supabase default ACLs grant anon/authenticated on every new function and table; the repo's REVOKE discipline never covered this | CONFIRMED |
| `sandbox_exec` role | STILL UNKNOWN | A non-Supabase role holds default `SELECT/INSERT` on new tables in `public`, `auth` and `extensions` (Q-B3). Presumably Lovable tooling. | CONFIRMED presence, purpose unknown |

Earlier N-findings: **N-1, N-2, N-3, N-7 CONFIRMED**. **N-4 REFUTED**. **N-5 CONFIRMED** (now D-1). **N-6 SRC** (unchanged).

---

## 11. Phase 1 go/no-go

### 11.1 Gate status

| Gate | Requirement | Status | Evidence |
|---|---|---|---|
| G-1 | Live function privilege map | ✅ | Q-B1, Q-B2 |
| G-2 | Live default ACLs | ✅ | Q-B3 (owner role `postgres` for public functions/tables; also `supabase_admin`) |
| G-3 | Overloads known | ✅ | Q-B4 (one signature each) |
| G-4 | Live bodies captured, verdicts recorded | ✅ | Q-C1 (22 MATCH, 1 LIVE MISSING), Q-C2 manifest |
| G-5 | App `.rpc()` calls reconciled with live map | ✅ (analysis) / ⚠ plan change needed | Repo grep in §3.3 N-20: step 1.2's allow-list must **not** assume these functions work today |
| G-6 | Cron inventory | ✅ | Q-G1, Q-G3, Q-G4 |
| G-7 | Rollback files generated from captured state | ✅ prepared | `docs/migrations/remediation/phase1/rollback.sql` (not executed) |
| G-8 | Rehearsal plan recorded | ✅ prepared | `docs/migrations/remediation/phase1/REHEARSAL.md`. Choosing and provisioning the environment is still an owner action. |
| G-9 | C-6 / C-7 confirmed or refuted | ✅ | Both CONFIRMED |
| G-10 | Suspicious-data baseline | ✅ | Section I results saved |

### 11.2 Decision: NO-GO

Every **evidence** gate is satisfied. Phase 1 is **NO-GO for production** until:

1. **G-7 (prepared):** `docs/migrations/remediation/phase1/rollback.sql` holds one GRANT per REVOKE in `containment.sql`, generated from `Q-B1.csv`/`Q-B2.csv`, including PUBLIC `=X/postgres`. It must still be exercised in rehearsal.
2. **G-8 (prepared):** `docs/migrations/remediation/phase1/REHEARSAL.md`. The rehearsal environment has not yet been provisioned, and the rehearsal has not been run.
3. **The Phase 1 step 1.2 allow-list is revised with these live facts:**
   - `tick_battle`: keep **authenticated** (called by `battle-arena.functions.ts`); revoke PUBLIC/anon.
   - `join_battle`: keep authenticated; revoke PUBLIC/anon.
   - `social_follow_counts`: keep authenticated; revoke PUBLIC/anon.
   - `record_practice_activity`: keep authenticated for now (called by `activity.functions.ts`), but flag for an identity fix (N-15).
   - `journal_sync_tag_arrays_for`, `journal_*_trg`: revoke PUBLIC/anon/authenticated after confirming no app call (repo grep shows none). Triggers do not need caller EXECUTE.
   - `commit_settlement`, `_join_battle_as`: revoke PUBLIC/anon/authenticated (0 app call sites).
   - **Do not** grant `authenticated` on `bump_ai_rate_limit`, `tick_championships`, `start_championship`, `finalize_championship`, `recompute_battle_live_stats` or `community_recompute_trending` to "fix" N-20. Those callers must move to service-role server paths, which is Phase 2/3 work.
   - **Step 1.3 (`ALTER DEFAULT PRIVILEGES`)** must target **both** `FOR ROLE postgres` and `FOR ROLE supabase_admin` in schema `public`, for functions **and tables**. The table default grants `anon arwdDxtm` (N-8). Revoking table defaults changes future migrations' behaviour, so it needs its own test.
4. **Owner decision recommended before Phase 1 opens:** C-6 and C-7 are anon-callable today, and neither function has an app caller. The plan's Phase 1.1–1.2 revoke of exactly these two is the lowest-risk, highest-value change available. If you want it sooner than the full Phase 1 gate, it needs an explicit, separate approval. **Nothing has been changed.**

---

## 12. Evidence and queries for every conclusion

### 12.1 Query → file → conclusion index

| Query | File | Conclusions |
|---|---|---|
| Q-00a | `phase0-results/2026-09-17_Q-00a.csv` | Role `postgres`, PG 17.6, full visibility |
| Q-00b | `…_Q-00b.csv` | D-12 |
| Q-A1 | `…_Q-A1.csv` | RLS enabled on all 23, forced on none |
| Q-A2 | `…_Q-A2.csv` | C-1, C-5, P-1, S-2, N-2, N-9, N-10, §6 |
| Q-A3 | `…_Q-A3.csv` | D-7, D-8, N-8, O-7 |
| Q-A4 | `…_Q-A4.csv` | D-7, D-8, N-8 |
| Q-A5 | `…_Q-A5.csv` | C-1, C-5, N-1, N-3, N-7, P-1 |
| Q-A6 | `…_Q-A6.csv` | C-1, P-1, N-2, battle_results / rankings write-blocked |
| Q-B1 | `…_Q-B1.csv` | C-6, C-7, S-4 refuted, S-5, D-2..D-5, N-16, N-20, §7 |
| Q-B2 | `…_Q-B2.csv` | D-6, N-15, §7 |
| Q-B3 | `…_Q-B3.csv` | D-1, N-5, N-8, §11.2 step 1.3 |
| Q-B4 | `…_Q-B4.csv` | N-4 refuted, D-9 |
| Q-C1 | `…_Q-C1.csv` | 22 MATCH / 1 LIVE MISSING, D-9 |
| Q-C2 | `…_Q-C2.md` | C-6, C-7, B-1, B-2, B-3, B-4, N-7, N-11, N-12 |
| Q-C3 | `…_Q-C3.csv` | S-5, S-6, N-15, search_path pinned |
| Q-D1 | `…_Q-D1.csv` (pointer to Q-A2) | C-5 |
| Q-D2 | `…_Q-D2.csv` | N-1, N-3, C-1 trigger path |
| Q-D3 | `…_Q-D3.csv` | C-5 |
| Q-D4 | `…_Q-D4.csv` | S-6 inconclusive |
| Q-E1 | `…_Q-E1.csv` | B-3, battle census |
| Q-E2 | `…_Q-E2.csv` | B-3 (2 stuck) |
| Q-E3 | `…_Q-E3.csv` | B-1 |
| Q-E4 | `…_Q-E4.csv` | B-2 not exploited |
| Q-E5 | `…_Q-E5.csv` | N-2 lead (3 post-end joins) |
| Q-E6 | `…_Q-E6.csv` | N-11 |
| Q-F1 | `…_Q-F1.csv` | B-5 |
| Q-F2 | `…_Q-F2.csv` | B-5 |
| Q-F3 | `…_Q-F3.csv` | B-5 (47 days overdue) |
| Q-F4 | `…_Q-F4.csv` | B-5 (no Aug–Oct seasons) |
| Q-G1 | `…_Q-G1.csv` | §8, B-9 refuted, D-10, D-11 |
| Q-G2 | `…_Q-G2.csv` | D-11, N-17 |
| Q-G3 | `…_Q-G3.csv` | §8, O-2 |
| Q-G4 | `…_Q-G4.csv` | §8, O-2, `CRON_SECRET` SET |
| Q-G5 | `…_Q-G5.csv` | D-11, N-17 |
| Q-H1 | `…_Q-H1.csv` | N-13, env SET inferences |
| Q-H2 | `…_Q-H2.csv` | H-6 refuted |
| Q-H3 | `…_Q-H3.csv` | N-13 (no failures recorded) |
| Q-H4 | `…_Q-H4.csv` (aggregated) | N-13 (199/199 zero-fetch successes) |
| Q-H5 | `…_Q-H5.csv` | H-9 |
| Q-H6 | `…_Q-H6.csv` | N-13 (frozen front edges), H-9 |
| Q-H7 | `…_Q-H7.csv` | D-13 |
| Q-H8 | `…_Q-H8.csv` | Candle store ≈ 2.19M rows |
| Q-J1..J4 | `…_Q-J1..J4.csv` | §8.1 |
| Q-I1..I13 | `…_Q-I*.csv` (sanitized where noted) | §9 |

### 12.2 Repo-side evidence used

| Conclusion | Source |
|---|---|
| C-6 has no app caller; `tick_battle`, `join_battle`, `social_follow_counts`, `record_practice_activity` do | `grep -rE 'rpc\(\s*["'"'"']name' src scripts e2e` |
| N-20 callers use the user-scoped client | `src/routes/api/ai/chat.ts:124,151`; `src/lib/replay-coach.functions.ts:321,471,556`; `src/lib/championship.functions.ts:283-297`; `src/lib/battle-arena-live.functions.ts:126`; `src/lib/community.functions.ts:139,225`; `src/lib/sharing.functions.ts:158`; `src/lib/admin/console.functions.ts:50,435-438` |
| Repo intent for comparison | Migrations cited per row in §2 |
| Function fingerprints | Repo md5 values embedded in Q-C1 (normalisation `md5(btrim(regexp_replace(body,'\s+',' ','g')))`) |

### 12.3 Earlier supporting evidence: anonymous REST probes (2026-09-17 06:21 UTC)

**Context:** these ran before the MCP run, using the tracked publishable (anon) key. They were `HEAD` count requests or `GET … limit=0`, so no row bodies were returned. No RPC was called. They corroborate the catalog findings from the API side.

| Probe | Target | Result | Corroborates |
|---|---|---|---|
| P-01 | `/rest/v1/` OpenAPI | 401 "Secret API key required" | n/a |
| P-02…P-11, P-14, P-15, P-04R, P-15R | paper_trades, paper_accounts, account_statistics, prop_challenges, prop_challenge_days, battle_participants, battle_results, battle_rankings, battles, journal_entries, championships, championship_rankings, provider_market_assignments | HTTP 200, `Content-Range */0` | Q-A3 (anon SELECT held), Q-A1/Q-A2 (RLS returns 0 rows to anon) |
| P-12G | profiles `limit=0` | 42501 permission denied for table profiles | Q-A3 (anon has no SELECT on profiles) |
| P-13G | historical_candles `limit=0` | 42501 permission denied for table historical_candles | Q-A3, O-7 |
| P-16G | historical_import_jobs `limit=0` | 42501 permission denied for function `is_platform_admin` | Q-A3 (anon table SELECT held) and Q-B2 (`is_platform_admin` not anon-executable) |

The exact probe commands (with the key redacted) are recorded in commit `01c242f2`, in the earlier version of this file.

Probe commands and raw results are retained in git history at `01c242f2`.

---
title: TradersHIVE production remediation plan
status: draft — for review, nothing implemented
created: 2026-09-17
inputs:
  - static audit (session b95c72aa, 2026-09-17), 25 findings
  - docs/known-issues.md, docs/migrations/README.md, docs/battle-arena-fixes.md, ARCHITECTURE.md
  - source re-check on branch claude-tradershive-audit @ 24edd5ef (this document)
---

# TradersHIVE production remediation plan

No code, migrations or database state were changed to produce this plan.

## 0. Ground rules

### 0.1 The repository is not the database

`supabase/migrations/` records **intended** state. Migrations were hand-pasted
into the Lovable SQL editor, which truncates long pastes and still reports
success (`docs/migrations/README.md`). MIG-1 shows at least one statement
inside an applied file that never landed. Therefore:

- No database fix is written against the repo's version of an object. It is
  written against the **live definition captured in Phase 0**.
- Rollback restores the **captured live state**, not the previous migration file.

### 0.2 Evidence classes

Every database-related finding carries one class:

| Class | Meaning | What it permits |
|---|---|---|
| **SRC** — proven from source code | The defect is in application code, or the repo alone proves it. Live DB state cannot make it untrue, though it might add a defence. | Design the fix now. |
| **LIVE?** — needs live database verification | The repo's SQL shows the defect, but the live object might differ (never applied, applied partly, changed by hand). | Design the fix now; don't write the SQL until Phase 0 captures the live object. |
| **LIVE-ONLY** — confirmed only after live verification | Whether it's true depends on state the repo can't show: default privileges, `cron.job` rows, secrets, PostgREST behaviour, existing data. | It's only a hypothesis until checked. Don't report it as a defect or schedule a fix until it's confirmed. |

Findings with no database component are marked **SRC (app)**.

A finding moves to **CONFIRMED** only when the Phase 0 query output is saved
in `docs/migrations/remediation/phase0-results/` with a date.

### 0.3 Operating constraints that shape every phase

1. **One Supabase project, no staging.** `e2e/README.md` and
   `playwright.config.ts:22,38` show that tests create real battles and trades
   in production.
2. **No service-role key or DB password is available to tooling**
   (`known-issues.md` JR-3). Live catalog reads must go through the Lovable
   SQL editor, one statement at a time.
3. **The branch syncs to Lovable.** Never force-push or rewrite pushed history
   (`AGENTS.md`). Roll back by reverting commits.
4. **pg_cron "succeeded" means nothing.** It only confirms the queued
   `net.http_post`, not the HTTP result (BA-3 resolution).

---

## 1. Finding register

The IDs below are used throughout the plan. A **(NEW)** tag marks a finding
from this plan's source re-check that the audit did not report.

### P1 — Competition and score integrity

| ID | Finding | Evidence | Class |
|---|---|---|---|
| **C-1** | Users can write score-source tables directly through PostgREST. `paper_trades` and `paper_accounts` have `FOR ALL` owner policies plus INSERT/UPDATE/DELETE grants to `authenticated`. `account_statistics` has the same. A user can insert a closed trade with any `pnl`, or update `pnl` on an existing one. The championship and battle ranking triggers then fire on INSERT OR UPDATE (`20260718092213_…sql:384-395`, `20260718081017_…sql:405-417`). The battle rules trigger only guards INSERT (`20260808150000_…sql:108`). | `20260717065801_…sql:25-31, 63-71, 202`; no later migration in the repo alters these policies | **LIVE?** |
| **C-2** | Prices come from the client. `openTrade` accepts `entry_price` (`paper-trading.functions.ts:222`). `closeTrade` and `partialCloseTrade` accept `exit_price` (`:361`, `:666`) and compute P&L from it with no server price check. | source | **SRC (app)** |
| **C-3** | Double and lost settlement. `closeTrade` checks `status !== "open"` on a read (`:370`), but its UPDATE (`:397-404`) has no `status='open'` guard, so two concurrent closes both settle. `commitSettlement` (`:50-78`) computes the new balance from a snapshot read earlier and writes it back without a lock, so concurrent settlements on one account lose updates. | source | **SRC (app)** |
| **C-4** | **(NEW)** A replay battle trade's P&L comes from the client. `recordBattleReplayTrade` accepts `pnl: z.number()` ("Engine-derived. Written through, never recomputed", `battle-replay.functions.ts:36-37`) and inserts it as a closed trade in the battle (`:114`). The endpoint lets anyone forge a battle score, even with C-1 closed. | source | **SRC (app)** |
| **C-5** | **(NEW)** Users can set their own ELO. The global ELO leaderboard orders by `profiles.elo` (`battle-arena/ranking.functions.ts:43`). `protect_profile_privileged_columns` only protects `is_premium, coins, xp, level, league, rank, streak` (`20260727104342_…sql:14-35`), not `elo`, `peak_elo`, `battle_wins`, `battles_played` or `*_battle_streak`. `profiles` has an owner UPDATE policy (`20260717060543_…sql:47-48`) and an UPDATE grant (`20260722114130_…sql:13`). | source + live trigger/policy | **LIVE?** |
| **C-6** | `commit_settlement` can move any account's balance. It's granted to `authenticated`, and its ownership check compares against a caller-supplied `_user_id` (`20260903120000_…sql:57-60, 101-103`). It's never revoked from `PUBLIC`, so `anon` may be able to call it too. The app doesn't call it (the TS `commitSettlement` does direct UPDATEs), so revoking it breaks nothing. | source; applied? grants? | **LIVE?** |
| **C-7** | **(NEW)** Helper functions created after the 2026-07-22 revoke sweep are never revoked from `PUBLIC`. The sweep (`20260722114130_…sql:24-35`) only touched SECURITY DEFINER functions that existed then. `_join_battle_as(battle, user)` (`20260905000001_…sql:59,90`) was created later and only granted to `service_role`. Postgres gives new functions EXECUTE to PUBLIC by default, and Supabase adds default privileges for `anon`/`authenticated`. If those apply, any caller can add any user to any battle, bypassing capacity, visibility and status checks (its own header says it checks none of them). | depends on live default privileges | **LIVE-ONLY** |
| **C-8** | Existing leaderboards, ELO, battle results and prop results may already contain forged or drifted data. BA-5 is a −$71M realized P&L; BA-11 is −$180.10 of drift. | data | **LIVE-ONLY** |

### P2 — Authentication, authorization and RLS

| ID | Finding | Evidence | Class |
|---|---|---|---|
| **S-1** | These server functions have no auth middleware and no real validation: `twelveDataCandles` (reads and writes `historical_candles` as service role and spends provider credits), `twelveDataQuote`, `twelveDataStatus`, `twelveDataUsage` (`market-data/twelvedata.functions.ts:179,188,217,314`). `listMarketAssignments` reads with `supabaseAdmin` and no auth (`market-data/admin.functions.ts:132`), bypassing the admins-only policy from `20260916125502`. | source | **SRC (app)** |
| **S-2** | All shared journal entries are publicly listable. The policy is `is_public AND share_token IS NOT NULL` and never compares the token. `anon` has table SELECT. Only the client filters by token (`journal/api.ts:463-472`). | `20260717072505_…sql:70-76` | **LIVE?** |
| **S-3** | Any authenticated user can trigger inline provider imports over an unbounded range through `ensureHistoricalRange` / `getReplayCandles` → `runImport` (`service.server.ts:321-336`). This spends the budget cron depends on and hits the egress/colo 403 path the admin UI was moved away from. | source | **SRC (app)** |
| **S-4** | The SECURITY DEFINER sweep revoked `PUBLIC, anon` but never `authenticated`. Championship lifecycle functions (`start_championship`, `finalize_championship`, `tick_championships`, `emit_championship_activity`, …) may be callable by any user. | `20260722114130_…sql:24-35` | **LIVE-ONLY** |
| **S-5** | `finalize_battle` treats `auth.uid() IS NULL` as the trusted service role (`20260903120001_…sql:67`). That's only safe while `anon` lacks EXECUTE, so safety depends on grants, not on the function itself. | source + live grant | **LIVE?** |
| **S-6** | `protect_profile_privileged_columns` reads the legacy GUC `request.jwt.claim.role`. Newer PostgREST sets only `request.jwt.claims`. If that's the case live, even service-role writes get reverted, and the bypass logic is untested. | live PostgREST behaviour | **LIVE-ONLY** |
| **S-7** | The AI rate limiter fails open: `if (error) continue;` (`ai/rate-limit.server.ts:82`). | source | **SRC (app)** |
| **S-8** | Nobody has swept every `supabaseAdmin` use reachable from a server function or route for a matching auth or permission check. S-1 shows the pattern exists. | source sweep needed | **SRC (app)** |
| **S-9** | `.env` is tracked by git. It contains only `*_SUPABASE_{URL,PROJECT_ID,PUBLISHABLE_KEY}`, which are public by design. It's low risk, but nothing stops a secret being added later. | `git ls-files` | **SRC (app)** |

### P3 — Battle and championship settlement

| ID | Finding | Evidence | Class |
|---|---|---|---|
| **B-1** | **(NEW)** A non-host viewer's tick can't finalize a battle. `tickBattle` calls `tick_battle` with the user's client (`battle-arena.functions.ts:509-517`, granted to `authenticated`). Once `end_at` passes, `tick_battle` calls `finalize_battle` (`20260807102317_…sql:113-116`). `auth.uid()` is still the viewer, so the host check raises and the whole tick errors. End-of-battle settlement therefore relies on the host's own page or on cron, and cron was dead for 12 days (BA-3). | source + live bodies | **LIVE?** |
| **B-2** | The server function allows non-hosts to finalize after `end_at` (`battle-arena.functions.ts:527-533`), but the SQL rejects every non-host. A host can also finalize a live battle early, including while leading. | source + live body | **LIVE?** |
| **B-3** | A battle that never reaches `min_participants` has no cancel or expire branch in `tick_battle` and stays `open`/`filling` forever. | `20260807102317_…sql:80-92` | **LIVE?** |
| **B-4** | Rewards are recorded but never paid. `finalize_battle` writes `xp_awarded`/`coins_awarded` into `battle_results` but never updates `profiles.xp`/`coins`, and `finalize_championship` has the same gap. Separately, `awardXpCoins` / `claimDailyLogin` write privileged columns with the **user's** client, so the protect trigger reverts them while `xp_transactions` still records the grant. | `gamification.functions.ts:233-247,300`; trigger | **LIVE?** (payout gap) / **LIVE-ONLY** (revert, depends on S-6) |
| **B-5** | Nothing in the repo schedules `tick_championships`. Its only caller is an admin button (`championship.functions.ts:297`). | cron.job | **LIVE-ONLY** |
| **B-6** | Settlement isn't atomic. The TS `commitSettlement` makes three separate network writes. The `commit_settlement` RPC exists but isn't wired in, and its draft spec's grant model is wrong (C-6). | source | **SRC (app)** |
| **B-7** | BA-11: replay battle P&L never reaches `balance` or `account_statistics`, and isn't clamped for negative-balance protection. | source; live-confirmed 2026-08-12 per known-issues | **SRC** (already live-confirmed) |
| **B-8** | P&L correctness in scoring. BA-8a: `openTrade` doesn't capture a per-trade fx_rate. BA-8b: `registerInstrumentPartial` bypasses the pip-value check. BA-9: size is validated as lots but consumed as units (fixed only on the battle path). BA-10: there are two P&L formulas that diverge on cross pairs. | known-issues | **SRC (app)** |
| **B-9** | Both `battle-tick` and `battle-settlement` crons can finalize. That's safe because `FOR UPDATE` plus the status check make it idempotent, but nobody has confirmed which jobs actually exist live. | cron.job | **LIVE-ONLY** |
| **B-10** | BA-6: chart-placed and replay-engine trades don't count toward battles. This is a product gap, not an integrity bug. | known-issues | **SRC (app)**, deferred |

### P4 — Prop challenge integrity

| ID | Finding | Evidence | Class |
|---|---|---|---|
| **P-1** | `prop_challenges` has an owner `FOR ALL` policy, so a user can set `status='passed'`, rewrite equity fields, or DELETE the row. `prop_challenge_days` has the same shape. | `20260727080806_…sql:41-49` | **LIVE?** |
| **P-2** | A caller-supplied `paper_account_id` is accepted without checking its balance, starting balance, currency, or whether it's already in use (`prop-challenges.functions.ts:98-119`). Linking a funded existing account can pass on the first tick. | source | **SRC (app)** |
| **P-3** | Challenges are only evaluated when the browser calls `tickPropChallenge`. No server job exists, so intraday lows are never observed and a breach during a gap goes unseen. | source | **SRC (app)** |
| **P-4** | Evaluation reads `paper_accounts.equity`, but settlement sets `equity = balance` (`paper-trading.functions.ts:65`; RPC also). Floating losses are invisible, so drawdown and daily-loss breaches on open positions are missed. | source | **SRC (app)** |
| **P-5** | The day boundary is the UTC date (`:222`). Start-of-day equity comes from the last *ticked* day, so an unticked day shifts the baseline. | source | **SRC (app)** |
| **P-6** | `deletePropChallenge` deletes a failed or breached challenge outright, destroying the evidence. `abandonPropChallenge` has no terminal-state guard. | source | **SRC (app)** |
| **P-7** | The replay prop-challenge variant (`lib/replay/prop-challenge.ts`) is evaluated client-side. Its results must not be presented as verified. | source | **SRC (app)** |

### P5 — Historical data reliability

| ID | Finding | Evidence | Class |
|---|---|---|---|
| **H-1** | The Twelve Data page loop breaks as soon as a page returns fewer than 5,000 rows (`providers.server.ts:629`), even when the range isn't finished. Long imports stop early and report success. | source | **SRC (app)** |
| **H-2** | No provider `fetch` has a timeout (`providers.server.ts:81,120,254,358,398,555,642`). | source | **SRC (app)** |
| **H-3** | The Twelve Data credit limiter lives in per-isolate module memory (`twelvedata.functions.ts:57-120`), and the pipeline never consults it. | source | **SRC (app)** |
| **H-4** | The final `completed` job update ignores its error (`pipeline.server.ts:1025-1033`, a PAT-1 instance), so the stale sweep later marks a successful job failed. | source | **SRC (app)** |
| **H-5** | `detectGaps` doesn't know about market sessions, so weekends and closes raise false "large gap" alerts (see also MS-1). | source | **SRC (app)** |
| **H-6** | HD-6: a killed request leaves its job `running`. A staleness verdict now exists (`pipeline.server.ts:266-311`), but known-issues still lists HD-6 as "designed, not built". Whether the reaper actually runs live is unknown. | source + live jobs | **LIVE-ONLY** |
| **H-7** | MD-4: two writers fill `historical_candles`, and one of them is the unauthenticated `twelveDataCandles` (S-1). Don't purge anything before answering MD-4's open question. | live data | **LIVE-ONLY** |
| **H-8** | Live verification is still pending (⏳) for `hs-3`, `hs-4`, `hs-hd3-check/repair`, `hs-hd4-*` and `hs-fix-add-etfs`. | docs/migrations/README.md | **LIVE-ONLY** |
| **H-9** | MD-11: on-demand import degrades to "no data" when the service-role key is missing. MD-12: live crypto comes from Binance (0 of 8 symbols usable from the deployment) while history comes from Bybit. | known-issues | **LIVE-ONLY** (prod secrets and egress) |

### P6 — Production operations

| ID | Finding | Class |
|---|---|---|
| **O-1** | The email `noop` provider marks jobs `sent` (`email/service.server.ts:350-352`, contradicting `providers/noop.ts:4-6`), and nothing reaps jobs stuck in `processing`. Which provider production uses is unknown. | **SRC (app)** / **LIVE-ONLY** for `EMAIL_PROVIDER` |
| **O-2** | Cron schedules exist only as hand-applied SQL. No inventory of `cron.job` exists, and no HTTP-outcome monitoring (EC-5). | **LIVE-ONLY** |
| **O-3** | There's no production secrets inventory (service role, cron secrets, Twelve Data, Lovable AI, Finnhub, email, feature flags). | **LIVE-ONLY** |
| **O-4** | AI Mentor tools use `parameters:` under `ai@^7`, which expects `inputSchema`. The `as any` cast at `api/ai/chat.ts:171` hides the type error, and with no `stopWhen`, tool results never produce an answer. | **SRC (app)** |
| **O-5** | `bun.lock` and `package-lock.json` pin different `ai` versions, while `e2e/README.md` says "never npm". | **SRC (app)** |
| **O-6** | One-off scripts `build-studio.cjs` and `build-tz-picker.cjs` are committed and rewrite source files. | **SRC (app)** |
| **O-7** | The MIG-1 entry is partly wrong: `20260805110114` deliberately revoked `anon`. JR-3: no checker covers policies, grants, triggers or constraints. | **SRC** (doc) |

### P7 — Testing and CI

| ID | Finding | Class |
|---|---|---|
| **T-1** | No CI configuration exists (no `.github/`). `bun run check` is local-only. | **SRC** |
| **T-2** | E2E writes to the production project. | **SRC** |
| **T-3** | No RLS, grant, SQL-function or server-function authorization tests exist. The 62 unit tests cover only pure logic. | **SRC** |
| **T-4** | E2E-1: the UI suite fails when run as a suite. E2E-2: `monte-carlo.test.ts` times out under load. | **SRC** |
| **T-5** | `check:schema` compares columns only (JR-3). | **SRC** |

---

## 2. Phase overview and dependencies

```
Phase 0  Live truth + safety rails ─────────────┬──────────────────────────┐
  (read-only; no prod writes)                   │                          │
                                                ▼                          ▼
Phase 1  Containment (grant-only, zero app impact)                Phase 8a Minimum test
  C-6, C-7, S-4 revokes; S-1 auth; S-7                            harness (pulled forward)
                                                │                          │
                                                ▼                          │
Phase 2  Score integrity: close the trust boundary ◄──────────────────────┘
  2A settlement RPC (expand) → 2B app switch → 2C price authority
  → 2D replay-battle verification → 2E revoke direct writes (contract)
  → 2F profile competitive columns → 2G forensics + data remediation
                                                │
                    ┌───────────────────────────┼────────────────────────────┐
                    ▼                           ▼                            ▼
Phase 3  Auth/RLS hardening          Phase 4  Battle & championship     Phase 5  Prop challenge
  S-2, S-3, S-5, S-6, S-8              B-1..B-9 (needs 2A RPC)            P-1..P-7 (needs 2A, 2C,
  (needs Phase 0 grants)                                                  equity from Phase 4)
                    │                           │                            │
                    └───────────────┬───────────┴────────────────────────────┘
                                    ▼
Phase 6  Historical data reliability (independent of 2–5 except S-1/S-3 already done)
Phase 7  Operations
Phase 8b CI and full test programme
```

**Why the order differs slightly from the priority list:**

- **Phase 1 includes some P2 items.** Revoking the unused `commit_settlement`
  and the leaked helpers, and adding auth to S-1, are grant-only or
  middleware-only changes with no functional dependency. Any user or anonymous
  caller can exploit them today, and leaving them open while Phase 2 is built
  would undermine it.
- **Phase 8a (the minimum test harness) comes before Phase 2.** Removing
  direct writes to `paper_trades` breaks every path that still writes as the
  user. Without authorization tests running against a non-production project,
  that can only be discovered in production.
- **Phase 4 includes P&L formula correctness (B-8).** It affects scores, but
  fixing it before Phase 2 leaves more than one settlement path to fix it in.
- **Phase 6 can run in parallel** with Phases 3 to 5 once Phase 1's S-1 fix
  and Phase 3's S-3 fix have landed, because it touches no competition tables.

---

## 3. Phase 0 — Live truth and safety rails

**Goal:** turn every LIVE? and LIVE-ONLY finding into CONFIRMED or REFUTED,
capture restorable snapshots, and settle the environment decisions. **No
production writes**, except creating the snapshot schema if decision D-3 allows it.

### 0A. Decisions required before anything else

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D-1 | How to read catalogs repeatably (JR-3's open question) | (a) keep hand-pasting into the Lovable SQL editor; (b) a `SECURITY DEFINER` `audit_catalog()` RPC granted only to `service_role`; (c) obtain a DB connection string | (a) for Phase 0. Choose (b) or (c) before Phase 8a. |
| D-2 | Non-production environment | (a) a second Supabase project for tests and staging; (b) keep testing in production | (a). Phases 2 to 5 depend on it. |
| D-3 | Snapshot storage | (a) a `remediation_backup` schema in production with no grants to `anon`/`authenticated`; (b) CSV exports only | (a) plus exports. |
| D-4 | Is `SUPABASE_SERVICE_ROLE_KEY` set in production? | — | Must be confirmed. Phase 2A's design depends on it (MD-11). |
| D-5 | Change window and freeze | Pause new battles, championships and prop challenge creation during the Phase 2E contract step? | Yes, a short maintenance banner. |

### 0B. Live verification queries

Each query goes in `docs/migrations/remediation/phase0/`, one read-only
statement per file, following the existing convention. Results are saved to
`phase0-results/` with a date.

| Query | Confirms or refutes |
|---|---|
| `SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check FROM pg_policies WHERE tablename IN ('paper_trades','paper_accounts','account_statistics','prop_challenges','prop_challenge_days','journal_entries','profiles','battle_rankings','championship_rankings','battle_participants','championship_participants','provider_market_assignments')` | C-1, C-5, P-1, S-2 |
| `SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee IN ('anon','authenticated') AND table_name IN (…same list…)` | C-1, S-2, P-1 |
| `SELECT grantee, table_name, column_name, privilege_type FROM information_schema.column_privileges WHERE table_name='profiles' AND grantee IN ('anon','authenticated')` | C-5 |
| `SELECT p.oid::regprocedure, p.prosecdef, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_x, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_x FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY 1` | C-6, C-7, S-4, S-5 (the full function privilege map) |
| `SELECT defaclrole::regrole, defaclnamespace::regnamespace, defaclobjtype, defaclacl FROM pg_default_acl` | C-7 (the root cause of new functions being exposed) |
| `SELECT p.oid::regprocedure, md5(pg_get_functiondef(p.oid)) FROM pg_proc … WHERE proname IN ('finalize_battle','tick_battle','tick_battles','_join_battle_as','join_battle','recompute_battle_ranking','recompute_championship_ranking','finalize_championship','tick_championships','start_championship','commit_settlement','protect_profile_privileged_columns','enforce_battle_rules_on_trade','set_trade_championship_id','trg_recompute_championship_ranking','trg_recompute_battle_ranking')`, then `pg_get_functiondef` for each one whose md5 differs from the repo version | B-1, B-2, B-3, B-4, S-5, C-5; also yields rollback bodies |
| `SELECT tgrelid::regclass, tgname, tgenabled, pg_get_triggerdef(oid) FROM pg_trigger WHERE NOT tgisinternal AND tgrelid::regclass::text IN ('paper_trades','profiles','prop_challenges')` | C-1 trigger paths, C-5, JR-3 |
| `SELECT jobid, jobname, schedule, active, regexp_replace(command, '(x-cron-secret[^,]*)', '<redacted>') FROM cron.job` | B-5, B-9, O-2 |
| `SELECT … FROM net._http_response ORDER BY created DESC LIMIT 200`, grouped by status | O-2 (real HTTP outcomes) |
| From an authenticated session: `select current_setting('request.jwt.claim.role', true), current_setting('request.jwt.claims', true)` via a temporary probe RPC, or read the PostgREST version | S-6 |
| Status counts from `historical_import_jobs` where status is `running` and older than the TTL | H-6 |
| The pending `hs-*` files listed in README ⏳ | H-8 |

### 0C. Forensics queries (read-only, feed Phase 2G)

These detect contamination (C-8). Run them now so later checks have a baseline.

1. **Closed trades with no server close event:** `paper_trades` rows with
   `status='closed'` and no `position_history` row with `event='closed'` for
   the same `trade_id`. Separate replay-battle rows (`battle_id` set via
   `recordBattleReplayTrade`) from the rest.
2. **Trades inserted already closed:** `created_at ≈ closed_at` or
   `opened_at = closed_at` outside the replay path. Treat JR-7's NAS100 rows
   as a known benign case.
3. **P&L plausibility:** recompute `pnl` from entry, exit, lots and the symbol
   spec for championship and battle trades. Flag deviations above tolerance.
   Watch for BA-8/10 false positives on cross pairs.
4. **Balance drift:** `starting_balance + Σ closed pnl − balance` per account
   (the BA-5/BA-11 invariant).
5. **ELO without history:** `profiles.elo` compared with the last
   `elo_history.elo_after`, and `battle_wins` compared with a count from
   `battle_results`.
6. **Prop challenges passed** where the linked account's `starting_balance ≠
   account_size`, `prop_challenge_days` is empty, or `updated_at` doesn't
   match a tick pattern.
7. **Trade `opened_at`** outside the battle or championship window that the
   trade is attributed to.

**Exit criteria:** every LIVE? and LIVE-ONLY row in §1 is marked CONFIRMED or
REFUTED with a dated result file, D-1 to D-5 are decided, and forensics
baselines are saved.

**Rollback:** not applicable, since everything is read-only.

---

## 4. Phase 1 — Containment

**Goal:** close exposures that can be removed with **grant-only or
middleware-only** changes, with no behavioural impact on legitimate users.

**Depends on:** Phase 0 (the function privilege map, the `pg_default_acl`
rows, and live grants).

| Step | Change | Finding |
|---|---|---|
| 1.1 | `REVOKE EXECUTE ON FUNCTION commit_settlement(uuid,uuid,numeric) FROM PUBLIC, anon, authenticated;` The app never calls it, per a grep of `src/`. | C-6 |
| 1.2 | Revoke EXECUTE from `PUBLIC, anon, authenticated` on every function Phase 0 marks internal-only: `_join_battle_as`, `tick_battles`, `recompute_*`, `finalize_championship`, `start_championship`, `tick_championships`, `emit_championship_activity`, and so on. Keep an explicit allow-list: `join_battle`, `join_battle_by_code`, `tick_battle`, `finalize_battle`, `has_role`, `has_permission`, `is_platform_admin`, `get_my_profile`, `register_for_championship`, `cancel_championship_registration`, `join_championship_live`, `bump_ai_rate_limit`, `social_follow_counts`. The final list comes from the Phase 0 map plus a grep of every `.rpc("…")` call. | C-7, S-4 |
| 1.3 | `ALTER DEFAULT PRIVILEGES [FOR ROLE <creator role from pg_default_acl>] IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;` From then on, every new function must be granted explicitly. | C-7 root cause |
| 1.4 | Add `requireSupabaseAuth` and zod validation to `twelveDataCandles` and `twelveDataQuote` (bound `count` and the `from`/`to` span, and whitelist `symbol` against enabled symbols). Put `twelveDataStatus` and `twelveDataUsage` behind the admin permission. Add auth plus `ensurePerm` to `listMarketAssignments`, or switch it to the user client so the new admin-only RLS applies. | S-1 |
| 1.5 | Make the AI rate limiter fail closed, and log the RPC error. | S-7 |

**Tests before production:**

- **1.1–1.3:** on the non-production project (D-2), run the full `.rpc(` call
  inventory as `anon` and as an ordinary user. Allowed functions must succeed
  and revoked ones must return `42501`. Unattended checks: run
  `docs/battle-tick-unattended-test.md` (cron → `tick_battles`) and a
  championship admin tick, to prove service-role paths still work.
- **1.3:** create a throwaway function in the test project and confirm
  `has_function_privilege('authenticated', …)` is false.
- **1.4:** unit test that each route rejects without a bearer token. E2E: the
  trading chart still loads candles and quotes while logged in, and a
  logged-out request returns 401.
- **1.5:** unit test with a mocked RPC error, expecting a denial.

**Verification in production:** re-run the Phase 0 privilege map query and
diff it against the expected allow-list, which must match exactly. Run
`curl` against the S-1 routes without auth and expect 401.

**Rollback:**

- **1.1–1.2:** a generated rollback file with one `GRANT EXECUTE … TO <role>`
  per revoked privilege, built from the Phase 0 snapshot.
- **1.3:** `ALTER DEFAULT PRIVILEGES … GRANT EXECUTE ON FUNCTIONS TO …`,
  restoring the exact `pg_default_acl` row.
- **1.4–1.5:** revert the commit.

---

## 5. Phase 8a — Minimum test harness (pulled forward)

**Depends on:** D-2 (a non-production Supabase project). **Blocks:** Phase 2E
and every later RLS or grant contract step.

1. **Apply migrations to the test project from the repo, then reconcile it to
   production** using Phase 0's `pg_get_functiondef`, policy and grant
   snapshots. The test project must mirror **live**, not the repo.
2. **Authorization test suite** (`tests/authz/*.test.ts`) using real JWTs for
   three personas (anon, user A, user B) plus admin. For every table and RPC
   in §1, assert the allowed operations and the denied ones, with the
   **specific** error code (JR-3's standing rule: assert which rule fired).
3. **Settlement invariant tests** that run against the database: concurrent
   close of the same trade (expect exactly one settlement), concurrent closes
   on one account (no lost update), and `starting_balance + Σ pnl = balance`.
4. **`check:policies`**, extending `check:schema` from a committed manifest of
   policies, grants, function EXECUTE, triggers and constraints (JR-3 sketch).
   This uses the access route chosen in D-1.
5. **Point E2E at the test project** (fixes T-2).

**Exit criteria:** the suite runs green against the test project and encodes
**today's** behaviour. Tests for C-1, C-5, P-1 and so on are written as
"currently allowed", so Phase 2 flips them deliberately.

---

## 6. Phase 2 — Competition and score integrity

**Goal:** a trade result, balance, ranking, ELO or payout can only come from
a server path using server-known prices.

**Depends on:** Phases 0, 1 and 8a, and D-4 (service-role key present).

**Design principle (expand → switch → contract):** add the new authoritative
path first, move the app onto it, and only then remove users' direct write
access. Each step is independently deployable and reversible.

### 2A. Authoritative settlement RPCs (expand)

Replace the draft `commit_settlement` design:

- **`settle_trade_close(_trade_id, _user_id, _exit_price, _pnl, _close_reason, _closed_at)`**
  and **`settle_partial_close(…)`**, both **`service_role` only**. Called from
  server functions after `requireSupabaseAuth`, with `_user_id =
  context.userId` taken from the verified JWT and never from client input.
- In **one transaction**:
  1. `SELECT … FROM paper_trades WHERE id=_trade_id AND user_id=_user_id AND status='open' FOR UPDATE`
     (a zero-row result raises an exception, which fixes C-3's double settlement).
  2. Lock the account row `FOR UPDATE` and apply the negative-balance-protection floor.
  3. Update the trade, the balance and `account_statistics`.
  4. Insert `position_history`.
- **P&L arithmetic stays in TypeScript** (`computePnl`, `clampRealizedPnl`) so
  the logic isn't duplicated. The RPC enforces the invariants (floor, status
  transition, ownership) and doesn't recompute price math. B-8 can move it
  into SQL later if wanted.
- `open_trade_record(…)` is the same pattern for opens.
- Revise `_bmad-output/specs/spec-commit-settlement-rpc/` to match: a
  service-role grant, trade row locking, and statistics inside the transaction.
  Its equivalence proof and caller contract carry over.

**Tests:**

- Invariant suite from 8a.3 against the new RPCs.
- Calling as `authenticated` returns `42501`.
- A replayed close raises, and the balance is unchanged.
- The negative-balance-protection table from `.memlog.md` becomes a parametrised test.

**Rollback:** `DROP FUNCTION`. Nothing calls it yet.

### 2B. App switch

- `closeTrade`, `partialCloseTrade` and `openTrade` call the 2A RPCs through
  `supabaseAdmin`. The TS `commitSettlement` is deleted.
- Deploy with the old direct-write grants still in place, so a revert is safe.

**Tests:**

- Existing unit tests.
- E2E open → partial close → close on the test project, asserting the balance
  and statistics invariant.
- Load test: 20 parallel closes of one trade (exactly 1 succeeds), and 20
  parallel closes on one account (the balance sum is exact).

**Verification:** after deploy, forensics query 0C-4 (drift) must show no new
drift on accounts that traded after the deploy timestamp.

**Rollback:** revert the commit. The old path still works because the grants
are unchanged.

### 2C. Price authority

- The server fetches or validates the fill price:
  - Non-crypto: the Twelve Data quote proxy.
  - Crypto: MD-12/H-9 are a **blocker**, since Binance is unusable from the
    deployment. **Decision D-6** is needed: use Bybit for live crypto, or allow
    client-price closes only within tolerance of the latest server-side candle.
- **Rollout in observe mode first:** log the difference between client and
  server prices per close for about a week, then enforce a tolerance band per
  asset class (for example, max(spread × k, x bps)).
- **Stop-loss and take-profit closes** triggered client-side must be validated
  against the candle high/low between open and close, not the last quote.

**Tests:**

- A close with an exit price outside tolerance is rejected.
- Stop-loss and take-profit fills inside the candle range are accepted.
- The observe-mode flag writes logs and never blocks.

**Rollback:** set the environment flag back to observe mode, with no deploy needed.

### 2D. Replay battle verification (C-4, and B-7 settlement)

- `recordBattleReplayTrade` stops accepting `pnl`. The server recomputes it
  from `historical_candles` at the recorded observation cursor (entry and exit
  bar, engine formula; USD-quoted only per the existing constraint), then
  settles through 2A. That also fixes BA-11: the balance, statistics and clamp
  all apply.
- **Dependency:** the replay dataset candles must be stored server-side and
  immutable for the battle's duration. Verify this for `replay_dataset_id`
  battles.

**Tests:**

- A forged `pnl` in the request is ignored.
- Recomputed P&L equals the engine P&L for fixtures.
- The BA-11 −$180.10 scenario produces zero drift.

**Rollback:** revert the commit.

### 2E. Contract: remove direct user writes (C-1)

Hold a short freeze under D-5, then apply one statement per file with a
verify after each:

- `paper_trades`: revoke INSERT, UPDATE and DELETE from `authenticated`. Keep
  SELECT. First confirm by grep plus 8a tests that every remaining writer
  (order-ticket exits, journal linkage, soft delete, `modifyTrade`) either
  goes through a service-role path or keeps a **column-level** UPDATE grant
  on non-score columns only (for example `notes`, `screenshot_path`,
  `stop_loss`, `take_profit` while open, enforced by trigger).
- `paper_accounts`: column-level UPDATE only on cosmetic columns (name,
  archive flag). `balance`, `equity`, `starting_balance` and
  `negative_balance_protection` are service-only. INSERT goes through a server
  function with a `starting_balance` cap. Protect columns in a `BEFORE UPDATE`
  trigger too, as defence in depth against a missed grant.
- `account_statistics`, `battle_rankings`, `championship_rankings`,
  `battle_results`: SELECT only.
- Replace the policies with separate `FOR SELECT` and explicit per-command
  policies instead of `FOR ALL`.

**Tests before production (all on the test project):**

- The full authz suite flipped: direct PostgREST INSERT or UPDATE of `pnl`
  returns `42501` or the specific policy violation.
- The full E2E suite: trading, order-ticket exits, journal, battles and
  championships all still work.
- `check:policies` passes against the new manifest.

**Verification in production:** re-run the Phase 0 policy and grant queries
and diff them against the manifest. With a production test user, confirm the
PostgREST direct insert is rejected and a normal trade through the UI works.

**Rollback:** one pre-generated rollback file per statement, restoring the
exact Phase 0 policy definitions and grants. Rehearse it once on the test
project before production.

### 2F. Profile competitive columns (C-5, part of B-4)

- Extend the protect trigger, or better, move to column-level UPDATE grants
  on `profiles` for user-editable columns only. `elo`, `peak_elo`,
  `battle_wins`, `battles_played`, `current_battle_streak`,
  `best_battle_streak`, `xp`, `coins`, `level`, `league`, `rank`, `streak` and
  `is_premium` become service-only.
- Fix S-6 in the same change: detect service role with `auth.role()` or
  `current_setting('request.jwt.claims', true)::jsonb->>'role'`.
- Move `awardXpCoins` and `claimDailyLogin` onto one service-role
  `award_xp_coins(user, xp, coins, source, source_id)` RPC that is idempotent
  on `(source, source_id)` and writes both the ledger and the profile. This
  fixes the revert half of B-4.

**Tests:**

- A user updating `elo` or `xp` directly gets `42501`, asserted against the
  specific grant.
- Awarding twice with the same `source_id` pays once.
- The daily claim still works end to end.
- Service-role writes succeed. This is the S-6 regression test.

**Rollback:** restore the grants and the trigger body from the Phase 0 snapshot.

### 2G. Forensics and data remediation (C-8)

**Only after 2E and 2F**, otherwise data could be re-forged.

1. Re-run the 0C queries and compare them with the baseline to separate
   historical contamination from anything new.
2. **Decision D-7 (product):** for flagged records, choose among
   void-and-recompute, annotate, or leave in place. Hard deletion isn't an option.
3. Mechanics:
   - Copy affected rows to `remediation_backup.<table>_<date>`.
   - Mark voided trades (`void_reason`, excluded by ranking functions) rather
     than deleting them.
   - Call `recompute_*_ranking` per affected event.
   - Rebuild ELO from `elo_history`, or recompute it from `battle_results` in order.

**Tests:**

- Dry-run on a copy in the test project.
- The before and after leaderboard diff is reviewed and signed off by a human.

**Rollback:** restore from the backup tables, then re-run the recompute.

---

## 7. Phase 3 — Authentication, authorization and RLS hardening

**Depends on:** Phases 0 and 1, and the 8a harness. It can run in parallel
with Phase 4.

| Step | Change | Finding | Tests before production | Rollback |
|---|---|---|---|---|
| 3.1 | Journal sharing: drop the public list policy, revoke `anon` table SELECT, and add `get_shared_journal_entry(_token text)` (SECURITY DEFINER, granted to anon and authenticated) that returns a safe column subset for exactly one token. Switch `journal/api.ts` to it. | S-2 | As anon: a table SELECT returns 0 rows or 42501. The RPC with a valid token returns 1 row, and with a wrong token returns 0. E2E: the share link page renders. | Restore the policy and grant from the snapshot, and revert the commit. Deploy order: RPC → app → revoke. |
| 3.2 | Inline imports: `allowBackfill` only for admins or cron. User paths get a bounded span (for example, at most N bars) and a per-user quota, and are otherwise queued for cron. | S-3 | A user request for a 365-day range doesn't call `runImport`. Replay on stored data still works. | Revert the commit. |
| 3.3 | `finalize_battle`: replace `auth.uid() IS NULL` trust with an explicit service-role check, and split out `_finalize_battle_internal` (no grants) used by `tick_battle` and cron. The host-facing wrapper does the permission check. (This also fixes B-1; see Phase 4.) | S-5 | anon gets 42501. A user calling the wrapper for another host's battle is rejected. The cron path succeeds. A viewer's tick after `end_at` finalizes. | Restore both bodies from the Phase 0 `pg_get_functiondef` snapshot. |
| 3.4 | Sweep every `supabaseAdmin` use reachable from a server function or route, and require auth plus a permission check on each. Add an ESLint rule or check: importing `client.server` in a `*.functions.ts` file requires an auth middleware in the same export chain. | S-8 | A new authz test per endpoint found. | Revert the commit. |
| 3.5 | Add `.env` guard: a CI check that fails if `.env` contains keys other than the publishable allow-list. | S-9 | The check fails on a synthetic secret. | Not applicable. |

**Verification:** re-run the Phase 0 policy and privilege queries, and run the
authz suite against production with dedicated test personas (read-only
assertions only).

---

## 8. Phase 4 — Battle and championship settlement integrity

**Depends on:** 2A/2B (the single settlement path), 3.3 (finalize split), and
the Phase 0 cron inventory.

| Step | Change | Finding |
|---|---|---|
| 4.1 | Use `_finalize_battle_internal` in `tick_battle` so any viewer tick after `end_at` settles. Align `finalizeBattle` with it: non-hosts may request finalization only after `end_at`, which goes to the internal function. **Decision D-8:** may a host finalize early? Recommendation: no. The host can *cancel* before `live`, but not end a live battle early. | B-1, B-2 |
| 4.2 | Add an expiry branch to `tick_battle`: `open`/`filling`/`ready` past `start_at + grace` with count < `min_participants` → `cancelled`. Release the battle's paper accounts and notify participants. | B-3 |
| 4.3 | Pay rewards: `finalize_battle` and `finalize_championship` call `award_xp_coins` (2F) with `source_id = battle_id`/`championship_id`, which makes it idempotent. Also backfill unpaid rewards from `battle_results` and `championship_rewards`, **after** 2G voids forged results. | B-4 |
| 4.4 | Schedule `tick_championships` using the hand-applied cron pattern (`docs/migrations/remediation/champ-cron/{0-precondition,1-schedule,2-verify,rollback}.sql`), modelled on `historical-sync/`. Confirm idempotency first: two ticks in one minute produce no double start, finalize or auto-create. | B-5 |
| 4.5 | Reconcile the cron jobs: keep one finalizer path, either `battle-tick` or `battle-settlement`, and unschedule or document the other. | B-9 |
| 4.6 | P&L correctness, now that 2A gives one path: fix BA-8a (capture fx_rate at open), BA-8b (validated pipValuePerLot), the BA-9 durable fix (units vs lots at the schema boundary), and BA-10 (one P&L formula). Then recompute open events' rankings. | B-8 |
| 4.7 | Replay battle settlement is covered by 2D (B-7). Confirm with the BA-11 reproduction. | B-7 |
| 4.8 | BA-6 (chart and replay-engine trades not counting) is **deferred**. Record the product decision. | B-10 |

**Tests before production (test project):**

- **State machine table test:** for each status × time position × participant
  count, check the expected transition. Cover viewer ticks, host ticks and
  cron ticks.
- **Finalize concurrency:** cron and a viewer tick finalize at the same moment,
  giving exactly one `battle_results` set and one ELO update.
- **Rewards:**
  - After finalize, `profiles.xp` has increased by `xp_awarded`.
  - Running finalize again doesn't change `profiles`.
  - Running the backfill twice pays once.
- **Championship cron:**
  - A tick before the start does nothing.
  - A tick at the start starts the championship.
  - A tick at the end finalizes exactly once.
  - Auto-create is not duplicated.
- **P&L:**
  - Cross-pair fixtures: JPY, CAD and CHF against hand-computed values.
  - A lots vs units boundary test.
- **Unattended run:** `docs/battle-tick-unattended-test.md` extended to a full
  battle lifecycle with no browser open.

**Verification in production:**

- Battles with `status='live' AND end_at < now() - interval '2 minutes'`
  return 0 rows.
- For championships, compare `cron.job_run_details` with `net._http_response`
  status 200.
- A spot check of `profiles.xp` against the `xp_transactions` sum for recent
  winners.

**Rollback:**

- **Function bodies:** restore them from the snapshot taken immediately before
  the step. That's a fresh capture, not the Phase 0 one, since Phase 3 changed them.
- **Cron:** run the `rollback.sql` unschedule.
- **Reward backfill:** the ledger rows carry `source='backfill-<date>'`, so the
  reversal is a compensating ledger entry plus a profile decrement. Never
  delete ledger rows.
- **P&L fix:** revert the commit. Rankings recomputed in 4.6 are restored from
  `remediation_backup`.

---

## 9. Phase 5 — Prop challenge integrity

**Depends on:**

- 2A/2E, so accounts and trades can't be written directly.
- 2C for price authority.
- 4.6 for correct P&L.
- Decision D-9: are prop results shown as achievements or certificates, and
  do replay variants count?

| Step | Change | Finding |
|---|---|---|
| 5.1 | `prop_challenges` and `prop_challenge_days` become SELECT-only for owners. All writes go through service-role server paths. Deletion is only allowed while `status='active'` with zero trades; otherwise the row is abandoned or archived and kept. | P-1, P-6 |
| 5.2 | Creation always provisions a fresh dedicated account sized to `account_size`. Reject `paper_account_id` unless it is unused, has `starting_balance = balance = account_size`, the same currency, and no trades. Recommendation: remove the option. | P-2 |
| 5.3 | Server-side evaluator: a `prop-evaluate` cron hook every 1–5 minutes over active challenges, plus evaluation inside the settlement RPC path after every close. The browser tick becomes read-only. | P-3 |
| 5.4 | Equity includes floating P&L. The evaluator computes `balance + Σ unrealized` from open positions at server prices, and tracks intraday low equity per day. | P-4 |
| 5.5 | The day boundary follows a defined challenge timezone (product decision, for example the prop-firm convention of 17:00 New York). Start-of-day equity is snapshotted by cron at the boundary, not inferred from the last tick. | P-5 |
| 5.6 | Label replay prop challenges as "practice (unverified)" in the UI and exclude them from any public achievement. | P-7 |
| 5.7 | Re-evaluate every historical `passed` challenge with the 0C-6 query. Handle flagged ones under D-7. | C-8 |

**Tests before production:**

- A user updating `status='passed'` directly is rejected.
- Linking a pre-funded account is rejected.
- A floating loss beyond the daily limit, with no close, is breached by cron
  within one interval.
- Day boundary fixtures, including DST transitions.
- Evaluator idempotency: two concurrent evaluations produce one breach record.
- An abandoned or failed challenge can't be deleted.

**Verification in production:**

- Active challenges all have a `prop_challenge_days` row for today after the
  boundary cron.
- No challenge is `passed` with fewer trading days than `min_trading_days`.

**Rollback:**

- **Policies and grants:** restore from the snapshot.
- **Evaluator:** unschedule the cron and set the environment flag to disable
  in-settlement evaluation.
- **Re-evaluation outcomes:** restore from `remediation_backup.prop_challenges_<date>`.

---

## 10. Phase 6 — Historical data reliability

**Depends on:**

- 1.4 (S-1): the unauthenticated writer to `historical_candles` must be closed
  first.
- 3.2 (S-3): the user-triggered imports must be bounded first.
- The H-8 pending verifications from Phase 0.

| Step | Change | Finding | Tests |
|---|---|---|---|
| 6.1 | The pagination loop terminates on `cursor >= to`, or on N consecutive confirmed-empty windows per HD-4's rules, **not** on `values.length < PAGE`. | H-1 | A fixture with weekend-sparse pages covers the full range. A regression fixture replays the HD-4 empty-window error. |
| 6.2 | Every provider fetch goes through one helper with `AbortSignal.timeout(ms)` sized to the Cloudflare limits, with classification (timeout counts as a retryable infrastructure error). | H-2 | A hanging mock server aborts within the timeout, and the job is marked failed with the right kind. |
| 6.3 | Check the `completed` write for errors and retry once. If it still fails, log a distinct `completion_write_failed`. Sweep the pipeline for other PAT-1 discarded `{ error }` values. | H-4 | A mocked update error doesn't produce a false failed state. A lint rule or check flags an unchecked `await …update(` (PAT-1 audit). |
| 6.4 | Build HD-6's designed reaper (confirm the status first). Base the TTL on platform limits, per HD-6. | H-6 | A job with a stale `updated_at` is reaped, and a job making progress is not. |
| 6.5 | Replace the per-isolate limiter with a DB-backed credit budget (a row-locked counter per minute and day), consulted by both the quote proxy and the pipeline. | H-3 | Concurrent consumers can't exceed the budget (test project). |
| 6.6 | Make gap detection session-aware using the existing session module (after MS-1/MD-6 decisions), and suppress market-closed gaps from alerts. | H-5 | Weekend and holiday fixtures produce no alert. A mid-session gap still alerts. |
| 6.7 | Resolve MD-4 (the two writers) before any purge. Resolve MD-11/MD-12 per D-4/D-6. | H-7, H-9 | Documented decision, plus the md4-probe results. |

**Verification in production:**

- Run the `hs-hd4-verify-*` and `hs-4-depth` queries 24 h and 72 h after
  deploy.
- Import job success rate, and no `running` jobs older than the TTL.
- Twelve Data credit usage stays within the plan.

**Rollback:** revert the commits. The DB budget table is additive, so drop it
only after the revert. Candle data isn't mutated by these steps; only new
imports behave differently.

---

## 11. Phase 7 — Production operations

| Step | Change | Finding |
|---|---|---|
| 7.1 | Write down the cron inventory and add HTTP-outcome monitoring: a scheduled check of `net._http_response` for non-2xx per job, alerting through an admin notification (EC-5). | O-2 |
| 7.2 | Write down the secrets inventory from D-4 and the Phase 0 findings: which are set in production, who owns them, and how to rotate them. | O-3 |
| 7.3 | The email `noop` provider marks jobs `skipped`, and a `processing` reaper with a TTL is added. Confirm `EMAIL_PROVIDER` in production. | O-1 |
| 7.4 | AI Mentor: migrate tools to `inputSchema` and add `stopWhen: stepCountIs(n)`, removing the `as any` cast so the types catch regressions. | O-4 |
| 7.5 | Pick bun as canonical: delete `package-lock.json` and add a check that fails if it reappears. | O-5 |
| 7.6 | Remove `build-studio.cjs` and `build-tz-picker.cjs` after confirming they're one-offs. | O-6 |
| 7.7 | Correct the MIG-1 entry. Document the hand-apply protocol for remediation files: one statement per file, a verify per statement, and a rollback per statement. | O-7 |

**Tests:**

- **7.1:** a synthetic failing hook raises an alert.
- **7.3:** a unit test for the `noop` status, and the reaper test.
- **7.4:** an integration test that the mentor answers after a tool call, with
  the gateway mocked.
- **7.5:** a clean `bun install` then `bun run check`.

**Rollback:**

- **7.1:** unschedule the monitor.
- **7.3–7.6:** revert the commit.

---

## 12. Phase 8b — CI and the full test programme

1. **GitHub Actions on every PR and push:** `bun run typecheck`,
   `typecheck:e2e`, `test`, `build`, `check:columns`, `check:casts`,
   `check:sessions`, and the 8a authz suite against the **test** project.
   `check:schema` and `check:policies` run against production read-only on a
   schedule, alerting on drift. That's the ongoing answer to MIG-1 and JR-3.
2. **Required checks before merge** to the Lovable-synced branch.
3. **Fix E2E-1** (suite-order dependence) and **E2E-2** (monte-carlo timeout,
   per its entry). Run E2E nightly against the test project.
4. **Migration discipline:** every `supabase/migrations/` file gets a matching
   `docs/migrations/<name>/{apply,verify,rollback}` set. The PR template
   requires the Phase 0-style snapshot query for any object it alters.

---

## 13. Standard procedure for every production database change

This applies to every DB step in Phases 1 to 7.

1. **Snapshot live.** Capture `pg_get_functiondef`, `pg_policies` rows, table,
   column and function grants, and trigger definitions for every object the
   change touches. Save them to `phase<N>-results/<step>-before.sql`, and
   generate the rollback file from that capture, not from the repo.
2. **Back up data** that the step mutates into `remediation_backup.<table>_<yyyymmdd>`.
3. **Rehearse on the test project:** apply → verify → run the tests → roll
   back → verify the restored state → apply again.
4. **Apply in production** one statement at a time in the Lovable SQL editor,
   with the matching verify statement after each one. "Success" in the editor
   isn't evidence.
5. **Verify behaviourally:** at least one allowed and one denied operation per
   change, asserting the **specific** error code and constraint name.
6. **Record** the applied timestamp and verify output in the phase results
   file and in `docs/migrations/README.md`.
7. **Deploy order:** DB additive change → app change → DB restrictive change.
   Never ship a restrictive DB change in the same window as the app change
   that stops depending on the old access.
8. **App rollback** is `git revert` on the Lovable-synced branch. Never force-push.

---

## 14. Open decisions

| # | Decision | Blocks |
|---|---|---|
| D-1 | Catalog access route (Lovable SQL editor, audit RPC, or DB credentials) | 8a.4, 8b.1 |
| D-2 | Separate Supabase test project | 8a, and every contract step |
| D-3 | Where backups live | Phase 2G onwards |
| D-4 | Is the service-role key present in production | 2A |
| D-5 | Maintenance freeze for 2E | 2E |
| D-6 | Crypto live price source, or tolerance fallback | 2C, 5.4 |
| D-7 | Treatment of contaminated historical results | 2G, 4.3 backfill, 5.7 |
| D-8 | Host early-finalize semantics | 4.1 |
| D-9 | Prop result status and challenge timezone | 5.5, 5.6 |

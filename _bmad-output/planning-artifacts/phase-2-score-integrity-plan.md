---
title: TradersHIVE Phase 2 — score & account state integrity (PLANNING ONLY)
status: draft — nothing implemented, no production change
created: 2026-09-17
depends_on:
  - Phase 0 live verification (phase-0-live-verification.md)
  - Phase 1 containment applied to production (production-run.md, commit 00245eef)
inputs: current source @ 24edd5ef, supabase/migrations, live production state
scope: make paper_trades / paper_accounts / account_statistics / profiles(competitive) / prop_challenges / battle & championship state SERVER-AUTHORITATIVE
---

# Phase 2: score & account-state integrity

**This is a plan. No code, migration, grant or production change is proposed for execution here.** It builds on Phase 1, which revoked anon/authenticated EXECUTE on the settlement and battle-join RPCs but left the **table-level** write access (C-1, C-5, P-1, N-1, N-10) untouched. Phase 2 closes those.

## 0. The core problem, precisely

Phase 0 confirmed (Q-A2/A5/A6): `paper_trades`, `paper_accounts`, `account_statistics`, `position_history`, `prop_challenges`, `prop_challenge_days` carry `FOR ALL` policies to `{public}`/`authenticated` with `auth.uid() = user_id`, and `authenticated` holds INSERT/UPDATE/DELETE. `profiles` has an owner UPDATE policy with column privileges on `elo`, `battle_wins`, etc. `battles` has a host UPDATE policy covering every column.

So the application's server functions are **not the only writer**. They run under `requireSupabaseAuth` with the **user-scoped** client, meaning every write they make, a hand-crafted PostgREST call with the publishable key can also make. The server function is advisory; RLS is the real boundary, and RLS currently says "the owner may write anything".

**The Phase 2 objective:** the *score-authoritative* columns of these tables may only change through a trusted server path (a `service_role` server function, or a `SECURITY DEFINER` RPC that computes the value itself). Direct client writes to those columns are removed at the grant/policy layer. User-owned *non-scored* columns (notes, cosmetic account settings, watchlists, tags, journal) stay directly writable.

---

## 1. Recommended target architecture

### 1.1 Two trust domains, kept separate

The prompt is right that these are not one trust domain. The codebase already separates them by **table**:

| Domain | Where results live today | Scored? | Authority needed |
|---|---|---|---|
| **Competitive / scored** | `paper_trades` (+ `paper_accounts.balance/equity`, `account_statistics`, `battle_rankings`, `championship_rankings`, `battle_results`, `profiles.elo/xp/…`) | **Yes** — battle & championship leaderboards, ELO, prop pass/fail, dashboards, journal | Server-authoritative price + P&L + settlement |
| **Practice / Replay Studio** | `chart_closed_trades` (carries `replay_session_id`), `replay_sessions`, `replay_events` | **No** — never feeds a public leaderboard; analytics filters exclude replay rows (`replay-trade-sync.ts` header; `analytics/source.ts`) | User-controlled synthetic prices are *correct here*. Keep as-is. |

**Key finding for the prompt's Replay question:** Replay Studio practice trades already write to a **different table** (`chart_closed_trades`) than competitive trades (`paper_trades`). They are **already separate trust domains at the schema level.** Phase 2 must preserve that and must **not** drag `chart_closed_trades` behind settlement authority — its whole purpose is client-driven what-if pricing on a shared historical tape.

**The one true overlap** is **Battle Arena replay battles**: `recordBattleReplayTrade` (`battle-replay.functions.ts`) writes client-computed `pnl` into **`paper_trades`** (the scored table) for a battle. This is the exception where a *replay-priced* trade enters the *scored* domain. It is already firewalled by `battles_replay_must_be_unranked` (replay battles award no ELO), but it still writes forgeable `pnl` that shows on the in-battle leaderboard. Phase 2 recomputes it server-side (§2C).

### 1.2 The authority pattern

Two mechanisms, chosen per case:

1. **`service_role` server functions** (preferred where an app server function already mediates). The TS server function keeps doing validation and orchestration, but the authoritative write runs through `supabaseAdmin` (service_role) or a `service_role`-only RPC. RLS then denies the same write to a direct client. This is the smallest change from today's shape.
2. **`SECURITY DEFINER` RPC that computes the value** (where the value must be derived from server-known inputs inside one transaction — settlement, ELO, ranking). The RPC takes *inputs the user is allowed to assert* (which trade to close, the requested exit) and derives *the authoritative outputs* (fill price, P&L, new balance) itself. `auth.uid()` is the identity, never a caller-supplied `_user_id` (the C-6 lesson).

### 1.3 Price authority

Client-sent prices stop being authoritative for **scored** trades:

- **Market opens/closes:** the server fetches the quote (the `twelveDataQuote` proxy already exists and is used in `openTrade`) and uses the server value, within a tolerance band, not the client's number.
- **SL/TP/stop-out closes:** today the browser monitors (`use-sl-tp-monitor`, `use-risk-monitor`) call `closeTrade` with a client price. The server must validate the trigger against server candle/quote data, not trust `exit_price`.
- **Crypto:** blocked on H-9/MD-12 (Binance unreachable from the deployment). Decision D-6 from the remediation plan still stands; until resolved, crypto scored closes fall back to a tolerance check against the last server-side candle.

### 1.4 Settlement RPC vs unified trading command API — recommendation

**Recommendation: a small set of authoritative RPCs, not a single unified command API.** (Detailed answer in §12.)

- One `SECURITY DEFINER` settlement/open/close RPC family that owns the money invariant.
- Keep the existing TS server functions as the callable surface for the app; they orchestrate and call the RPCs. Do **not** collapse open/close/modify/partial/exit-ladder into one giant RPC — that maximises blast radius and rewrites working code. The `commit_settlement` RPC already exists (unused); Phase 2 expands that idea rather than inventing a new API layer.

---

## 2. Phase 2A / 2B / 2C breakdown

The guiding order is **expand → migrate → contract**: add the authoritative path, move the app onto it, prove it, then remove direct write access last. Contract steps are the only ones that can break a user path, so they come after their own rehearsal, exactly like Phase 1.

### Phase 2A — Profile competitive columns + battle/championship state (lowest risk, no money math)

Closes C-5, N-10, and the profile half of B-4. No settlement logic, so it is the safest first slice.

1. **`profiles` competitive columns** (`elo`, `peak_elo`, `battle_wins`, `battles_played`, `current_battle_streak`, `best_battle_streak`, and re-confirm `xp`, `coins`, `level`, `league`, `rank`, `streak`, `is_premium`): revoke column-level UPDATE from `authenticated`; keep UPDATE only on genuinely user-editable columns (username, display_name, avatar_url, bio, country, timezone, experience, preferred_market(s), trading_style, goals, onboarded, accepted_terms_at). Writers today: `finalize_battle` (service-definer, already writes elo — fine), `awardXpCoins`/`claimDailyLogin` (user client — must move to service path), onboarding/settings/avatar/timezone (user client, non-competitive columns — keep).
2. **Fix `protect_profile_privileged_columns`** (S-6): it reads the legacy `request.jwt.claim.role`. Move to a robust service-role detection, and extend coverage to the competitive columns as defence-in-depth behind the grant change.
3. **`battles` host columns** (N-10): replace the blanket `battles update host` policy with a column-scoped path. A host may edit descriptive fields pre-live (name, description, visibility, allowed_symbols, min/max_participants, timing) but not `status`, `winner_user_id`, `ranked`, `end_at` once live. Status transitions already belong to `tick_battle`/`finalize_battle`. Move `cancelBattle` and `setParticipantReady`'s countdown write behind a `service_role`/definer path.
4. **`battle_participants`** (N-2): tighten `bp update self or host` (add a WITH CHECK so a participant cannot move their row to another battle) and reconsider the `GRANT ALL … TO authenticated` from `20260806095941`.

### Phase 2B — Paper trading settlement authority (the core money path)

Closes C-1 (paper_trades/paper_accounts/account_statistics), C-2, C-3, N-1, and the price half (item 7).

1. **Authoritative RPCs** (expand): `open_trade`, `close_trade`, `partial_close_trade`, `settle` — `SECURITY DEFINER`, `service_role`-executable, identity from `auth.uid()`. Each locks the account row `FOR UPDATE`, applies the NBP clamp, writes `paper_trades` + `paper_accounts.balance/equity` + `account_statistics` + `position_history` in one transaction, and returns the authoritative figures. P&L math stays in TS (`computePnl`, `clampRealizedPnl`) called by the server fn, which passes derived values in; the RPC enforces invariants and status transitions (fixes the C-3 double-close by requiring `status='open'` in the UPDATE's WHERE and raising on zero rows).
2. **App switch:** `openTrade`, `closeTrade`, `partialCloseTrade`, `moveToBreakEven`, `setTradeExits`, exit-leg fills, `resetAccount`, `createAccount` route their authoritative writes through the RPCs / service path. Deploy while the old grants still exist (reversible).
3. **Price authority (item 7):** server-fetched open/close prices with a tolerance band, in **observe mode first** (log client-vs-server delta for ~1 week, enforce after). SL/TP/stop-out closes validated against server candles.
4. **Contract:** revoke INSERT/UPDATE/DELETE on `paper_trades` scored columns, `paper_accounts.balance/equity/starting_balance/nbp`, and `account_statistics` from `authenticated`. Keep column-level UPDATE for the few user-owned columns (`paper_trades.notes`, `tag_ids` while open, cosmetic account fields, `paper_accounts.name/is_archived/default_commission/default_swap`). `position_history` becomes service-write-only.

### Phase 2C — Battle/championship trade attribution, replay-battle P&L, prop challenges

Closes N-1/N-3 fully, B-7, P-1..P-5, C-4/N-12 residue.

1. **Trade attribution** (N-1/N-3): once `paper_trades` writes go through RPCs, `battle_id`/`championship_id`/`opened_at`/`created_at` are server-set, so the "UPDATE after INSERT bypasses rules" hole closes. The rules triggers can then be simplified or made UPDATE-aware.
2. **Replay-battle P&L** (B-7, the one cross-domain case): `recordBattleReplayTrade` stops accepting `pnl`; the server recomputes it from the stored replay dataset at the recorded cursor, then settles through the 2B RPC. Requires the dataset candles to be server-stored and immutable for the battle.
3. **Prop challenges** (P-1..P-6): `prop_challenges`/`prop_challenge_days` become SELECT-only for owners; `status`, `result`, equity, breach and completion fields, and `paper_account_id` move behind a `tick_prop_challenge` service path plus a server evaluator job (P-3). Creation validates the linked account (P-2).
4. **Championship rankings / rewards backfill** and any data remediation (C-8) land here, after writes are locked.

---

## 3. Safest first implementation slice

**Slice 0 (recommended first): `profiles` competitive-column lockdown (Phase 2A item 1 + 2).**

Why it is safest:

- **No money math, no settlement, no price authority.** It is a grant + trigger change, the same class Phase 1 rehearsed successfully.
- **Small, well-understood writer set.** Q-A5/source show the only legitimate writers of `elo`/`xp`/`coins` are `finalize_battle` (service-definer, unaffected) and `awardXpCoins`/`claimDailyLogin` (which are **already broken** by the protect trigger per S-6/Q-D4, so moving them to a service path is a fix, not a regression).
- **Directly closes a CONFIRMED critical (C-5):** self-set ELO on the global leaderboard.
- **Reuses the Phase 1 machinery:** rehearse on the `THIVE ARENA - PHASE1 REHEARSAL` remix, same drift-guarded apply/rollback pattern.

Its contract step (revoke competitive-column UPDATE) has near-zero user impact: no legitimate UI writes those columns from the client.

**Deliberately not first:** anything touching `paper_trades`/`paper_accounts` settlement (2B), because that is the highest-traffic path and the money invariant; it needs the authoritative RPCs and observe-mode price work first.

---

## 4. Migrations required (by phase; none to run now)

Each migration follows the Phase 1 pattern: a drift-guarded `DO` block, an exact rollback file, rehearsed on the remix first.

**Phase 2A**

- `2A-1_profiles_competitive_grants.sql` — `REVOKE UPDATE (elo, peak_elo, battle_wins, battles_played, current_battle_streak, best_battle_streak, xp, coins, level, league, rank, streak, is_premium) ON public.profiles FROM authenticated` (column-level), keeping table UPDATE for the user-editable columns.
- `2A-2_protect_profile_trigger.sql` — replace `protect_profile_privileged_columns` (fix S-6 role detection; extend to competitive columns).
- `2A-3_award_xp_coins_rpc.sql` — `award_xp_coins(...)` service-role RPC, idempotent on `(source, source_id)` (also fixes B-4 revert half).
- `2A-4_battles_host_columns.sql` — replace `battles update host` with a column-scoped policy + a trigger blocking status/winner/ranked/end_at changes by non-service callers.
- `2A-5_battle_participants_check.sql` — add WITH CHECK to `bp update self or host`; review `GRANT ALL`.

**Phase 2B**

- `2B-1_settlement_rpcs.sql` — `open_trade` / `close_trade` / `partial_close_trade` (+ retire/repurpose the unused `commit_settlement`), service-role only, `SET search_path=public`.
- `2B-2_paper_trades_contract.sql` — revoke scored-column write from `authenticated`; per-command policies replacing `own trades FOR ALL`; keep column UPDATE for notes/tag_ids.
- `2B-3_paper_accounts_contract.sql` — revoke `balance/equity/starting_balance/negative_balance_protection` write; keep cosmetic columns.
- `2B-4_account_statistics_contract.sql` + `2B-5_position_history_contract.sql` — SELECT-only for owner.

**Phase 2C**

- `2C-1_replay_battle_settlement.sql`, `2C-2_prop_challenge_rpcs.sql`, `2C-3_prop_tables_contract.sql`, `2C-4_rankings_contract.sql`, plus a `prop-evaluate` cron hook.

**Cross-cutting (separate track, already drafted):** `default-privileges.proposed.sql` from Phase 1 — needed so future `CREATE FUNCTION`/tables don't re-open access (risk R4). Decide before or alongside 2B.

---

## 5. Application files that must change (by phase)

**2A**
- `src/lib/gamification.functions.ts` — `awardXpCoins`, `claimDailyLogin` → `award_xp_coins` RPC (service path).
- `src/lib/battle-arena.functions.ts` — `cancelBattle`, `setParticipantReady` countdown write, and confirm `createBattle`'s status set stays within the new policy.
- `src/routes/onboarding.tsx`, `src/routes/_authenticated/settings.index.tsx`, `AvatarUpload.tsx`, `TimezoneSuggestionModal.tsx` — confirm they only touch user-editable columns (they do today); no change expected, but they're the regression surface.

**2B**
- `src/lib/paper-trading.functions.ts` — `openTrade`, `closeTrade`, `partialCloseTrade`, `moveToBreakEven`, `resetAccount`, `createAccount`, `setTradeExits`, `updateAccount`; delete the module-private `commitSettlement` in favour of the RPC.
- `src/lib/paper-trading/settlement.ts` — stays the pure-math source; called by the server fn.
- `src/hooks/use-sl-tp-monitor.tsx`, `src/hooks/use-risk-monitor.tsx` — SL/TP and stop-out closes send a *request to close*, not an authoritative price.
- `src/lib/chart-trading/persist.ts` + `ChartTradingOverlay.tsx` — chart-placed paper trades use the same RPC path.
- `src/lib/journal/settings.ts` (`saveAccountCosts`) — cosmetic columns; keep, but re-verify against the new grant.

**2C**
- `src/lib/battle-replay.functions.ts` — `recordBattleReplayTrade` recompute+settle.
- `src/lib/prop-challenges.functions.ts` — `createPropChallenge`, `tickPropChallenge`, `abandon/deletePropChallenge` → service path; add server evaluator.

**Untouched on purpose (practice domain):** `src/lib/chart/orders/*` (`trade-sync`, `replay-trade-sync`, `order-sync`), `src/lib/replay*.functions.ts`, `replay_sessions`/`replay_events`/`chart_closed_trades` writers. These are the synthetic-price practice domain and must keep client authority.

---

## 6. Tests required before production

Reuse the Phase 1 harness: rehearse on the remix, real JWTs for anon/USER_A/USER_B, drift-guarded apply/rollback.

**Database / authorization tests** (per contract migration):
- Direct PostgREST UPDATE of each locked column by `authenticated` → `42501`/policy violation, asserting the specific SQLSTATE (JR-3 rule).
- Retained columns still writable (notes, tag_ids, cosmetic account fields, user-editable profile fields).
- Service path still writes all columns.

**Settlement invariant tests** (2B):
- Concurrent close of the same trade → exactly one settlement (C-3).
- Concurrent settlements on one account → no lost update (row lock).
- `starting_balance + Σ closed pnl = balance` holds; NBP clamp table from `.memlog.md` parametrised.

**Race-condition tests:**
- Two `close_trade` calls racing (row lock + status guard).
- `tick_battle`/`finalize_battle` racing a settlement.
- Matchmaking `_join_battle_as` ×2 under concurrent ticks (already covered by SKIP LOCKED; re-verify).

**Price-authority tests** (2B item 3):
- Close with an out-of-tolerance client price → rejected (enforce mode); logged only (observe mode).
- SL/TP fill inside the candle range accepted; outside rejected.

**Application smoke** (the Phase 1 app-smoke pattern, extended): open/close/partial-close a trade and assert the balance/stats invariant; battle create/join/tick; journal tag flow; **Replay Studio practice trade still works with a client price** (proves domain separation preserved); prop challenge create/tick.

**Regression:** full `bun run test` (62 suites) + Playwright, pointed at the test project (fixes T-2).

---

## 7. Backward-compatibility risks

| Risk | Detail | Mitigation |
|---|---|---|
| **BC-1 Hidden client writers** | A component writing a now-locked column directly (not via a server fn). Source sweep found the scored writers are all in `*.functions.ts`, but a full grep per column is required before each contract step. | Pre-contract grep; observe period; per-column rollback |
| **BC-2 Replay domain caught by mistake** | Locking `paper_trades` must not touch `chart_closed_trades`; a migration that over-reaches would break Replay Studio. | Migrations name tables explicitly; Replay practice smoke test is a gate |
| **BC-3 `resetAccount` / `createAccount`** | Both currently write `paper_accounts` and `account_statistics` directly as the user. Must move to the service path in the same slice that locks those tables, or they break. | Sequence: switch these before their contract migration |
| **BC-4 Exit-leg fills & stop-out** | `use-risk-monitor` auto-closes on stop-out with a client price; exit legs fill client-side. Both must move to the close RPC before `paper_trades` is locked. | Include in 2B app-switch, not after |
| **BC-5 `commit_settlement` already contained** | Phase 1 revoked it; the app never called it. The 2B RPCs replace its role. Don't accidentally re-grant it. | 2B-1 supersedes it explicitly |
| **BC-6 Default privileges** | A future migration that `DROP`+`CREATE`s a locked function/table re-applies anon/authenticated defaults (R4). | Land `default-privileges.proposed.sql` before wide 2B rollout |
| **BC-7 Journal integration** | `create_journal_draft_from_trade` trigger copies `paper_trades` → `journal_entries` on close; must keep firing under the service write path (it will — triggers run as table owner). | Journal smoke test after each 2B step |
| **BC-8 Autosave/resume** | Replay autosave (`replay_sessions`) is in the practice domain and untouched; verify no scored table is on that path. | Confirmed in source; re-verify |

---

## 8. Deployment sequence (per slice, mirrors Phase 1)

1. Finalise migration + exact rollback; rehearse on the remix (apply → verify → rollback → re-apply); run DB + authz + app smoke.
2. Deploy the app change that moves writes to the service path (expand). Old grants still present → reversible by revert.
3. Observe (for price authority, ~1 week log-only).
4. Production read-only preflight (drift guards) → owner approval → apply the contract migration one atomic block at a time with verification.
5. Post-change: anon/authenticated probes (nonexistent IDs) + owner live check + cron health.
6. Only then start the next slice.

---

## 9. Replay Studio: synthetic vs scored (explicit separation)

| Aspect | Replay Studio (practice) | Competitive / scored |
|---|---|---|
| Table | `chart_closed_trades` (+ `replay_sessions`, `replay_events`) | `paper_trades` (+ accounts, stats, rankings) |
| Price source | **Client engine over a shared historical tape — synthetic/user-driven by design** | Server-fetched quote / server candle, tolerance-checked |
| P&L authority | Client (`runObservation`) — acceptable | Server RPC |
| Leaderboard/ELO | Never | Yes |
| Analytics | Explicitly excluded (`replay_session_id` filter) | Included |
| Phase 2 action | **No change. Preserve client authority.** | Locked behind RPCs |
| Exception | **Replay *battles*** write to `paper_trades` (scored) via `recordBattleReplayTrade`; unranked by constraint. §2C recomputes P&L server-side. | — |

The remediation plan's finding **B-10/BA-6** (chart-placed and replay-engine trades don't count toward battles) is the deliberate firewall between these domains and stays that way; it is not a Phase 2 target.

---

## 10. Rollback & data-cleanup implications

- **Rollback:** every contract migration ships an exact inverse (Phase 1 pattern), rehearsed. App changes roll back by `git revert` (never force-push; Lovable-synced branch).
- **Data cleanup (C-8):** only after writes are locked (end of 2B / in 2C), so cleaned data can't be re-forged. The Phase 0 forensics queries (Q-I*) are the detector; contaminated rows (BA-5 $71M drift, BA-11 $180 drift, N-12 tie-rank rewards, out-of-window trades) are voided/annotated per product decision D-7, backed up to `remediation_backup` first, then rankings recomputed. **No data is changed in Phase 2 planning.**

---

## 11. Summary answers to the eight requested items

1. **Target architecture** — §1: two trust domains (scored vs practice) already separated by table; lock scored tables behind service-role/`SECURITY DEFINER` authority with `auth.uid()` identity and server-derived prices; leave the Replay practice domain client-authoritative.
2. **2A / 2B / 2C** — §2: 2A profiles + battle/championship state (no money math); 2B paper-trading settlement authority + price authority; 2C replay-battle P&L, prop challenges, attribution, cleanup.
3. **Safest first slice** — §3: `profiles` competitive-column lockdown (grant + trigger; closes C-5; near-zero user impact; reuses Phase 1 machinery).
4. **Migrations** — §4.
5. **App files** — §5.
6. **Tests before production** — §6.
7. **Backward-compatibility risks** — §7.
8. **Separate settlement RPC vs unified command API** — §12 below.

---

## 12. Settlement RPC vs unified trading command API

**Recommendation: expand the settlement-RPC family; do NOT build a single unified command API.**

| | Focused settlement RPCs (recommended) | Unified trading command API |
|---|---|---|
| Shape | `open_trade` / `close_trade` / `partial_close_trade` (+ `award_xp_coins`, `tick_prop_challenge`), each owning one invariant; TS server fns orchestrate | One RPC (or one endpoint) taking a command type + payload, dispatching server-side |
| Blast radius | Small; each RPC replaces one existing write path | Large; rewrites every trading path at once |
| Reuses today's code | Yes — TS server fns and pure math (`settlement.ts`, `computePnl`) stay; `commit_settlement` already exists as the template | No — new dispatch layer |
| Rollback granularity | Per RPC / per slice | All-or-nothing |
| Matches the remediation plan | Yes (plan Phase 2A "settlement RPCs") | No |
| Risk | Lower | Higher |

A unified command API is an appealing end-state for consistency, but it maximises production risk for a system that must stay live and Lovable-synced. The focused RPCs deliver the same guarantee (no client-authoritative scored write) incrementally, each independently rehearsable and reversible, which is the property Phase 1 proved works here. If a unified API is wanted later, it can wrap the focused RPCs once they exist.

---

## 13. What is explicitly NOT in Phase 2 (per remediation plan)

Championship scheduler (B-5), AI rate limiter / N-20 (S-7), historical ingestion (N-13), reward *scheduling* beyond the payout-authority fix, and all Phase 0 items outside score/account authority remain their own workstreams. Phase 2 touches them only where a shared write path forces it (e.g. `finalize_battle` already writes ELO).

---

## 14. Implementation progress & continuation marker

**Rehearsal target:** `THIVE ARENA - PHASE1 REHEARSAL` (`a4d32bcf-1960-4144-a713-666d55dc26b5`, cluster `7678069749886157684`). **Production untouched.**

### Completed & rehearsed
- **Increment 1 — profile competitive integrity + authoritative rewards — COMPLETE (DB + callers + test, green on rehearsal).**
  - DB: `docs/migrations/remediation/phase2/I1_profile_integrity_rewards.sql` (+ `I1_rollback.sql`). Applied to rehearsal; apply→rollback→re-apply verified; rehearsal left in the applied state.
    - I1a: `profiles` UPDATE restricted to user-editable columns (revoke table UPDATE, grant column list). Competitive columns (elo, peak_elo, battle_wins, battles_played, current/best_battle_streak, xp, coins, level, league, rank, streak, is_premium) no longer client-writable.
    - I1b: `protect_profile_privileged_columns` now detects trusted context via `current_user IN (postgres, service_role, supabase_admin)` (fixes S-6) and freezes the full competitive set for other roles.
    - I1c: partial unique idempotency indexes on `xp_transactions`/`coin_transactions` `(user_id, source, source_id)`.
    - I1d: `award_xp_coins(uuid,int,int,text,uuid,text)` SECURITY DEFINER, service_role-only, idempotent, mirrors `applyXp`/`xpForLevel`/league thresholds; emits only valid `league` enum values.
  - Callers migrated: `src/lib/gamification.functions.ts` — `awardXpCoins` helper now calls the RPC via `supabaseAdmin` (all 3 sites: challenge, daily-login, achievement); `claimDailyLogin` streak write moved to the service client. Unused imports removed. `bun run typecheck` = 0.
  - Test: `src/lib/gamification/__tests__/reward-rpc-parity.test.ts` (RPC-vs-applyXp leveling & league parity) — 3/3 pass.
  - Closes: **C-5**, **S-6**, and the **B-4 revert-half** (reward writes now land). Deferred to battle/championship increments: wiring `finalize_battle`/`finalize_championship` to actually *pay* via `award_xp_coins` (B-4 payout-half) — those SQL functions are reworked in the battle/championship increments anyway.
  - Discovered facts recorded: `xp/coin_transactions.source_id` is `uuid`; app `league` key `legend` has no DB enum member (`grandmaster`) — latent write bug at level ≥ 100, out of scope, noted for the reconciliation report.

### Completed & rehearsed (continued)
- **Increment 2 (core) — settlement RPCs — CORE COMPLETE (DB + invariant/double-close/clamp tests, green on rehearsal); callers + open_trade + price provider + table contract still open.**
  - DB: `docs/migrations/remediation/phase2/I2_settlement_core.sql` (+ `I2_settlement_core_rollback.sql`). Applied to rehearsal; rollback (DROP) verified; re-applied. service_role only (authenticated cannot execute).
    - `close_trade(_trade_id,_user_id,_exit_price,_raw_pnl,_rr_realized,_close_reason,_closed_at)`: locks trade+account `FOR UPDATE`, requires `status='open'` (double-close raises P0001 → settles exactly once), clamps loss against the LOCKED balance (NBP), sets `manual→liquidation` on clamp, writes trade+balance/equity+`account_statistics`+`position_history` atomically. Returns clamped pnl + new balance.
    - `partial_close_trade(...)`: money-only realization (countsAsTrade=false), NBP clamp, atomic.
    - `_apply_settlement_stats(...)`: SQL mirror of `nextStatistics` (win/loss/breakeven/gross/net/best/worst).
  - Rehearsed: full win close (+250→bal 10250), partial (-100→bal 10150, trade stays open, counters unchanged), three-way invariant `balance-start==net_pnl` on two accounts, double-close RAISES, catastrophic loss clamps to 0 with reason `liquidation`. All PASS.
  - Design confirmed: P&L computed in TS from a SERVER-derived price and passed as `_raw_pnl`; the RPC owns clamp + atomicity + status guard. `_user_id` is caller-supplied but safe because the function is service_role-only (Phase-1 lesson) and the trusted server fn sets it from the verified JWT.
  - NOT yet done in Increment 2: `open_trade` RPC; the Kraken trusted crypto price provider + fail-closed scored-price resolver (D-6); caller migration of `openTrade`/`closeTrade`/`partialCloseTrade`/`moveToBreakEven`/`resetAccount`/`createAccount`/`setTradeExits`+exit fills/`use-sl-tp-monitor`/`use-risk-monitor`/`chart-trading persist`; the `paper_trades`/`paper_accounts`/`account_statistics`/`position_history` table contract (lockdown). True 2-session concurrency test (single-session proved the status guard; run a two-session race before production).

### Completed & rehearsed (continued)
- **Increment 2b — `open_trade` + extended `partial_close_trade` + scored price authority + caller migration — COMPLETE (green on rehearsal).**
  - DB: `I2b_settlement_open_and_partial.sql` (+ `I2b_rollback.sql`). `open_trade(_user_id,_account_id,_entry_price,_fields,_opened_payload)` — whitelisted insert, ownership check, `opened` position_history with merged margin/liq payload; extended `partial_close_trade(...7 args...)` reduces lot AND realizes money atomically. service_role only. Applied to rehearsal.
  - Price authority: `src/lib/market-data/scored-price.server.ts` — crypto→Kraken Ticker (timeout, fail closed), FX/other→Twelve Data proxy; **no client-price fallback**. Test `scored-price.test.ts` 7/7.
  - Callers: `paper-trading.functions.ts` — `openTrade`/`closeTrade`/`partialCloseTrade` derive the fill price server-side (`resolveScoredPrice`) and settle via RPC; `createAccount`/`resetAccount` route money + `account_statistics` through `supabaseAdmin`. Retired `loadAccountMoney`/`commitSettlement`. SL/TP + stop-out hooks and `chart-trading/persist` unchanged (they call `closeTrade`, now server-priced). Typecheck 0.
  - Rehearsed: open/close/invariant/double-close/NBP-clamp/partial all PASS; self-cleaned. Commit `d806e654`.
- **Increment 2c — money/stats/scored table contract — COMPLETE (green on rehearsal).**
  - DB: `I2c_contract.sql` (+ rollback). Drift-guarded. `paper_accounts`: revoke INSERT; UPDATE limited to config/cosmetic (balance/equity/starting_balance/battle_id/championship_id locked). `account_statistics`: SELECT-only. `paper_trades`: UPDATE limited to stop_loss/take_profit/notes/deleted_at (scored columns locked). **INSERT deferred** (battle-replay still inserted then).
  - Caller: `prop-challenges.functions.ts` provisions the linked account via `supabaseAdmin`.
  - Rehearsed under `SET ROLE authenticated`: every money/stats/scored write denied (42501), every management write allowed; rollback restores full grants and was re-applied. Commit `7219a94e`.
- **Increment 2d — authoritative battle-replay P&L + `paper_trades` INSERT lock — COMPLETE (green on rehearsal).**
  - DB: `I2d_battle_replay_authoritative.sql` (+ rollback). `record_battle_replay_trade(_user_id,_battle_id,_account_id,_fields)` — service-role RPC: ownership/battle/unranked/symbol checks + **price authority** (entry/exit must sit inside the dataset candle low..high; no candle → refused); inserts the closed row (trigger `enforce_battle_rules_on_trade` still fires). Then `REVOKE INSERT ON paper_trades FROM authenticated`.
  - Caller: `battle-replay.functions.ts` recomputes P&L server-side (discards client pnl/rr; equals engine number for admitted symbols) and inserts via the RPC.
  - Rehearsed with seeded candle/battle/account: valid insert; out-of-range entry/exit, symbol mismatch, wrong owner, no-candle all refused; authenticated INSERT denied; self-cleaned. Commit `a56d6148`.

**Settlement spine COMPLETE.** All paper-trade money writes (open/close/partial/battle-replay) are service-role authoritative; money/stats/scored columns and INSERT on `paper_trades` are locked to `authenticated`.

### Completed & rehearsed (continued)
- **Increment 3a — battle reward payout (B-4) — COMPLETE (green on rehearsal).** `I3a_finalize_battle_rewards.sql` (+ rollback). `finalize_battle` now credits XP/coins via `award_xp_coins` and moves ELO only when eligible = ranked AND ≥2 distinct participants; ineligible (unranked/replay/solo-ranked) records 0 awards and no ELO. Rehearsed: 2-player pays winner/runner + ELO (via xp/coin_transactions.delta), solo/unranked pay nothing, re-finalize no-ops. Commit `e30e5ce3`.
- **Increment 3b — championship reward payout fix + gate — COMPLETE (green on rehearsal).** `I3b_finalize_championship_rewards.sql` (+ rollback). Fixes a real bug (rewards were ledgered but never credited to `profiles`) by routing through `award_xp_coins`; gates rewards/rating/hall-of-fame/titles on ≥2 distinct participants (championships have no `ranked` flag). Rehearsed: 2-player credits profile balance + rating + HoF, solo mints nothing/no winner, re-finalize no-ops. Commit `c397b4aa`.

**Reward-eligibility policy (user decision, applies to both):** pay only for a genuinely competitive field — **ranked AND ≥2 distinct participants** for battles; **≥2 distinct participants** for championships. Solo/unranked/replay record results but pay nothing and move no rating.

### >>> CONTINUATION MARKER — resume here <<<
**Next task: Prop challenges — authoritative evaluation + cron.**

1. Audit `prop-challenges.functions.ts` + `prop-challenges/evaluator.ts` + prop SQL (`evaluateChallenge`, any `evaluate_prop_*` RPC, daily-loss/drawdown/target checks): ensure pass/fail/breach is computed server-side from authoritative `paper_trades`/account state (not client-submitted), status transitions are idempotent, and any payout/title uses `award_xp_coins`. Account provisioning already routed to `supabaseAdmin` (I2c).
2. Then: journal privacy (S-2 token RPC) → caller-supplied-ID definers (N-15) → historical ingestion (N-13 zero-progress, pagination, timeouts, session-gaps) → cron lifecycle → email noop/stuck → grants/default-privileges → tests/CI → reconciliation report (D-7, report only).

**Follow-ups noted (not blockers):** `position_history` left owner-writable (documented); battle tie at rank 1 picks winner by LIMIT 1 (documented); prod `historical_candles` coverage for replay datasets must be verified in the production preflight (the replay RPC fails closed without candles); app-level anti-alt-account farming for ranked battles/championships is out of scope (the ≥2 guard only stops single-participant farming).

**Rehearsal DB state at this marker:** Phase 1 containment + Increment 1 + Increment 2 (core/2b/2c/2d) applied; no synthetic data; paper tables empty. **Production untouched.**

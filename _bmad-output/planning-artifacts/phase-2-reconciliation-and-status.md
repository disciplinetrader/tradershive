# TradersHIVE Remediation — Reconciliation & Status (Phase 2 capstone)

**Date:** 2026-09-18 · **Author:** security remediation (Claude) · **Branch:** `claude-tradershive-audit`
**Rehearsal DB:** `THIVE ARENA - PHASE1 REHEARSAL` (`a4d32bcf-1960-4144-a713-666d55dc26b5`, cluster `7678069749886157684`)
**Production (`237f7325-…`): UNTOUCHED by Phase 2.** Only Phase 1 containment (function EXECUTE revokes) was applied to production, earlier and with explicit approval.

This is a **report** — it performs no data writes. It reconciles what has been implemented and rehearsed, states what remains, gives the production deployment order, and frames the two open product decisions (reward eligibility — already answered; D‑7 historical contamination — pending).

---

## 1. What is implemented and rehearsed (all green on the non-production DB)

Every increment below was applied to the rehearsal DB, verified, **rollback-tested, and re-applied**, and committed. TypeScript changes pass `bun run typecheck`; new vitest suites pass. Rehearsal synthetic data is cluster-guarded and self-cleaning (zero residue confirmed after each run).

| Inc | Area | What changed | Commit |
|-----|------|--------------|--------|
| I1 | Profile integrity + rewards (C‑5, S‑6, B‑4 half) | `profiles` competitive columns locked; `protect_profile_privileged_columns` trusted-context detection; idempotent `award_xp_coins`; gamification callers routed through it | `73a50db5`, `b1f1caf9` |
| I2 core | Settlement spine | `close_trade` / `partial_close_trade` / `_apply_settlement_stats` (atomic, NBP clamp, status-guarded, service-role) | `c258f8bc` |
| I2b | open + price authority | `open_trade`, extended `partial_close_trade`; `scored-price.server` (Kraken crypto / Twelve Data, **fail-closed**); paper-trading callers settle via RPC with a server-derived price | `d806e654` |
| I2c | Money/stats contract | Revoke authenticated write on `paper_accounts` money cols, `account_statistics`, `paper_trades` scored cols; prop account provisioning → `supabaseAdmin` | `7219a94e` |
| I2d | Battle-replay authority + INSERT lock | `record_battle_replay_trade` (ownership + unranked + **price-in-candle-range** authority); server-recomputed P&L; `REVOKE INSERT ON paper_trades FROM authenticated` | `a56d6148` |
| I3a | Battle reward payout (B‑4) | `finalize_battle` pays XP/coins + moves ELO only when **ranked ∧ ≥2 participants** | `e30e5ce3` |
| I3b | Championship reward fix | `finalize_championship` now actually credits profiles (was ledger-only) via `award_xp_coins`; gated on **≥2 participants** | `c397b4aa` |
| I3c | Prop authoritative results | prop verdict persisted service-role; authenticated INSERT/UPDATE on `prop_challenges`/`prop_challenge_days` revoked | `4fabfaf5` |
| I3d | Journal share privacy (S‑2) | `get_shared_journal_entry(token)` RPC; dropped the enumerable anon read policy | `266448d9` |
| I3e | Caller-identity definers (N‑15) | `record_practice_activity` identity guard + anon revoke; `journal_sync_tag_arrays_for` restricted to service_role | `15f6b347` |
| I3f | Battle finalize after end (B‑1) | non-host tick/cron may settle a battle once `end_at` has passed | `76205c3e` |
| N‑13 | Zero-progress detection | forward-empty streak + one-shot `ingestion_frozen` alert (detectability, not a cause fix) | `2358747a` |
| Def-priv | Future-object hardening (D‑1/N‑5/N‑8) | `ALTER DEFAULT PRIVILEGES` D1/D3/D5 rehearsed (postgres); D2/D4/D6 blocked by K1 | `288ffb97` |

**Trust-domain separation held throughout:** practice (`chart_closed_trades`, `replay_sessions`) stays client/replay-priced and untouched; scored trading is server-authoritative; battle **replay** is the crossover — unranked, server-recomputed P&L bounded to the dataset candle.

---

## 2. Reward-eligibility decision (answered by the user)

Pay only for a genuinely competitive field:
- **Battles:** ranked **and** ≥2 distinct participants.
- **Championships:** ≥2 distinct participants (no `ranked` flag exists).
- Unranked / replay / solo record results but pay nothing and move no rating/ELO.

Implemented in I3a/I3b. Residual (out of scope, noted): the ≥2 guard stops single-participant farming but not two-real-account collusion — app-level alt-account defence is a separate product effort.

---

## 3. Production deployment order (when approved)

Migrations live under `docs/migrations/remediation/phase2/` (each has a matching `*_rollback.sql`). Apply as `postgres`, DDL and any DO-block test in **separate** statements (a failing DO block rolls back CREATEs in the same tx). "expand → migrate → contract": the code that routes writes through the RPCs must ship **before** the column locks.

1. **Ship the application code** (this branch) so every writer already uses the RPCs / `supabaseAdmin` and the token RPC. Locks before this would break live writers.
2. `I1_profile_integrity_rewards.sql`
3. `I2_settlement_core.sql` → `I2b_settlement_open_and_partial.sql`
4. `I2d_battle_replay_authoritative.sql` **before** `I2c` is not required, but `record_battle_replay_trade` must exist before the `paper_trades` INSERT revoke (the INSERT revoke lives inside I2d, after the RPC create — apply I2d as one unit).
5. `I2c_contract.sql` (money/stats/scored-col locks). *(I2c and I2d together complete the paper_trades contract; apply I2c then I2d, or I2d’s INSERT revoke will precede the scored-col locks — order I2c → I2d.)*
6. `I3a` → `I3f` (battle), `I3b` (championship), `I3c` (prop), `I3d` (journal), `I3e` (definers).
7. **Before** default-privileges: record the K3 rule in AGENTS.md / Lovable project knowledge (new authenticated RPCs need explicit `GRANT EXECUTE … TO authenticated`). Then `default-privileges.proposed.sql` D1/D3/D5. D2/D4/D6 need Supabase support (K1).
8. Post-deploy: run the production smoke checks (logged-in open/close/partial, battle create/join/settle, prop tick, journal share by token, anon cannot enumerate).

Rollback for any step is its paired `*_rollback.sql`, applied in reverse dependency order (contract rollbacks re-grant before the RPCs are dropped).

---

## 4. Remaining items that can only be done against production / live infra

These are **not** rehearsable in the copied DB (no data, no provider credentials, no cron/secrets) and are honestly reported as open:

- **N‑13 root cause (High).** Symptom CONFIRMED (success + 0 bars, frozen front edges). Detectability added (I3f/N‑13 alert). **Cause still requires production diagnosis:** read `historical_sync_logs` for the latest cron run, check Twelve Data plan credits, and re-test the egress 403 (CX‑1) — candidate causes are provider coverage, plan limit, egress, or `confirmedEmpty` misclassification. Do this in the read-only production preflight.
- **O‑2 cron inventory / B‑9 (Med).** Confirm which finalizer crons exist (`SELECT jobid, jobname, schedule, active, <redacted command> FROM cron.job`), keep one finalizer path, add HTTP-outcome monitoring (`net._http_response`). Both finalizers are idempotent (`FOR UPDATE` + status guard), so this is hygiene, not a live hole.
- **O‑1 email (Med).** `email/service.server.ts` marks `noop`-provider jobs `sent` (should be `skipped`), and nothing reaps `processing` jobs. Small, self-contained code fix + a TTL reaper; confirm `EMAIL_PROVIDER` in production first. Not started — no rehearsable surface here.
- **O‑3 secrets inventory (Med).** Produce the production secrets inventory (service role, cron secrets, Twelve Data, Lovable AI, Finnhub, email). Ops task.
- **Prop expiry cron.** `tickPropChallenge` is HUD-driven only; an over-duration challenge never auto-expires. Add a `prop-evaluate` cron or fold expiry into the settlement path (plan item 5.3).
- **Default-privileges D2/D4/D6.** Blocked by K1 (postgres ∉ supabase_admin); needs Supabase support. Affects only supabase_admin-created objects, not app functions.

---

## 5. D‑7 — historical contamination reconciliation (product decision, report-only)

**Do not alter suspicious historical data yet.** Once the fixes above are in production (so nothing can be re-forged), reconcile:

1. **Baseline vs post-fix:** re-run the Phase 0 `0C` integrity queries and diff against the Phase 0 baseline (`phase0-results/`). The fixes now close the forge vectors, so a post-deploy diff isolates *historical* contamination from anything new. Contamination vectors now closed: client-supplied P&L (settlement RPCs), forged balances/stats (I2c), forged paper_trades inserts (I2d), unpaid/forgeable rewards (I3a/I3b/I3c), enumerable journals (I3d), cross-user practice streaks (I3e).
2. **Suspicious sets to quantify (read-only):** trades whose stored `pnl` disagrees with a server recompute from `entry/exit/lot`; accounts whose `balance − starting_balance ≠ account_statistics.net_pnl`; battle/championship results with <2 real participants that nonetheless minted rewards/ELO; prop `passed` challenges that fail the 0C‑6 re-evaluation.
3. **Decision D‑7 (needs the user):** for flagged records — **void-and-recompute**, **annotate**, or **leave in place**. Hard deletion is not an option. Mechanics when chosen: copy to `remediation_backup.<table>_<date>`, mark `void_reason` (excluded by ranking fns) rather than delete, call `recompute_*_ranking` per event, rebuild ELO from `elo_history`.

This step is deliberately unstarted pending (a) production deployment of the fixes and (b) the D‑7 choice.

---

## 6. Honest status line

**FULL REMEDIATION REHEARSAL = PARTIAL PASS.** Every score/economy/settlement/auth integrity item in scope (Increments 1–3f + default-privileges D1/D3/D5) is implemented, rehearsed, rollback-tested and committed, with production untouched. **Not** claimed as done: the live-only ops items in §4 (N‑13 root cause, cron/email/secrets inventories, prop-expiry cron, supabase_admin default privileges) and the D‑7 historical reconciliation in §5, none of which are verifiable in the rehearsal environment. Those are reported, not fabricated.

**Next actions requiring the user:** (a) approve production deployment in the §3 order; (b) run the read-only production preflight for N‑13/O‑2/O‑3; (c) decide D‑7 after the fixes are live.

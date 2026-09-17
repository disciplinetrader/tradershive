# Phase 1: Containment rehearsal (G-8)

**Status:** plan prepared. **No rehearsal has run, and nothing has been executed anywhere.**

| Covers | File |
|---|---|
| Function EXECUTE containment | `containment.sql` (C0, C1a, C1b, C1c, C2) |
| Its rollback | `rollback.sql` (R1a, R1b, R1c, R2) |
| Default privileges (separate track, §7) | `default-privileges.proposed.sql`, `default-privileges.rollback.sql` |
| Evidence baseline | `docs/migrations/remediation/phase0-results/2026-09-17_*.csv` |

> **Production is out of scope for this document.** Every command below runs
> against the **rehearsal copy**. Production gets the same steps only after
> §8's success criteria are met and the owner approves a window.

---

## 1. Rehearsal environment

### 1.1 What the copy must be

A **separate database** that nobody uses in production, with:

1. The same application code as production (commit `24edd5ef` + any later
   Lovable commits), deployed to its **own** URL.
2. The **same function privileges** as production for the 8 target functions.
   This is what the rehearsal tests, so parity is mandatory (§1.3).
3. The same function bodies, triggers and policies as production (Q-C1, Q-D2, Q-A2 parity).
4. **No cron jobs pointing at production.** pg_cron jobs live in `cron.job`
   and hard-code `https://tradershive.lovable.app`. A copy that carries them
   would call production hooks.
5. **Two test users** (A, B) plus anonymous access. No production personal data.

### 1.2 How to obtain it (owner decision, plan D-2)

| Option | How | Caveats |
|---|---|---|
| **A: Lovable remix (recommended)** | Remix project THIVE ARENA into a new, private project (`remix_project`). Enable its Cloud database. | Confirm what the remix copies: code only, or also the database and migrations. Hand-applied SQL (`docs/migrations/*.sql`, e.g. the journal tag functions) is **not** in `supabase/migrations/` and may be missing. Uses workspace credits. |
| B: Separate Supabase project | Apply `supabase/migrations/` in order, then the hand-applied files per `docs/migrations/README.md` | More setup work. Same parity reconciliation needed. |
| C: Production | — | **Not allowed** for rehearsal |

### 1.3 Parity check and reconciliation (on the copy only)

Run on the copy, read-only, and save the results to `phase1-results/rehearsal/`:

| Query (from `docs/migrations/remediation/phase0/`) | Must match production file |
|---|---|
| `Q-00a-current-role.sql` | `run_as = postgres` |
| `Q-B1-function-privileges.sql` | `2026-09-17_Q-B1.csv` rows for the 4 captured functions: **identical `raw_acl` entry set** |
| `Q-B2-secdef-callable-map.sql` | `2026-09-17_Q-B2.csv`: `social_follow_counts`, `journal_sync_tag_arrays_for`, both `journal_*_trg` present with public/anon/authenticated = true |
| `Q-B3-default-privileges.sql` | `2026-09-17_Q-B3.csv` (needed for §7 only) |
| `Q-C1-function-body-fingerprints.sql` | 22 MATCH, `join_battle(uuid)` LIVE MISSING |
| `Q-D2-score-table-triggers.sql` | Same trigger set (journal tag triggers are on `journal_entry_tags` / `journal_tags`; check they exist with `SELECT tgname FROM pg_trigger WHERE tgname IN ('journal_entry_tags_sync','journal_tags_rename_sync')`) |
| `Q-G1-cron-inventory-redacted.sql` | **0 rows, or no row targeting `tradershive.lovable.app`.** If any exist, stop and unschedule on the copy before continuing. |

**If the copy differs:**

- **Missing journal functions or triggers:** apply
  `docs/migrations/tag-consolidation-chunks.sql` chunks 8–9 on the copy.
- **ACLs differ from production:** bring the copy to the production state by
  running **`rollback.sql` R1c, R1b, R1a on the copy**. Those blocks create
  exactly the production ACL entries, so running them there also tests the
  rollback file. Re-run `Q-B1`/`Q-B2` until parity holds.
- **Function bodies differ (Q-C1 not MATCH):** the rehearsal is invalid until
  reconciled. Do not proceed.

### 1.4 Test identities on the copy

| Identity | How | Used for |
|---|---|---|
| `ANON` | the copy's publishable key only | anon probes |
| `USER_A` | sign up through the copy's UI; take the access token (browser devtools → `sb-…-auth-token`) | authenticated probes and UI smoke tests; hosts a battle |
| `USER_B` | second sign-up | joins USER_A's battle, follows USER_A |
| `SQL` | the copy's SQL editor or Lovable MCP `query_database` on the **copy's** project ID | catalog queries, `DO` blocks |

In the commands below, `$URL` and `$ANON_KEY` are the **copy's** values, never
production's.

---

## 2. Tests before the change (baseline, on the copy)

Record every result in `phase1-results/rehearsal/T0.md`.

### 2.1 Privilege baseline

- **T0-1:** run `containment.sql` **C0**. Expect every target at
  public/anon/authenticated/service_role = `t/t/t/t`. Save the output as the
  rehearsal rollback baseline.

### 2.2 RPC behaviour probes (prove current EXECUTE)

These probes use **random, non-existent UUIDs**, so no row is created or
changed. They are chosen to hit an early exception inside each function
(proving EXECUTE was allowed) without side effects.

| ID | Call | Identity | Expected BEFORE |
|---|---|---|---|
| T0-2 | `POST $URL/rest/v1/rpc/commit_settlement` body `{"_account_id":"00000000-0000-0000-0000-000000000001","_user_id":"00000000-0000-0000-0000-000000000002","_clamped_pnl":1}` | ANON | HTTP 400, `P0001` "Account not found or access denied" (**executed**) |
| T0-3 | same | USER_A | same |
| T0-4 | `POST …/rpc/_join_battle_as` body `{"_battle_id":"00000000-0000-0000-0000-000000000003","_user_id":"00000000-0000-0000-0000-000000000002"}` | ANON | HTTP 400/409 with a constraint error from inside the function: `23502` (NULL `paper_account_id`) or `23503` (FK to `battles`), depending on table constraints. Either proves **executed**. The INSERT…SELECT inserts no account because no battle row exists, and the error rolls the call back. **Confirm on the copy that no `paper_accounts` row was created.** |
| T0-5 | `POST …/rpc/tick_battle` body `{"_battle_id":"00000000-0000-0000-0000-000000000003"}` | ANON | HTTP 200, `null` |
| T0-6 | same | USER_A | HTTP 200, `null` |
| T0-7 | `POST …/rpc/join_battle` body `{"_battle_id":"00000000-0000-0000-0000-000000000003"}` | ANON | HTTP 400, `P0001` "Not authenticated" |
| T0-8 | same | USER_A | HTTP 400, `P0001` "Battle not found" |
| T0-9 | `POST …/rpc/social_follow_counts` body `{"_user":"00000000-0000-0000-0000-000000000002"}` | ANON | HTTP 200, `[{"followers":0,"following":0}]` |
| T0-10 | same | USER_A | same |
| T0-11 | **Do not call** `journal_sync_tag_arrays_for` over HTTP (it UPDATEs). Check privilege only: `SELECT has_function_privilege('anon','public.journal_sync_tag_arrays_for(uuid)','EXECUTE')` | SQL | `t` |

Example probe (anon):

```bash
curl -s -X POST "$URL/rest/v1/rpc/tick_battle" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"_battle_id":"00000000-0000-0000-0000-000000000003"}' -w "\nHTTP %{http_code}\n"
# authenticated: add  -H "Authorization: Bearer $USER_A_TOKEN"
```

### 2.3 Application smoke baseline

Run the §5 smoke tests once **before** the change. Every step must pass; if one
already fails before the change, record it as pre-existing so it isn't blamed
on containment.

---

## 3. Apply order (on the copy)

Run one statement per execution. Stop at the first failure.

| Step | Action | Pass condition |
|---|---|---|
| A1 | `containment.sql` **C0** (read-only) | Matches T0-1 |
| A2 | **C1a** | Completes without exception |
| A3 | **C2** | commit_settlement and _join_battle_as: `f/f/f/t` |
| A4 | §4.1 probes V-1…V-3 | As listed |
| A5 | **C1b** | Completes without exception |
| A6 | **C2** | tick_battle, join_battle, social_follow_counts: `f/f/t/t` |
| A7 | §4.1 probes V-4…V-9 | As listed |
| A8 | **C1c** | Completes without exception |
| A9 | **C2** | the three journal functions: `f/f/f/t` |
| A10 | §4.2 and §5 full smoke suite | All pass |

**Negative test of the guards** (optional, recommended, copy only):

1. Before A2, run `GRANT EXECUTE ON FUNCTION public.commit_settlement(uuid,uuid,numeric) TO sandbox_exec;`.
2. Run **C1a**. Expect it to raise "ACL drift" and change nothing (verify with C2).
3. Run `REVOKE EXECUTE ON FUNCTION public.commit_settlement(uuid,uuid,numeric) FROM sandbox_exec;` and continue.

This proves the drift guard works. If `sandbox_exec` does not exist on the copy, use any throwaway role created on the copy.

---

## 4. Verification queries and probes

### 4.1 RPC probes AFTER the change

| ID | Repeats | Identity | Expected AFTER |
|---|---|---|---|
| V-1 | T0-2 | ANON | HTTP 401/403, `42501` "permission denied for function commit_settlement" |
| V-2 | T0-3 | USER_A | `42501` |
| V-3 | T0-4 | ANON | `42501` "permission denied for function _join_battle_as" |
| V-4 | T0-5 | ANON | `42501` |
| V-5 | T0-6 | USER_A | HTTP 200, `null` (**unchanged**) |
| V-6 | T0-7 | ANON | `42501` |
| V-7 | T0-8 | USER_A | `P0001` "Battle not found" (**unchanged**) |
| V-8 | T0-9 | ANON | `42501` |
| V-9 | T0-10 | USER_A | HTTP 200 counts (**unchanged**) |
| V-10 | T0-11 | SQL | `f` |

### 4.2 Catalog verification (SQL, read-only)

- **V-11:** `containment.sql` **C2**, full expected table in its header.
- **V-12:** `Q-B2-secdef-callable-map.sql`. `commit_settlement`, `_join_battle_as`, `journal_*` are **absent**. `tick_battle`, `join_battle`, `social_follow_counts` show anon=false, authenticated=true. **Every other row is identical to the T0 run** (no collateral change).
- **V-13:** `Q-C1-function-body-fingerprints.sql`. Identical to baseline (bodies untouched).
- **V-14:** `Q-D2-score-table-triggers.sql`. Identical to baseline.
- **V-15:** service-role paths still work:
  - `SELECT public.tick_battles();` as postgres on the copy completes.
  - `SELECT has_function_privilege('service_role','public._join_battle_as(uuid,uuid)','EXECUTE');` returns `t`.

---

## 5. Application smoke tests (copy URL, real UI)

| ID | Flow | Exercises | Pass |
|---|---|---|---|
| S-1 | USER_A signs in and opens the dashboard | auth, profile | no error toasts; no 42501 in server logs |
| S-2 | USER_A creates a public battle (Battle Arena → Create) | `createBattle` → `join_battle` (`battle-arena.functions.ts:313`) → `_join_battle_as` nested | battle created; USER_A listed as participant; battle account exists |
| S-3 | USER_B joins it from the lobby | `joinBattle` → `join_battle` (`:329`) → `_join_battle_as` nested | USER_B listed; status → `filling`/`ready` per min participants |
| S-4 | USER_B uses **Join random** | `joinRandom` → `join_battle` (`:452`) | joins an open battle, or a "none available" message (not an error) |
| S-5 | USER_A creates a private battle; USER_B joins with the invite code | `join_battle_by_code` → `join_battle` | joined |
| S-6 | Open the battle page and wait through the countdown | `tickBattle` → `tick_battle` (`:514`) | status advances ready → countdown → live without a manual refresh error |
| S-7 | Let the battle end with USER_A (host) viewing | `tick_battle` → `finalize_battle` | status `completed`, results page renders (B-1 non-host behaviour is pre-existing; note, don't fail on it) |
| S-8 | Service-role battle tick: `POST <copy URL>/api/public/hooks/battle-tick` with the **copy's** `x-cron-secret`, or SQL `SELECT public.tick_battles();` | `tick_battles` → `tick_battle`/`finalize_battle` as service_role | HTTP 200 / completes; a second overdue test battle finalizes |
| S-9 | Matchmaking: USER_A and USER_B both queue for the same type, then trigger S-8 | `tick_battles` → `_join_battle_as` ×2 as postgres | a matchmaking battle with both participants is created |
| S-10 | USER_B follows USER_A; open USER_A's public profile and community profile | `social_follow_counts` (`social.functions.ts:242,271`, `community.functions.ts:563`) | follower/following counts render and increment |
| S-11 | Journal: USER_A opens a journal entry, adds an emotion and a mistake tag, removes one | trigger `journal_entry_tags_sync` → `journal_entry_tags_sync_trg` → `journal_sync_tag_arrays_for` | entry's `emotions`/`mistakes` arrays update (check the UI chips, or SQL `SELECT emotions, mistakes FROM journal_entries WHERE id = …` on the copy) |
| S-12 | Journal: USER_A renames a tag | trigger `journal_tags_rename_sync` → `journal_tags_rename_sync_trg` | every entry carrying the tag shows the new name |
| S-13 | Paper trading: open and close a trade | `openTrade` / `closeTrade` (unaffected; they don't use `commit_settlement`) | balance and statistics update as before |
| S-14 | AI mentor / championship admin tick / live battle stats | known broken before and after (N-20) | **same** result as §2.3 baseline (no new failure) |
| S-15 | `bun run test` and `bun run test:e2e` pointed at the **copy** (`E2E_*` env for the copy) | regression | same pass/fail set as the pre-change run |

---

## 6. Rollback procedure (rehearse it; don't just read it)

After §5 passes, **deliberately roll back on the copy** to prove `rollback.sql` works.

| Step | Action | Pass condition |
|---|---|---|
| B1 | `rollback.sql` **R1c** | completes |
| B2 | **R1b** | completes |
| B3 | **R1a** | completes |
| B4 | **R2** | For each function, `acl_entries_sorted` equals the sorted entries of the A1/C0 capture. anon/authenticated/service_role booleans equal T0-1. |
| B5 | Re-run T0-2…T0-10 | Results equal the §2.2 baseline (EXECUTE restored) |
| B6 | S-2, S-6, S-10, S-11 | pass |
| B7 | Re-apply A1…A10 | same results as the first pass (idempotency) |

### 6.1 Production rollback triggers (for the later production run)

Roll back **only the affected block**, per the `rollback.sql` header:

- a §5 smoke test fails with `42501` on a retained function (tick_battle, join_battle, social_follow_counts), or on a journal tag save: roll back C1b or C1c;
- battle creation or joining breaks with `42501` mentioning `_join_battle_as`: roll back C1a **only after** confirming the caller isn't a new, unaudited path. R1a re-opens critical findings.

Rollback is a privilege change only. No data migration and no deploy are needed. PostgREST picks up privilege changes on the next call.

---

## 7. Default-privileges track (separate rehearsal)

Rehearse **after** containment passes, as its own change:

1. Run `default-privileges.proposed.sql` **D0** and save it.
2. Run **D1**, **D3**, **D5** (postgres). Then attempt **D2**, **D4**, **D6** (supabase_admin).
   - Record whether they fail with `42501` (constraint K1). A failure is an expected outcome and a finding, not a rehearsal failure.
3. Run **D7** and compare with its expected block.
4. Functional test on the copy:
   1. `CREATE FUNCTION public.rehearsal_probe() RETURNS int LANGUAGE sql AS 'select 1';`
   2. Check `has_function_privilege('anon','public.rehearsal_probe()','EXECUTE')` = **f**, `authenticated` = **f**, `service_role` = **t**.
   3. `CREATE TABLE public.rehearsal_probe_t(id int);`
   4. Check `has_table_privilege('authenticated','public.rehearsal_probe_t','TRUNCATE')` = **f** and `'SELECT'` = **t**.
   5. Drop both probes.
5. Trigger one Lovable-generated schema change on the copy (e.g. ask the Lovable agent to add a trivial RPC used by a page). Confirm whether it now fails with 42501 until an explicit `GRANT … TO authenticated` is added (constraint K3). **This result decides whether D1/D3 can ship.**
6. Run `default-privileges.rollback.sql` RB6…RB1, then RB7. RB7 must equal D0.

---

## 8. Success criteria (all required)

1. Copy parity was established (§1.3) and recorded.
2. C1a, C1b and C1c each completed on the first attempt without an exception, and the drift guard raised when deliberately provoked.
3. V-1…V-10 match exactly, including the specific SQLSTATE `42501` for revoked calls and the **unchanged** results for authenticated calls.
4. V-12 shows no collateral privilege change, and V-13/V-14 show no body or trigger change.
5. S-1…S-13 pass, and S-14/S-15 show no new failure versus the §2.3 baseline.
6. Rollback B1…B7 passed, with R2 entry sets equal to the C0 capture.
7. The production pre-apply capture (containment **C0** on production, read-only) still matches `2026-09-17_Q-B1.csv` / `Q-B2.csv` on the day of the production run.

## 9. Failure criteria (any one fails the rehearsal)

- Any C1 block raises on a copy that passed §1.3 parity. The guard or the file is wrong, so fix and regenerate.
- Any authenticated probe (V-5, V-7, V-9) or smoke test S-2…S-12 returns `42501` or a new error.
- Journal tag arrays stop updating (S-11/S-12). That would mean trigger EXECUTE is checked in this environment, so C1c must be revised.
- Matchmaking or service-role tick (S-8/S-9) fails.
- V-12 shows any privilege change outside the 8 target functions.
- R2 entry sets do not equal C0 after rollback, or T0 probes do not return to baseline.
- Any statement is found to have run against production during the rehearsal.

---

## 10. Record keeping

Save everything under `docs/migrations/remediation/phase1-results/rehearsal/`:

| File | Content |
|---|---|
| `environment.md` | Copy project ID, how obtained, parity results |
| `T0.md`, `V.md`, `S.md`, `B.md` | Probe and smoke results with timestamps |
| `C0.csv`, `C2-after-C1a.csv`, `C2-after-C1b.csv`, `C2-after-C1c.csv`, `R2.csv` | Catalog captures |
| `DECISION.md` | PASS/FAIL against §8 and §9, and the owner's go/no-go for production |

Use the same sanitisation rules as Phase 0: no user IDs, tokens, keys or production personal data.

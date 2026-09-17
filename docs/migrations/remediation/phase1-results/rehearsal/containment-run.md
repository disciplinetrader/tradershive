# Phase 1 database containment rehearsal: run record

| | |
|---|---|
| **Date** | 2026-09-17, 10:58–11:06 UTC |
| **Target** | Lovable project `THIVE ARENA - PHASE1 REHEARSAL` (`a4d32bcf-1960-4144-a713-666d55dc26b5`), Supabase ref `plcwtdcvvdhvdndnbutw` |
| **Tooling** | Lovable MCP `query_database` for SQL, run as `postgres`. `curl` against the **rehearsal** REST API only (`https://plcwtdcvvdhvdndnbutw.supabase.co`). |
| **Files executed** | `docs/migrations/remediation/phase1/containment.sql` (C0, C1a, C1b, C1c, C2), then `rollback.sql` (R1c, R1b, R1a, R2), then `containment.sql` C1a, C1b, C1c again. Blocks were pasted verbatim from the files. |
| **Production** | **Not modified.** One read-only `SELECT` at 11:05:27 UTC confirmed it is unchanged (§11). |
| **Not done** | `default-privileges.proposed.sql` not executed. No production users, data, cron secret or cron jobs copied. No Phase 2 work. |

**Result: DATABASE REHEARSAL = PASS**

---

## 1. Database identity before execution

| Check (10:58:51 UTC) | Value | Expected |
|---|---|---|
| `pg_control_system().system_identifier` | `7678069749886157684` | rehearsal (production is `7662742571317219726`) ✅ |
| `pg_postmaster_start_time()` | 2026-09-17 08:33:05 UTC | rehearsal ✅ |
| `current_user` | postgres | postgres ✅ |
| PostgreSQL | 17.6 | ✅ |
| `auth.users` | 0 | empty rehearsal ✅ |
| `cron.job` | 0 | no jobs ✅ |
| Project ref (from `environment.md`, MCP `read_file supabase/config.toml`) | `plcwtdcvvdhvdndnbutw` | ≠ production `afhjjcivjkzcmdqzutfh` ✅ |

The cluster identifier was re-checked in every verification query (§4, §7, §9): always `7678069749886157684`.

## 2. Preflight (containment.sql C0) at 10:59:15 UTC

| Function | ACL | public / anon / auth / service | owner |
|---|---|---|---|
| _join_battle_as(uuid,uuid) | `{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}` | t/t/t/t | postgres |
| commit_settlement(uuid,uuid,numeric) | same | t/t/t/t | postgres |
| join_battle(uuid,boolean) | same | t/t/t/t | postgres |
| journal_entry_tags_sync_trg() | same | t/t/t/t | postgres |
| journal_sync_tag_arrays_for(uuid) | same | t/t/t/t | postgres |
| journal_tags_rename_sync_trg() | same | t/t/t/t | postgres |
| social_follow_counts(uuid) | same | t/t/t/t | postgres |
| tick_battle(uuid) | same | t/t/t/t | postgres |

**All 8 equal the captured production ACL** (`phase0-results/2026-09-17_Q-B1.csv`, `environment.md` §4). Owners and body fingerprints were already verified equal to production in `environment.md` §4.

### 2.1 Probe test user (rehearsal only)

Authenticated probes need a real JWT, so one **synthetic** user was created on the rehearsal project:

1. Signed up through the rehearsal `/auth/v1/signup` with a random `@example.com` address.
2. The project requires email confirmation, so that single row was confirmed with a guarded `DO` block. The block aborts unless `system_identifier = 7678069749886157684`, and requires exactly 1 row updated. This was the only data write, and it was on the rehearsal auth schema.
3. Logged in via `/auth/v1/token`. The JWT had `role=authenticated` and issuer host `plcwtdcvvdhvdndnbutw.supabase.co`.

The token and password were never printed, and were deleted from the scratchpad after the run. **The synthetic user remains on the rehearsal database.** It is not a production user.

### 2.2 Baseline probes (T0, before containment) at 11:01:08 UTC

Same probe set as §5, with nonexistent UUIDs. **Every target executed its body for both anon and authenticated:**

- `commit_settlement`: 400 `P0001` "Account not found or access denied"
- `_join_battle_as`: 409 `23503` FK violation
- `tick_battle`: 200 `null`
- `join_battle`: anon 400 `P0001` "Not authenticated"; authenticated 400 `P0001` "Battle not found"
- `social_follow_counts`: 200 `[{"followers":0,"following":0}]`
- `journal_sync_tag_arrays_for`: 204 (UPDATE matched 0 rows)

An anonymous-only baseline at 10:59:36 UTC gave identical results.

## 3. Containment block results (first run)

| Block | Executed | Result | In-block assertions |
|---|---|---|---|
| C1a | ~11:01 UTC | success, no exception | exact ACL-set precondition passed; post-condition passed (anon ✗, authenticated ✗, service_role ✓, postgres ✓) |
| C2 (after C1a) | | only commit_settlement and _join_battle_as changed, to `{postgres=X/postgres,service_role=X/postgres}`. Other 6 unchanged. | — |
| C1b | ~11:02 UTC | success, no exception | exact precondition (tick_battle, join_battle) and explicit-entry precondition (social_follow_counts) passed; post-condition passed (anon ✗, authenticated ✓, service_role ✓) |
| C1c | ~11:02 UTC | success, no exception | explicit-entry precondition passed; post-condition passed (anon ✗, authenticated ✗, postgres ✓) |

## 4. Post-containment ACL matrix (C2, first run)

| Function | ACL | PUBLIC | anon | authenticated | service_role | postgres |
|---|---|---|---|---|---|---|
| commit_settlement(uuid,uuid,numeric) | `{postgres=X/postgres,service_role=X/postgres}` | ✗ | ✗ | ✗ | ✓ | ✓ |
| _join_battle_as(uuid,uuid) | `{postgres=X/postgres,service_role=X/postgres}` | ✗ | ✗ | ✗ | ✓ | ✓ |
| tick_battle(uuid) | `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}` | ✗ | ✗ | ✓ | ✓ | ✓ |
| join_battle(uuid,boolean) | `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}` | ✗ | ✗ | ✓ | ✓ | ✓ |
| social_follow_counts(uuid) | `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}` | ✗ | ✗ | ✓ | ✓ | ✓ |
| journal_sync_tag_arrays_for(uuid) | `{postgres=X/postgres,service_role=X/postgres}` | ✗ | ✗ | ✗ | ✓ | ✓ |
| journal_entry_tags_sync_trg() | `{postgres=X/postgres,service_role=X/postgres}` | ✗ | ✗ | ✗ | ✓ | ✓ |
| journal_tags_rename_sync_trg() | `{postgres=X/postgres,service_role=X/postgres}` | ✗ | ✗ | ✗ | ✓ | ✓ |

**Collateral check:** 75 of 83 public functions still carry the untouched default ACL (all 83 did before), so exactly the 8 targets changed. `paper_accounts`, `battle_participants` and `journal_entries` hold 0 rows, so the baseline `_join_battle_as` probe left no data.

## 5. RPC permission probes (V, first containment) at 11:02:34 UTC

`POST https://plcwtdcvvdhvdndnbutw.supabase.co/rest/v1/rpc/<fn>`. Nonexistent UUIDs throughout; no production IDs.

| Function | Identity | HTTP | Response | Required | Verdict |
|---|---|---|---|---|---|
| commit_settlement | anon | 401 | `42501` permission denied for function commit_settlement | denied before body | ✅ (T0 body error `P0001` no longer reached) |
| commit_settlement | authenticated | 403 | `42501` permission denied | denied | ✅ |
| _join_battle_as | anon | 401 | `42501` permission denied | denied | ✅ |
| _join_battle_as | authenticated | 403 | `42501` permission denied | denied | ✅ |
| tick_battle | anon | 401 | `42501` permission denied | denied | ✅ |
| tick_battle | authenticated | 200 | `null` | callable | ✅ |
| join_battle | anon | 401 | `42501` permission denied | denied | ✅ |
| join_battle | authenticated | 400 | `P0001` "Battle not found" | reaches body | ✅ |
| social_follow_counts | anon | 401 | `42501` permission denied | denied | ✅ |
| social_follow_counts | authenticated | 200 | `[{"followers":0,"following":0}]` | works | ✅ |
| journal_sync_tag_arrays_for | anon | 401 | `42501` permission denied | denied | ✅ |
| journal_sync_tag_arrays_for | authenticated | 403 | `42501` permission denied | denied | ✅ |

`42501` is raised by PostgreSQL's EXECUTE privilege check before any function statement runs. The T0 contrast shows the body errors (`P0001`, `23503`) are no longer reached.

## 6. Rollback execution

| Block | Result |
|---|---|
| R1c | success, no exception; post-condition passed |
| R1b | success, no exception; exact-set assertion for tick_battle / join_battle passed; social_follow_counts explicit-entry assertion passed |
| R1a | success, no exception; exact-set assertion passed |

Each block was run separately and sequentially, newest first, as `rollback.sql` specifies.

## 7. Post-rollback ACL comparison (R2 + set comparison) and probes

| Function | ACL text after rollback | Sorted entry set | Set = pre-rehearsal C0 |
|---|---|---|---|
| _join_battle_as | `{postgres=X/postgres,service_role=X/postgres,=X/postgres,anon=X/postgres,authenticated=X/postgres}` | `=X, anon=X, authenticated=X, postgres=X, service_role=X` (all `/postgres`) | **true** |
| commit_settlement | `{postgres=X/postgres,service_role=X/postgres,=X/postgres,anon=X/postgres,authenticated=X/postgres}` | same | **true** |
| join_battle | `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres,=X/postgres,anon=X/postgres}` | same | **true** |
| journal_entry_tags_sync_trg | `{postgres=X/postgres,service_role=X/postgres,=X/postgres,anon=X/postgres,authenticated=X/postgres}` | same | **true** |
| journal_sync_tag_arrays_for | same as above | same | **true** |
| journal_tags_rename_sync_trg | same as above | same | **true** |
| social_follow_counts | `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres,=X/postgres,anon=X/postgres}` | same | **true** |
| tick_battle | `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres,=X/postgres,anon=X/postgres}` | same | **true** |

Effective EXECUTE after rollback: anon / authenticated / service_role = t/t/t for all 8, equal to C0.

The textual order differs (re-granted entries are appended); the privilege set is identical. **Rollback = PASS.**

**Post-rollback probes (B) at 11:03:59 UTC:** all 12 results are **identical** to the T0 baseline (§2.2). EXECUTE is restored, including for anon.

## 8. Second containment execution

| Block | Result | Note |
|---|---|---|
| C1a | success, no exception | The precondition compares **sorted entry sets**, so it passed on the reordered post-rollback ACL text. This shows the drift guard is order-insensitive, as designed. |
| C1b | success, no exception | same |
| C1c | success, no exception | same |

## 9. Final ACL state (rehearsal left contained) at ~11:05 UTC

Identical to §4:

| Function | public / anon / authenticated / service_role / postgres |
|---|---|
| commit_settlement | f / f / f / t / t |
| _join_battle_as | f / f / f / t / t |
| tick_battle | f / f / t / t / t |
| join_battle | f / f / t / t / t |
| social_follow_counts | f / f / t / t / t |
| journal_sync_tag_arrays_for | f / f / f / t / t |
| journal_entry_tags_sync_trg | f / f / f / t / t |
| journal_tags_rename_sync_trg | f / f / f / t / t |

- **Collateral:** 75 of 83 functions still have the untouched default ACL.
- **Cluster:** `7678069749886157684`.
- **Final probes (V2) at 11:05:04 UTC:** all 12 results **identical** to §5.

## 10. Verdict

| Criterion | Result |
|---|---|
| Identity verified before any change | PASS |
| Preflight equals captured production ACLs | PASS |
| C1a / C1b / C1c complete with in-block pre- and post-conditions | PASS (both runs) |
| Required denials (PUBLIC/anon, and authenticated where specified) | PASS (catalog + API `42501`) |
| Required access retained (postgres, service_role, authenticated on tick_battle / join_battle / social_follow_counts) | PASS (catalog + API) |
| No collateral privilege change | PASS (75/83 untouched) |
| No data side effects from probes | PASS (0 rows in probed tables) |
| Rollback restores exact ACL sets | PASS (8/8 set-equal; probes = baseline) |
| Re-apply after rollback | PASS |
| Production untouched | PASS (§11) |

**DATABASE REHEARSAL = PASS**

## 11. What could prevent the same containment applying to production

**Checked, not blocking:**

- **Production is unchanged.** Read-only check at 11:05:27 UTC, cluster `7662742571317219726`: all 8 target functions still have the ACL set required by the C1 preconditions (`matches_containment_precondition = true`) and owner `postgres`.
- **The drift guards protect production.** If production's ACLs change before the window, C1 blocks raise and change nothing.

**Residual risks and conditions to satisfy:**

1. **Application behaviour is not yet proven.** This rehearsal proves database privileges and the PostgREST permission path. It did **not** exercise the application: battle create/join through the UI, the service-role battle-tick hook, matchmaking via `tick_battles` → `_join_battle_as`, or journal tag triggers firing after C1c. The rehearsal has no data, and its other 69 function ACLs are wider than production's (`environment.md` §4.1). A minimal app smoke test is required, especially:
   - **journal tag triggers** after C1c (trigger EXECUTE semantics);
   - **nested `_join_battle_as`** via `join_battle` and `tick_battles` (runs as `postgres`, whose EXECUTE was verified).
2. **Execution path.** Production containment must run as `postgres` via the same mechanism (Lovable MCP `query_database` or the Lovable SQL editor), one `DO` block per call. The blocks abort if `current_user <> 'postgres'`.
3. **Unaudited external callers.** Any script, integration or manual process outside `src/`, `scripts/` and `e2e/` that calls these functions as anon would start receiving `42501` (for example a local tool using the publishable key). None was found in the repo.
4. **Re-capture on the day.** Run `containment.sql` C0 on production immediately before C1a, and save it as the production rollback baseline (REHEARSAL §8 item 7).
5. **Rehearsal hygiene.** The synthetic user remains on the rehearsal database. It has no production relevance; delete it or keep it for the app smoke test.

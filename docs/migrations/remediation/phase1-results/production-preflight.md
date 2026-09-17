# Phase 1 production preflight (read-only)

| | |
|---|---|
| **Date** | 2026-09-17, 11:24–11:27 UTC |
| **Target** | THIVE ARENA, Lovable project `237f7325-035a-4d38-a67f-36c64e02b573`, Supabase ref `afhjjcivjkzcmdqzutfh` |
| **Change candidate** | `docs/migrations/remediation/phase1/containment.sql` **only** (commit `55242549`) |
| **Excluded** | `default-privileges.proposed.sql`, Phase 2, championship, historical data, rewards, AI rate limit, ELO/trading integrity |
| **Access** | Lovable MCP `get_project`, `read_file`, `query_database` (`SELECT` only), and local `git` |
| **Production changes made** | **None.** `containment.sql` was **not** executed. |

**Result: PREFLIGHT PASS**

---

## Checks

| # | Check | Evidence | Result |
|---|---|---|---|
| 1 | Production database identity | `pg_control_system().system_identifier = 7662742571317219726` (production, per Phase 0 and `environment.md`; rehearsal is `7678069749886157684`). `supabase/config.toml` project_id = `afhjjcivjkzcmdqzutfh`. `current_user = postgres`. Lovable project is published, latest commit `24edd5ef41ac…` and last edited 2026-09-16 12:57 UTC, both unchanged since Phase 0. | PASS |
| 2 | All 8 targets exist | PF-1: `to_regprocedure` non-null for all 8 signatures | PASS |
| 3 | ACLs exactly match Phase 0 capture | PF-1: sorted entry set = `{=X/postgres, anon=X/postgres, authenticated=X/postgres, postgres=X/postgres, service_role=X/postgres}` for **8/8** (`acl_set_matches_phase0 = true`); literal text also identical to `2026-09-17_Q-B1.csv` | PASS |
| 4 | Function bodies unchanged | PF-1: normalised `prosrc` md5 equals the Phase 0 / rehearsal fingerprint for 8/8. Owner `postgres`, `SECURITY DEFINER`, `search_path=public` unchanged. | PASS |
| 5 | No new overload | PF-1: `overloads = 1` for every target name | PASS |
| 6 | `commit_settlement` has zero app callers | `git grep` at **production commit `24edd5ef`** over `src/`, `scripts/`, `e2e/`: 0 call sites; 0 non-literal `.rpc(` calls. PF-3: no database function, view or trigger calls it. | PASS |
| 7 | `_join_battle_as` has zero direct app callers | `git grep` at `24edd5ef`: 0 call sites. PF-3: called only inside `join_battle(uuid,boolean)` and `tick_battles()`, both `SECURITY DEFINER` owned by `postgres` (postgres keeps EXECUTE). | PASS |
| 8 | Retained authenticated callers still present | At `24edd5ef`: **`tick_battle`** `src/lib/battle-arena.functions.ts:514` (`context.supabase`). **`join_battle`** `battle-arena.functions.ts:313`, `:329` (`context.supabase`), `:452` (`joinRandom`, `context.supabase`), `scripts/seed-replay-battle.ts:315` (user session). **`social_follow_counts`** `social.functions.ts:242`, `:271` (`context` user client), `community.functions.ts:563` (`context` user client). All behind `requireSupabaseAuth`. PF-3: also `join_battle_by_code` (`SECURITY DEFINER`) → `join_battle`. | PASS |
| 9 | Journal helpers have no direct app callers | `git grep` at `24edd5ef`: 0 call sites for all 3. PF-3: `journal_sync_tag_arrays_for` is called only by the 2 trigger functions (`SECURITY DEFINER`, owner `postgres`). The trigger functions are attached only to `journal_entry_tags.journal_entry_tags_sync` and `journal_tags.journal_tags_rename_sync`. | PASS |
| 10 | Cron depends only on preserved service-role paths | PF-2: 7 active jobs, all `net.http_post` to hooks (`battle-tick`, `economic-calendar`, `email-queue`, `email-reengagement`, `email-weekly-report`, `email-monthly-report`, `historical-sync`), secret length 64, **no job calls a target function** (`calls_target_fn = false` ×7). The only hook→RPC path touching targets is `battle-tick.ts:45` `supabaseAdmin.rpc("tick_battles")` (service_role; `tick_battles` untouched), which reaches `tick_battle`/`_join_battle_as` as `postgres` (retained). `battle-settlement.ts:51` (`finalize_battle`, untouched) is not scheduled. | PASS |
| 11 | `rollback.sql` is an exact inverse | Static parse of both committed files: **21** (function, role) REVOKE pairs = **21** GRANT pairs, with no unmatched entry either way. `containment.sql` contains no GRANT and no `ALTER DEFAULT PRIVILEGES`, and never revokes `service_role` or `postgres`. Behaviourally proven on rehearsal: rollback restored all 8 ACL sets exactly, and probes returned to baseline (`containment-run.md` §6–7). | PASS |
| 12 | Nothing invalidates the drift guards | PF-2 whole-schema fingerprints equal the 2026-09-17 10:0x UTC capture: relations `3f6785b9…`, **function bodies `bc71db1a…`**, **function ACLs `0ef3243e…`**, policies `5c3245aa…`, triggers `407ff738…`, default ACL `1f5ae099…`; 83 public functions. No schema or privilege change on production since capture. The C1 guards compare sorted ACL sets (order-insensitive, proven on rehearsal re-run). | PASS |
| A | Rehearsal containment still PASS | Rehearsal read-only at ~11:26 UTC (cluster `7678069749886157684`): 8 target ACLs still exactly the contained state; `auth.users` = 0, `battles` = 0 (clean) | PASS |
| B | Smoke test still PASS 39/39 | `phase1-results/rehearsal/app-smoke-test.md` (committed `55242549`). Neither file has changed since (`git status` clean), and the production app commit is unchanged. | PASS |
| C | Production has not already received the change | PF-1: anon / authenticated / service_role / postgres EXECUTE = t/t/t/t on all 8, i.e. pre-containment | PASS |

**Committed file hashes (SHA-256):**

- `containment.sql` = `16dc42b1778c9e56f3eb0d48de41046ecafc279af49ef8501c42a578b528db74`
- `rollback.sql` = `4b92fdbf550beeb62ef600bc34659d86d5c8dff65f6b2a14d6fe886d206db137`

### Queries used (production, read-only)

| ID | Purpose |
|---|---|
| PF-1 | For each of the 8 signatures: existence, `proacl`, sorted-set comparison with the Phase 0 ACL, body md5 comparison, owner, security definer, `proconfig`, effective EXECUTE for anon/authenticated/service_role/postgres, overload count, cluster id |
| PF-2 | Fingerprints of public relations, function bodies, function ACLs, policies, triggers and default ACLs; function count; `cron.job` summary (job name, schedule, active, hook name, whether HTTP, secret **length only**, whether the command references a target function) |
| PF-3 | Every function (all non-system schemas) whose source references a target, with the caller's `SECURITY DEFINER` flag and owner; views referencing targets (none); triggers using the journal trigger functions |

---

## Exact statements proposed for production

Run as `postgres` through the Lovable MCP `query_database`, **one statement per call, in this order**. The text is taken verbatim from `containment.sql` (committed `55242549`, SHA-256 above). Each `DO` block is atomic, and aborts with no change if its precondition fails.

| Step | Statement | Effect |
|---|---|---|
| **P0** | `containment.sql` **C0** (read-only `SELECT`) | Save the output as `phase1-results/production/C0.csv`. This is the production rollback baseline. |
| **P1** | `containment.sql` **C1a** | Precondition: `current_user = postgres`, and the ACL set equals the captured set for both functions. Then:<br>`REVOKE EXECUTE ON FUNCTION public.commit_settlement(uuid, uuid, numeric) FROM PUBLIC, anon, authenticated;`<br>`REVOKE EXECUTE ON FUNCTION public._join_battle_as(uuid, uuid) FROM PUBLIC, anon, authenticated;`<br>Post-condition: anon and authenticated lose access; service_role and postgres keep it. |
| **P2** | `containment.sql` **C2** (read-only) | Verify |
| **P3** | `containment.sql` **C1b** | Precondition: exact ACL set for `tick_battle` and `join_battle`; explicit PUBLIC/anon/authenticated entries on `social_follow_counts`. Then:<br>`REVOKE EXECUTE ON FUNCTION public.tick_battle(uuid) FROM PUBLIC, anon;`<br>`REVOKE EXECUTE ON FUNCTION public.join_battle(uuid, boolean) FROM PUBLIC, anon;`<br>`REVOKE EXECUTE ON FUNCTION public.social_follow_counts(uuid) FROM PUBLIC, anon;`<br>Post-condition: anon loses access; authenticated and service_role keep it. |
| **P4** | `containment.sql` **C2** (read-only) | Verify |
| **P5** | `containment.sql` **C1c** | Precondition: explicit PUBLIC/anon/authenticated entries on all 3 functions. Then:<br>`REVOKE EXECUTE ON FUNCTION public.journal_sync_tag_arrays_for(uuid) FROM PUBLIC, anon, authenticated;`<br>`REVOKE EXECUTE ON FUNCTION public.journal_entry_tags_sync_trg() FROM PUBLIC, anon, authenticated;`<br>`REVOKE EXECUTE ON FUNCTION public.journal_tags_rename_sync_trg() FROM PUBLIC, anon, authenticated;`<br>Post-condition: anon and authenticated lose access; postgres keeps it. |
| **P6** | `containment.sql` **C2** (read-only) | Final verification. Expected table below. |

**Expected production state after P6:**

| Function | Resulting ACL | public / anon / authenticated / service_role |
|---|---|---|
| commit_settlement(uuid,uuid,numeric) | `{postgres=X/postgres,service_role=X/postgres}` | f / f / f / t |
| _join_battle_as(uuid,uuid) | `{postgres=X/postgres,service_role=X/postgres}` | f / f / f / t |
| tick_battle(uuid) | `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}` | f / f / t / t |
| join_battle(uuid,boolean) | same as tick_battle | f / f / t / t |
| social_follow_counts(uuid) | same as tick_battle | f / f / t / t |
| journal_sync_tag_arrays_for(uuid) | `{postgres=X/postgres,service_role=X/postgres}` | f / f / f / t |
| journal_entry_tags_sync_trg() | same | f / f / f / t |
| journal_tags_rename_sync_trg() | same | f / f / f / t |

### Post-change production verification (proposed; no production data touched)

1. **Anonymous probes** with the production publishable key and **nonexistent UUIDs only**. Expect `42501` for:
   - `commit_settlement`
   - `_join_battle_as`
   - `tick_battle`
   - `join_battle`
   - `social_follow_counts`
   - `journal_sync_tag_arrays_for`
2. **Owner live check** with the owner's own existing account, in the browser:
   - open a battle page;
   - confirm follower counts render on a profile;
   - edit one journal entry's emotion tag and confirm it saves.

   No synthetic users or data are created in production.
3. **Collateral check:** re-run PF-2. Only `public_function_acl_md5` should change, and the other 75 function ACLs must be unchanged, compared per-function against `2026-09-17_Q-B1/Q-B2` / P5 capture.
4. **Cron health:** within 5 minutes, `net._http_response` shows 200s for `battle-tick` (Phase 0 query `Q-G4`).

## Exact rollback statements

Run as `postgres`, only for the blocks that were applied, newest first. The text is verbatim from `rollback.sql` (committed `55242549`, SHA-256 above). Each block asserts its restored state.

| Undoes | Block | Statements |
|---|---|---|
| P5 (C1c) | **R1c** | `GRANT EXECUTE ON FUNCTION public.journal_sync_tag_arrays_for(uuid) TO PUBLIC, anon, authenticated;`<br>`GRANT EXECUTE ON FUNCTION public.journal_entry_tags_sync_trg() TO PUBLIC, anon, authenticated;`<br>`GRANT EXECUTE ON FUNCTION public.journal_tags_rename_sync_trg() TO PUBLIC, anon, authenticated;` |
| P3 (C1b) | **R1b** | `GRANT EXECUTE ON FUNCTION public.tick_battle(uuid) TO PUBLIC, anon;`<br>`GRANT EXECUTE ON FUNCTION public.join_battle(uuid, boolean) TO PUBLIC, anon;`<br>`GRANT EXECUTE ON FUNCTION public.social_follow_counts(uuid) TO PUBLIC, anon;` |
| P1 (C1a) | **R1a** | `GRANT EXECUTE ON FUNCTION public.commit_settlement(uuid, uuid, numeric) TO PUBLIC, anon, authenticated;`<br>`GRANT EXECUTE ON FUNCTION public._join_battle_as(uuid, uuid) TO PUBLIC, anon, authenticated;`<br>⚠ R1a **re-opens critical findings C-6 and C-7**. Use only for a verified regression. |
| — | **R2** (read-only) | Compare sorted ACL entry sets with the P0 capture. All must match. |

Rollback is privilege-only: no deploy, no data migration, and effective on the next request (observed on rehearsal).

---

## Expected user-visible impact

| Audience | Impact |
|---|---|
| Signed-in users | **None expected.** Battle create, join, join random, join by invite code, battle page ticking, follower counts, journal tag add/remove/rename, and trading all use retained paths. Rehearsal: 39/39. |
| Anonymous visitors | **None expected.** No anonymous app feature calls these RPCs (all app callers sit behind `requireSupabaseAuth`). |
| Cron / background jobs | **None.** Service-role hooks are unchanged; nested calls run as `postgres`. |
| Admin console | **None** from this change. Already-broken service-role-only calls (N-20) stay broken; they are not in scope. |
| Attackers | Anonymous and signed-in callers can no longer rewrite any account balance via `commit_settlement` (C-6), enrol arbitrary users into battles via `_join_battle_as` (C-7), call `tick_battle`/`join_battle`/`social_follow_counts` anonymously, or force journal tag recomputation. |

---

## Remaining risk

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| R1 | **UI rendering was not browser-tested** (rehearsal preview requires a Lovable login). Database paths were fully tested with real JWTs. | Low: the change affects only DB EXECUTE checks, not rendering | Post-change owner live check (step 2 above) |
| R2 | **Service-role cron path not exercised over HTTP** on rehearsal (no service-role key). | Low: `service_role` grants are untouched (post-conditions assert it), and nested calls run as `postgres` (proven via authenticated `join_battle` → `_join_battle_as`) | Post-change cron health check (step 4); R1a/R1b rollback |
| R3 | **Unaudited external callers** (a script or integration outside `src/`, `scripts/`, `e2e/` using the publishable key) would start getting `42501`. | Low: none found in the repo | Rollback per block |
| R4 | **Re-exposure by future schema changes.** `CREATE OR REPLACE` keeps ACLs, but a `DROP`+`CREATE` of these functions, e.g. by a future Lovable-generated migration, re-applies the default ACL (anon/authenticated EXECUTE) because default privileges are unchanged (out of scope). | Medium over time | After any migration touching these functions, re-run C2. Default-privileges proposal remains a separate decision. |
| R5 | **Environment differences** between rehearsal and production: 69 unrelated function ACLs, auth trigger, data volume. | Low for this change: all 8 targets, their bodies and their callers are identical, and PF-3 shows production callers are all `SECURITY DEFINER` + `postgres` | Drift guards; C2 verification |
| R6 | **Race with a concurrent privilege change** between P0 and P1. | Very low | C1 preconditions abort atomically on any ACL drift |
| R7 | **Findings not addressed by Phase 1** remain open on production: C-1, C-5, N-1, N-2, N-3, N-10, N-12, S-2, S-7/N-20, B-4, B-5, N-13 and the rest of the Phase 0 report. | Certain | Later phases, as instructed |

---

## Readiness

| Question | Answer |
|---|---|
| PREFLIGHT | **PASS** (15/15 checks) |
| Production containment | **READY TO EXECUTE**, pending **explicit owner approval** |
| Executed on production | **No.** Stopped here as instructed. |

# Phase 1 minimal application smoke test (rehearsal)

| | |
|---|---|
| **Date** | 2026-09-17, 11:10–11:16 UTC |
| **Target** | `THIVE ARENA - PHASE1 REHEARSAL` (`a4d32bcf-1960-4144-a713-666d55dc26b5`), Supabase ref `plcwtdcvvdhvdndnbutw`, cluster `7678069749886157684` |
| **Database state under test** | Phase 1 contained (see `containment-run.md` §9), re-verified at 11:15 UTC before cleanup |
| **Production** | Untouched. Read-only confirmation at 11:15:57 UTC (§8). |

**Result: MINIMAL APP SMOKE TEST = PASS (39/39)**

## How the application paths were exercised

Phase 1 changes only database EXECUTE privileges, so the path that matters is the database call each app feature makes, with the caller's JWT. Each test issues the **same PostgREST request the application issues**, against the rehearsal API, carrying a real synthetic user's JWT:

| App feature | App code | Call issued in the test |
|---|---|---|
| Create battle | `createBattle` (`src/lib/battle-arena.functions.ts:221-313`), user-scoped client | `POST /rest/v1/battles` (same columns), then `POST /rpc/join_battle` (host auto-join) |
| Join battle | `joinBattle` (`:319-332`) | `POST /rpc/join_battle` |
| Tick battle | `tickBattle` (`:509-517`) | `POST /rpc/tick_battle` |
| Battle page | battle route queries | `GET battles` / `battle_participants` / `battle_rankings` |
| Follow and counts | `followUser` (`social.functions.ts:206-217`), `getFollowState` / `getPublicProfile` (`:242`, `:271`) | `POST social_follows` (upsert), `POST /rpc/social_follow_counts` |
| Journal tags | `createEntry`, `upsertTag`, `setEntryTagValues` (`src/lib/journal/api.ts`), browser client with the user JWT | `POST journal_entries`, `POST journal_tags` (upsert), `POST`/`DELETE journal_entry_tags`, `PATCH journal_tags` |

### Limitations (disclosed)

- **No browser UI rendering.** The rehearsal preview (`id-preview--a4d32bcf….lovable.app`) returns **HTTP 401** without a Lovable login. The TanStack server functions were therefore not invoked through the web server; their exact database calls were issued directly with the same user JWT. UI rendering itself is not affected by a database EXECUTE change.
- **Service-role cron path not exercised over HTTP.** The rehearsal has no service-role key or cron jobs available to the harness. `service_role` EXECUTE on all 8 targets was verified in the catalog (unchanged by containment). The nested `_join_battle_as` path **was** exercised end to end through authenticated `join_battle` (tests 2.host-autojoin, 3.join).

## 1. Test users created (rehearsal only)

| User | Email (test-only) | How |
|---|---|---|
| USER_A | `phase1-smoke-usera-7b205a3b@example.com` | `/auth/v1/signup` (random password, never printed) → email confirmed by a guarded `DO` block (aborts unless cluster = rehearsal and exactly 2 rows) → `/auth/v1/token` |
| USER_B | `phase1-smoke-userb-07fd8e43@example.com` | same |

**Environment gap:** the rehearsal database lacks production's `on_auth_user_created → handle_new_user()` trigger on `auth.users` (production has it; read-only check at 11:12 UTC). The remix did not copy auth-schema triggers. Each user therefore created their own profile through the app-permitted RLS path (`Users can insert their own profile`). The `profiles` AFTER INSERT triggers (`seed_paper_defaults` etc.) then ran normally. This is a remix artefact, not a containment effect.

A third synthetic user (`phase1-rehearsal-…@example.com`, from `containment-run.md`) existed and was removed in cleanup.

## 2–5. Tests executed, expected vs actual

Identifiers are redacted to labels (`<USER_A>`, `<BATTLE>`, …). Run started 2026-09-17T11:14:13Z.

### 1. Authentication

| ID | Test | Expected | Actual | Result |
|---|---|---|---|---|
| 1.A-signin | USER_A password sign-in | HTTP 200, access token, role `authenticated` | HTTP 200, token, role=authenticated | PASS |
| 1.A-session | USER_A session valid (`/auth/v1/user`) | HTTP 200, same user | HTTP 200, id match | PASS |
| 1.B-signin | USER_B password sign-in | HTTP 200, access token, role `authenticated` | HTTP 200, token, role=authenticated | PASS |
| 1.B-session | USER_B session valid | HTTP 200, same user | HTTP 200, id match | PASS |
| 1b.A-profile | USER_A creates own profile | HTTP 201 | HTTP 201 | PASS |
| 1b.B-profile | USER_B creates own profile | HTTP 201 | HTTP 201 | PASS |

### 2. Battle creation (USER_A)

| ID | Test | Expected | Actual | Result |
|---|---|---|---|---|
| 2.create | Insert battle as `createBattle` does | HTTP 201, row | HTTP 201, status `upcoming`, host `<USER_A>` | PASS |
| 2.host-autojoin | Host auto-join `rpc join_battle` | HTTP 200 returns battle id | HTTP 200 `<BATTLE>` | PASS |
| 2.verify | Host participant row | 1 row, USER_A, `paper_account_id` set | 1 row, USER_A, account set, status `joined` | PASS |

### 3. Battle join (USER_B)

| ID | Test | Expected | Actual | Result |
|---|---|---|---|---|
| 3.join | `rpc join_battle` as USER_B | HTTP 200 returns battle id; no 42501 | HTTP 200 `<BATTLE>` | PASS |
| 3.participant | Participant row created (nested `_join_battle_as` runs as postgres) | USER_B row with `paper_account_id` | 2 participants; USER_B row present | PASS |
| 3.account | Battle paper account created | 1 account `Battle: …`, balance 10000 | `Battle: PHASE1 SMOKE TEST - synthetic battle`, starting_balance 10000, balance 10000 | PASS |
| 3.promotion | Lobby promotion | status `ready` (2/2) | `ready` | PASS |

### 4. Anonymous battle joining

| ID | Test | Expected | Actual | Result |
|---|---|---|---|---|
| 4.anon-_join_battle_as | anon `_join_battle_as(<BATTLE>, <USER_B>)` | 401/403 `42501` | HTTP 401 `42501` permission denied for function _join_battle_as | PASS |
| 4.anon-join_battle | anon `join_battle(<BATTLE>)` | 401/403 `42501`, before body | HTTP 401 `42501` permission denied for function join_battle | PASS |
| 4.no-rows | Rows unchanged | participants and USER_B battle accounts unchanged | before (1, 0) → after (1, 0) | PASS |

### 5. Battle ticking

| ID | Test | Expected | Actual | Result |
|---|---|---|---|---|
| 5.A-tick | USER_A `rpc tick_battle` | HTTP 200 status text | HTTP 200 `ready` | PASS |
| 5.B-tick | USER_B `rpc tick_battle` | HTTP 200 status text | HTTP 200 `ready` | PASS |
| 5.anon-tick | anon `rpc tick_battle` | 401/403 `42501` | HTTP 401 `42501` | PASS |

### 6. Social follower counts

| ID | Test | Expected | Actual | Result |
|---|---|---|---|---|
| 6.follow | USER_B follows USER_A (upsert `social_follows`) | HTTP 201 | HTTP 201 | PASS |
| 6.counts-A | USER_A `social_follow_counts(<USER_A>)` | followers 1, following 0 | `[{"followers":1,"following":0}]` | PASS |
| 6.counts-B | USER_B `social_follow_counts(<USER_B>)` | followers 0, following 1 | `[{"followers":0,"following":1}]` | PASS |
| 6.anon-counts | anon `social_follow_counts` | 401/403 `42501` | HTTP 401 `42501` | PASS |

### 7. Journal tag flow (trigger execution after C1c)

| ID | Test | Expected | Actual | Result |
|---|---|---|---|---|
| 7.entry | `createEntry` (`source=manual`) | HTTP 201 | HTTP 201, emotions `[]`, mistakes `[]` | PASS |
| 7.tags | `upsertTag` emotion + mistake | HTTP 201 ×2 | 201, 201 | PASS |
| 7.link | Upsert `journal_entry_tags` → trigger `journal_entry_tags_sync` → `journal_entry_tags_sync_trg()` → `journal_sync_tag_arrays_for()` | HTTP 201, no 42501 | HTTP 201 | PASS |
| 7.sync-add | Arrays synced | emotions `[phase1_fomo]`, mistakes `[phase1_overtrading]` | exactly that | PASS |
| 7.sync-remove | DELETE emotion link (trigger on DELETE) | emotions `[]`, mistakes unchanged | emotions `[]`, mistakes `[phase1_overtrading]` | PASS |
| 7.sync-rename | Rename tag → trigger `journal_tags_rename_sync` → `journal_tags_rename_sync_trg()` | mistakes `[phase1_over_trading]` | exactly that | PASS |
| 7.direct-denied | USER_A direct `rpc journal_sync_tag_arrays_for` | 401/403 `42501` | HTTP 403 `42501` | PASS |

**Conclusion:** revoking caller EXECUTE on the three journal functions does not affect trigger-based execution.

### 8. Critical RPC containment (real synthetic IDs)

| ID | Test | Expected | Actual | Result |
|---|---|---|---|---|
| 8.USER_A-commit_settlement | USER_A `commit_settlement(<USER_A_BATTLE_ACCOUNT>, <USER_A>, +1,000,000)` | 401/403 `42501` | HTTP 403 `42501` permission denied for function commit_settlement | PASS |
| 8.USER_A-_join_battle_as | USER_A `_join_battle_as(<BATTLE>, <USER_B>)` | 401/403 `42501` | HTTP 403 `42501` | PASS |
| 8.anon-commit_settlement | anon, same arguments | 401/403 `42501` | HTTP 401 `42501` | PASS |
| 8.anon-_join_battle_as | anon, same arguments | 401/403 `42501` | HTTP 401 `42501` | PASS |
| 8.balance-unchanged | Balance after denied settlement | 10000.0 unchanged | 10000.0 → 10000.0 | PASS |
| 8.no-rows | No rows from denied `_join_battle_as` | unchanged | (1, 0) | PASS |

These calls used a **real** (synthetic) account and battle ID, so an allowed call would have visibly changed the balance or created rows. Nothing changed, confirming the denial happened at the privilege check.

### 9. Regression checks

| ID | Test | Expected | Actual | Result |
|---|---|---|---|---|
| 9.A-default-account | USER_A default paper account seeded on profile creation | ≥1 account | 1 | PASS |
| 9.B-default-account | USER_B default paper account seeded | ≥1 account | 1 | PASS |
| 9.battle-page-reads | `battles`, `battle_participants`, `battle_rankings` reads for both users | all HTTP 200 | 6/6 HTTP 200 | PASS |

**Regression coverage summary:**

| Area | Covered by | Status |
|---|---|---|
| Paper account creation | 9.A/B-default-account, 3.account, 2.verify | ✅ no change |
| Battle participant creation | 2.verify, 3.participant | ✅ no change |
| Battle page loading (data layer) | 9.battle-page-reads | ✅ no change (UI not rendered, see limitations) |
| Follower counts | 6.counts-A/B | ✅ no change |
| Journal tags | 7.* | ✅ no change |
| Retained authenticated RPCs (`tick_battle`, `join_battle`, `social_follow_counts`) | 3.join, 5.A/B-tick, 6.counts-A/B | ✅ no change |

## 6. Application regressions

**None found.** Every retained path worked, and every closed path returned `42501`. The only anomaly, the missing `auth.users` trigger, is a remix environment gap, not a containment regression.

## 7. Cleanup

| Step | Result |
|---|---|
| Pre-cleanup containment re-check (11:15 UTC) | Target privileges still contained: `commit_settlement`, `_join_battle_as` and journal ×3 = service_role only; `tick_battle`, `join_battle`, `social_follow_counts` = authenticated + service_role, anon denied |
| Pre-cleanup synthetic inventory | 3 auth users, 2 profiles, 4 paper_accounts, 1 battle, 2 participants, 1 follow, 1 journal entry, 2 journal tags, 1 entry-tag link |
| Guarded `DO` cleanup (cluster check + exact 3-user set) | Deleted journal_entry_tags, journal_tags, journal_entries, social_follows, battle_participants, battles for the synthetic users, then the 3 `auth.users` rows (cascades profiles, paper accounts and other user-keyed rows) |
| Post-cleanup verification | `auth.users` = 0; profiles, paper_accounts, battles, battle_participants, social_follows, journal_entries, journal_tags, journal_entry_tags all 0; **orphan scan over 189 uuid user-reference columns in public tables: none** |
| Local credentials | Passwords, tokens and state files deleted from the scratchpad |

**The rehearsal database is left empty and in the contained Phase 1 state.**

## 8. Production

Read-only check at 11:15:57 UTC (cluster `7662742571317219726`):

- all **8/8** target functions are still at the pre-containment ACL;
- **0** synthetic `phase1-%@example.com` users.

**Production remains untouched.**

---

## Verdict

**MINIMAL APP SMOKE TEST = PASS (39/39)**

### Conditions carried to the production change

1. Run `containment.sql` C0 on production immediately before C1a and keep it as the rollback baseline. The C1 drift guards abort on any change.
2. After production C1a–C1c, repeat the anon/authenticated `42501` probes with nonexistent UUIDs only (`containment-run.md` §5), plus a live check of battle join, battle tick, follower counts and a journal tag edit.
3. `rollback.sql` is proven on the rehearsal (`containment-run.md` §6–§7) and is the immediate recovery path.

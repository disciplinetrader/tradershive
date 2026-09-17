# Phase 1 containment: production run

| | |
|---|---|
| **Approval** | Owner approval received in session: "APPROVED: Execute Phase 1 containment on PRODUCTION" |
| **Target** | THIVE ARENA, Lovable project `237f7325-035a-4d38-a67f-36c64e02b573`, Supabase ref `afhjjcivjkzcmdqzutfh` |
| **Executed** | `docs/migrations/remediation/phase1/containment.sql` blocks C1a, C1b, C1c only, verbatim, via Lovable MCP `query_database` as `postgres`, one block per call |
| **Not executed** | `default-privileges.proposed.sql`, `rollback.sql`, and any Phase 2, championship, historical, AI rate-limit, reward, ELO, paper-trading or prop-challenge change |
| **Window** | 2026-09-17 11:54:09 (pre-write capture) → 11:55:47 (final matrix) → 11:57:05 UTC (last check) |

**Result: PRODUCTION CONTAINMENT = PASS**

**PRODUCTION SMOKE TEST = COMPLETE (PASS)**

**PHASE 1 CONTAINMENT = COMPLETE**

**ROLLBACK USED = NO**

---

## 1. Production identity and pre-write safety checks

| Check | Result |
|---|---|
| `containment.sql` SHA-256 | `16dc42b1778c9e56f3eb0d48de41046ecafc279af49ef8501c42a578b528db74`, equal to preflight; `git diff 55242549` clean |
| `rollback.sql` SHA-256 | `4b92fdbf550beeb62ef600bc34659d86d5c8dff65f6b2a14d6fe886d206db137`, equal to preflight and to the rehearsed version |
| `system_identifier` | `7662742571317219726` (production), re-checked in every verification query |
| `current_user` | `postgres` |
| Precondition: ACL set equal to the approved set, all 8 targets | `true` ×8 |
| Whole-function ACL fingerprint | `0ef3243efb615dc9ef718b958a5e17d4`, equal to preflight PF-2 (no drift) |
| Non-target ACL fingerprint (75 other public functions) | `ffb2e0238d02b03dd5980de9f2a3971a` (collateral baseline) |

## 2. Pre-change ACL capture (C0, rollback baseline) at 11:54:09 UTC

| Function | ACL | public / anon / auth / service | owner |
|---|---|---|---|
| commit_settlement(uuid,uuid,numeric) | `{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}` | t/t/t/t | postgres |
| _join_battle_as(uuid,uuid) | same | t/t/t/t | postgres |
| tick_battle(uuid) | same | t/t/t/t | postgres |
| join_battle(uuid,boolean) | same | t/t/t/t | postgres |
| social_follow_counts(uuid) | same | t/t/t/t | postgres |
| journal_sync_tag_arrays_for(uuid) | same | t/t/t/t | postgres |
| journal_entry_tags_sync_trg() | same | t/t/t/t | postgres |
| journal_tags_rename_sync_trg() | same | t/t/t/t | postgres |

## 3. C1a

| | |
|---|---|
| Executed | ~11:54:25 UTC |
| Result | Completed; no exception. In-block precondition (exact ACL set) and post-condition (anon ✗, authenticated ✗, service_role ✓, postgres ✓) passed. |
| C2 verify at 11:54:42 UTC | `commit_settlement`, `_join_battle_as` = `{postgres=X/postgres,service_role=X/postgres}` (f/f/f/t, postgres ✓). Other 6 targets unchanged. |
| Verdict | PASS; no rollback |

## 4. C1b

| | |
|---|---|
| Executed | ~11:55:00 UTC |
| Result | Completed; no exception. Preconditions (exact set for tick_battle/join_battle; explicit PUBLIC/anon/authenticated on social_follow_counts) and post-condition (anon ✗, authenticated ✓, service_role ✓) passed. |
| C2 verify at 11:55:12 UTC | `tick_battle`, `join_battle`, `social_follow_counts` = `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}` (f/f/t/t). C1a functions unchanged. Journal functions unchanged. |
| Verdict | PASS; no rollback |

## 5. C1c

| | |
|---|---|
| Executed | ~11:55:30 UTC |
| Result | Completed; no exception. Precondition (explicit PUBLIC/anon/authenticated entries) and post-condition (anon ✗, authenticated ✗, postgres ✓) passed. |
| C2 verify at 11:55:47 UTC | Three journal functions = `{postgres=X/postgres,service_role=X/postgres}` (f/f/f/t, postgres ✓) |
| Verdict | PASS; no rollback |

## 6. Final ACL matrix at 11:55:47 UTC

| Function | ACL | PUBLIC | anon | authenticated | service_role | postgres | Required | ✓ |
|---|---|---|---|---|---|---|---|---|
| commit_settlement(uuid,uuid,numeric) | `{postgres=X/postgres,service_role=X/postgres}` | ✗ | ✗ | ✗ | ✓ | ✓ | block PUBLIC/anon/auth | ✅ |
| _join_battle_as(uuid,uuid) | `{postgres=X/postgres,service_role=X/postgres}` | ✗ | ✗ | ✗ | ✓ | ✓ | block PUBLIC/anon/auth | ✅ |
| tick_battle(uuid) | `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}` | ✗ | ✗ | ✓ | ✓ | ✓ | block PUBLIC/anon, keep auth | ✅ |
| join_battle(uuid,boolean) | same | ✗ | ✗ | ✓ | ✓ | ✓ | block PUBLIC/anon, keep auth | ✅ |
| social_follow_counts(uuid) | same | ✗ | ✗ | ✓ | ✓ | ✓ | block PUBLIC/anon, keep auth | ✅ |
| journal_sync_tag_arrays_for(uuid) | `{postgres=X/postgres,service_role=X/postgres}` | ✗ | ✗ | ✗ | ✓ | ✓ | block PUBLIC/anon/auth | ✅ |
| journal_entry_tags_sync_trg() | same | ✗ | ✗ | ✗ | ✓ | ✓ | block PUBLIC/anon/auth | ✅ |
| journal_tags_rename_sync_trg() | same | ✗ | ✗ | ✗ | ✓ | ✓ | block PUBLIC/anon/auth | ✅ |

**Collateral:**

- Non-target ACL fingerprint after the change is `ffb2e0238d02b03dd5980de9f2a3971a`, **identical** to the pre-write capture, so no other function's privileges changed.
- Function bodies fingerprint is `bc71db1a1be047f0bff7a26d83706ef9`, identical to preflight, so no body changed.

## 7. Production smoke-test results

| # | Check | How | Result | Status |
|---|---|---|---|---|
| 5 | Anonymous execution of contained functions is denied | `POST https://afhjjcivjkzcmdqzutfh.supabase.co/rest/v1/rpc/<fn>` with the production publishable key and **nonexistent UUIDs only**, at 11:56:02 UTC | `commit_settlement`, `_join_battle_as`, `tick_battle`, `join_battle`, `social_follow_counts`, `journal_sync_tag_arrays_for`: **all HTTP 401 `42501` "permission denied for function …"**. Denied at the privilege check; no function body ran. | PASS |
| — | Public app reachable | `GET https://tradershive.lovable.app` `/` `/login` `/battle-arena` (status only) | 200 / 307 (redirect) / 200 | PASS |
| 7 | Server/application permission regressions | Cron hook HTTP responses since 11:50 scanned for `permission denied` / `42501` (§8); read-only activity check | 0 permission errors. **Lovable app server logs are not accessible through the available MCP tools**, so they were not inspected. | PASS (DB/HTTP), app logs UNKNOWN |
| 1 | Authenticated login/session | Owner, own account, in the browser (reported in session after 11:57 UTC) | Login succeeded | **PASS** |
| 2 | Open an existing battle page | Owner, own account | Battle page loaded (path `tickBattle` → `tick_battle`, authenticated EXECUTE retained per §6) | **PASS** |
| 3 | Follower-count path | Owner, own account | Follower counts rendered (path `social_follow_counts`, authenticated EXECUTE retained) | **PASS** |
| 4 | Normal journal tag edit | Owner, own account | Tag edit saved and persisted after reload (trigger path `journal_entry_tags_sync` → `journal_sync_tag_arrays_for`, running as postgres after C1c) | **PASS** |

**Real-user activity on retained paths since 11:54:25 UTC** (read-only counts at 11:57:05): sign-ins 0, battle joins 0, battle updates 0, follows 0, journal entry updates 0, paper accounts created 0. There is no organic traffic to confirm or refute behaviour yet. **0** synthetic `phase1-%@example.com` users exist in production.

### Owner verification checklist (performed by owner, all PASS)

1. Sign in at `https://tradershive.lovable.app` with your normal account.
2. Open **Battle Arena**, then open any existing battle. The page loads, and the status or countdown renders without an error toast. (Path: `tickBattle` → `tick_battle`.)
3. Open any trader's public profile. Follower and following counts render. (Path: `getPublicProfile` → `social_follow_counts`.)
4. Open one of your journal entries. Add or remove one emotion or mistake tag and save. The chip persists after a page reload. (Path: `journal_entry_tags` insert/delete → `journal_entry_tags_sync` trigger.)

The rollback mapping below was prepared in case a step failed. **It was not needed.**

| Failing step | Block to roll back |
|---|---|
| 2 | R1b |
| 3 | R1b |
| 4 | R1c |
| any battle join / creation | R1a, only if the error names `_join_battle_as` |

Nothing else should be improvised.

## 8. Cron health

| Source | Window | Result |
|---|---|---|
| `net._http_response` | 11:50–11:56 UTC | 2 responses per minute (battle-tick + email-queue), **all HTTP 200**, 0 timeouts, **0** bodies containing `permission denied`/`42501`. Includes the 11:55 and 11:56 runs, which fired after C1a/C1b; the 11:56 run is after C1c. |
| `cron.job_run_details` | since 11:50 UTC | `battle-tick-every-minute`: 7 runs, all succeeded, last 11:56:00. `email-queue-process`: 7 runs, all succeeded, last 11:56:00. |

**Verdict: battle-tick healthy after containment.** The service-role path (`battle-tick` hook → `tick_battles` → `tick_battle` / `_join_battle_as` as `postgres`) is unaffected.

## 9. Errors

**None.** Every containment block completed on the first attempt, and every verification matched. No `42501` surfaced anywhere except the intended anonymous denials.

## 10. Rollback

**Not needed. Not executed.** `rollback.sql` remains available, unchanged (SHA-256 above) and rehearsed.

## 11. Final production state

- **Phase 1 containment applied.** The 8 target functions hold exactly the ACLs in §6.
- **Critical findings C-6 and C-7 are closed at the privilege layer:** anon and authenticated can no longer execute `commit_settlement` or `_join_battle_as`.
- Anonymous execution of `tick_battle`, `join_battle`, `social_follow_counts` and the journal helpers is closed.
- No other function ACL, function body, policy, trigger, default privilege, cron job or row of data was changed.
- **Still open:** default privileges (future functions still default to anon/authenticated EXECUTE; risk R4 in the preflight) and every other Phase 0 finding. Out of scope for Phase 1.
- **Owner authenticated checks 1–4:** all PASS (§7).
- **Production smoke test:** COMPLETE.
- **Phase 1 containment:** COMPLETE. No further production changes were made after 11:55:47 UTC.

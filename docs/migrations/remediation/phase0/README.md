# Phase 0: Read-only live verification queries

This directory holds the Phase 0 package from
`_bmad-output/planning-artifacts/phase-0-readonly-queries.sql` (commit
`01c242f2`), split into **one file per query**. The original file is
unchanged and remains the reference copy.

- **Report these results feed:** `_bmad-output/planning-artifacts/phase-0-live-verification.md`
- **Plan:** `_bmad-output/planning-artifacts/remediation-plan.md`

**61 files, 61 queries.** Every file is a single `SELECT` or `WITH` statement
ending in `;`. Each file:

- has a 4-line header giving the query ID, a description, a source pointer
  and a read-only notice;
- keeps the original query comment and SQL **byte-for-byte**;
- was machine-checked for:
  - starting with `SELECT`/`WITH`
  - having exactly one statement terminator
  - no write or DDL keywords outside comments and string literals
  - no calls to write functions (`cron.schedule`, `net.http_*`, `set_config`, `nextval`, …)
  - no key-shaped or 64-hex secret tokens
  - matching the source text exactly

**Nothing here writes to the database.** Still, run the files only as
described below.

---

## 1. Execution order

All queries are independent and read-only, so no query depends on another's
side effects. The order below front-loads what Phase 1 needs, and runs the
heavy data scans last.

> **Paste one file per run.** The Lovable SQL editor truncates long pastes and
> still reports success (`docs/migrations/README.md`). Open the file, select
> all, copy, paste, run.

| # | File | Stage |
|---|---|---|
| 1 | `Q-00a-current-role.sql` | Context |
| 2 | `Q-00b-extensions.sql` | Context |
| 3 | `Q-B1-function-privileges.sql` | **Phase 1 gate** |
| 4 | `Q-B2-secdef-callable-map.sql` | **Phase 1 gate** |
| 5 | `Q-B3-default-privileges.sql` | **Phase 1 gate** |
| 6 | `Q-B4-function-overloads.sql` | **Phase 1 gate** |
| 7 | `Q-C1-function-body-fingerprints.sql` | **Phase 1 gate** |
| 8 | `Q-C2-function-definitions.sql` | **Phase 1 gate** (large output) |
| 9 | `Q-C3-secdef-risk-flags.sql` | Phase 1 supporting |
| 10 | `Q-G1-cron-inventory-redacted.sql` | **Phase 1 gate** |
| 11 | `Q-G2-cron-secret-consistency.sql` | Cron |
| 12 | `Q-G3-cron-run-history.sql` | **Phase 1 gate** |
| 13 | `Q-G4-cron-http-outcomes.sql` | **Phase 1 gate** |
| 14 | `Q-G5-vault-secret-names.sql` | Cron (may error; see §6) |
| 15 | `Q-A1-table-rls.sql` | RLS / grants |
| 16 | `Q-A2-table-policies.sql` | RLS / grants |
| 17 | `Q-A3-table-privilege-matrix.sql` | RLS / grants |
| 18 | `Q-A4-raw-table-grants.sql` | RLS / grants |
| 19 | `Q-A5-score-column-privileges.sql` | RLS / grants |
| 20 | `Q-A6-authenticated-write-surface.sql` | RLS / grants |
| 21 | `Q-D1-profile-policies.sql` | Profile integrity |
| 22 | `Q-D2-score-table-triggers.sql` | Profile integrity |
| 23 | `Q-D3-profile-protection-coverage.sql` | Profile integrity |
| 24 | `Q-D4-award-revert-evidence.sql` | Profile integrity |
| 25 | `Q-F1-championship-cron-jobs.sql` | Championship |
| 26 | `Q-F2-championship-function-callers.sql` | Championship |
| 27 | `Q-F3-championship-status-census.sql` | Championship |
| 28 | `Q-F4-championship-month-coverage.sql` | Championship |
| 29 | `Q-E1-battle-status-census.sql` | Battle |
| 30 | `Q-E2-battles-below-min-participants.sql` | Battle |
| 31 | `Q-E3-battle-finalize-lag.sql` | Battle |
| 32 | `Q-E4-early-finalized-battles.sql` | Battle |
| 33 | `Q-E5-direct-insert-participants.sql` | Battle |
| 34 | `Q-E6-battle-rule-violation-logs.sql` | Battle |
| 35 | `Q-H1-import-job-census.sql` | Historical ingestion |
| 36 | `Q-H2-stale-import-jobs.sql` | Historical ingestion |
| 37 | `Q-H3-import-failure-classes.sql` | Historical ingestion |
| 38 | `Q-H4-short-successful-imports.sql` | Historical ingestion |
| 39 | `Q-H5-provider-market-assignments.sql` | Historical ingestion |
| 40 | `Q-H6-symbol-catalog-health.sql` | Historical ingestion |
| 41 | `Q-H7-provider-credential-presence.sql` | Historical ingestion |
| 42 | `Q-H8-candle-store-size.sql` | Historical ingestion |
| 43 | `Q-J1-env-evidence-imports.sql` | Environment (indirect) |
| 44 | `Q-J2-env-evidence-hook-side-effects.sql` | Environment (indirect) |
| 45 | `Q-J3-env-evidence-email.sql` | Environment (indirect) |
| 46 | `Q-J4-env-evidence-ai-gateway.sql` | Environment (indirect) |
| 47 | `Q-I13-journal-share-exposure.sql` | Suspicious data (light) |
| 48 | `Q-I9b-prop-status-census.sql` | Suspicious data (light) |
| 49 | `Q-I5b-balance-drift-summary.sql` | Suspicious data |
| 50 | `Q-I1-impossible-pnl-sign.sql` | Suspicious data |
| 51 | `Q-I4-duplicate-settlement.sql` | Suspicious data |
| 52 | `Q-I6-trades-modified-after-close.sql` | Suspicious data |
| 53 | `Q-I12-unpaid-rewards.sql` | Suspicious data |
| 54 | `Q-I3-closed-without-close-event.sql` | Suspicious data (**heavy**) |
| 55 | `Q-I2-impossible-pnl-magnitude.sql` | Suspicious data (**heavy**) |
| 56 | `Q-I5-balance-drift-detail.sql` | Suspicious data (**heavy**) |
| 57 | `Q-I7-event-trades-outside-window.sql` | Suspicious data (**heavy**) |
| 58 | `Q-I8-suspicious-elo.sql` | Suspicious data |
| 59 | `Q-I9-prop-passed-without-trail.sql` | Suspicious data |
| 60 | `Q-I10-battle-results-vs-trades.sql` | Suspicious data |
| 61 | `Q-I11-championship-rankings-vs-trades.sql` | Suspicious data |

Run items 54–57 off-peak. They scan `paper_trades` and `position_history`.
Row output is capped at `LIMIT 200`; counts are unbounded.

> **Source package order** (0 → A → B → … → J) is equally valid. The order
> above is a priority order, not a dependency order.

---

## 2. What each query verifies, and expected output

"Plan IDs" refer to `remediation-plan.md` §1 and `phase-0-live-verification.md` §10.

### Context

| Query | Verifies | Expected output |
|---|---|---|
| Q-00a | Which role, database and server version the editor runs as | 1 row: `pg_version`, `run_as` (expect `postgres` or an owner role), `db`, `captured_at` |
| Q-00b | pg_cron, pg_net, vault and similar are installed | 0–6 rows: `extname`, `extversion` |

### B: Function EXECUTE privileges

| Query | Verifies (plan IDs) | Expected output |
|---|---|---|
| Q-B1 | PUBLIC / anon / authenticated / service_role EXECUTE, security-definer flag, owner, search path and raw ACL for the 23 named functions and every overload (C-6, C-7, S-4, S-5) | 1 row per signature. Booleans `public_exec`, `anon_exec`, `authenticated_exec`, `service_role_exec`; `config` should contain `search_path=public` |
| Q-B2 | Every public security-definer function callable by anon or authenticated (S-4) | 1 row per exposed function, anon-callable first. A long list is expected; flag anything outside the allow-list in plan step 1.2 |
| Q-B3 | Default ACLs that grant rights on newly created objects (root cause of C-7) | 1 row per (role, schema, object type). Look for `functions` rows whose `acl` includes `anon=X` or `authenticated=X` |
| Q-B4 | Stale overloads left by a signature change (N-4) | 1 row per function name. `overloads > 1` for `join_battle` confirms N-4 |

### C: Security-definer definitions vs repo

| Query | Verifies | Expected output |
|---|---|---|
| Q-C1 | Live body fingerprint vs the latest repo migration for 23 functions | 23+ rows. `verdict` is `MATCH`, `DIFFERS` or `LIVE MISSING`. `DIFFERS` rows need a Q-C2 diff by hand. |
| Q-C2 | Full `CREATE OR REPLACE` text of the live functions (rollback baseline; B-1, B-2, B-3, S-5) | 1 row per signature with `live_definition`. **Large**: export to a file, don't copy from the grid. |
| Q-C3 | Heuristic flags on live security-definer bodies: caller-supplied user/account param, `auth.uid()` use, a `auth.uid() IS NULL` branch, legacy role setting read (S-6), missing search path | 1 row per security-definer function. Highest risk sorts first: authenticated-executable **and** takes a user/account param. |

### G: Cron

| Query | Verifies | Expected output |
|---|---|---|
| Q-G1 | Cron inventory: name, schedule, active, endpoint without query string, hook, header shape, **secret length only**, redacted command (B-5, B-9, O-2) | 1 row per job. Expect `x_cron_secret_len = 64` and `secret_is_placeholder = false` on HTTP jobs. **Before saving, check that `command_redacted` shows no readable secret.** |
| Q-G2 | All HTTP jobs use the same cron secret (boolean only) | 1 row per job carrying `x-cron-secret`, with `same_secret_as_first_job` |
| Q-G3 | pg_cron statement-level outcomes over 7 days | Rows per (job, status). "succeeded" does **not** mean the HTTP call worked (BA-3). |
| Q-G4 | Real HTTP status codes returned through pg_net over 48 h | Rows per (hour, status_code, timed_out). Retention is short, so an empty result means "no evidence", not "no failures". |
| Q-G5 | Vault secret **names** (never values) | Rows of `name`, `description`, timestamps, **or** a permission error (record it; see §6) |

### A: RLS, policies, grants

| Query | Verifies | Expected output |
|---|---|---|
| Q-A1 | RLS enabled / forced, and owner, for 23 tables | 1 row per existing table: `rls_enabled`, `rls_forced`, `owner` |
| Q-A2 | Full text of every installed policy (C-1, P-1, S-2, N-2) | 1 row per policy: `roles`, `cmd`, `using_expr`, `with_check_expr` |
| Q-A3 | Effective SELECT/INSERT/UPDATE/DELETE/TRUNCATE for anon, authenticated and service_role | 3 rows per table (one per role), booleans |
| Q-A4 | Explicit grants, including PUBLIC | 1 row per (table, grantee, privilege) |
| Q-A5 | Column-level UPDATE/INSERT on score-authoritative columns: `pnl`, `balance`, `status`, `battle_id`, `championship_id`, `opened_at`, `elo`, `xp`, … (C-1, C-5, N-1, N-3) | 1 row per (table, column): `auth_update`, `auth_insert`, `anon_update` |
| Q-A6 | Whether authenticated can write each table under RLS (privilege plus a permissive policy) | 4 rows per table (INSERT/UPDATE/DELETE/SELECT): `has_priv`, `has_policy`, `policies` text |

### D: Profile integrity

| Query | Verifies | Expected output |
|---|---|---|
| Q-D1 | `profiles` policies | 1 row per policy |
| Q-D2 | Every non-internal trigger on score tables, with enabled state and definition (N-1: BEFORE INSERT vs INSERT OR UPDATE) | 1 row per trigger. Watch for `state = DISABLED`. |
| Q-D3 | Which competitive profile columns the **live** protection trigger resets, and whether authenticated can UPDATE them (C-5) | 13 rows: `auth_can_update_column`, `trigger_resets_column`, `trigger_function_exists` |
| Q-D4 | Whether XP/coin awards were reverted: latest ledger `balance_after` vs profile value (S-6, B-4) | 1 row of counts. `xp_mismatch > 0` or `xp_zero_but_ledger_positive > 0` supports S-6/B-4. |

### F: Championship lifecycle

| Query | Verifies | Expected output |
|---|---|---|
| Q-F1 | Any cron job calls or mentions championship lifecycle functions (B-5) | 1 row per job with booleans. All false supports B-5. |
| Q-F2 | Any other function calls the lifecycle functions | 0+ rows. 0 rows plus all-false Q-F1 means no scheduler exists. |
| Q-F3 | Overdue transitions: should have started or finalized | 1 row per status with overdue counts |
| Q-F4 | Monthly championships being auto-created | Up to 24 rows (year, month, count) |

### E: Battle integrity

| Query | Verifies | Expected output |
|---|---|---|
| Q-E1 | Battle status census, live-past-end, pre-live-past-start | 1 row per status |
| Q-E2 | Battles stuck below `min_participants` after start (B-3) | 0+ rows per status. Any row supports B-3. |
| Q-E3 | Weekly completion lag vs `end_at`: seconds suggests viewer ticks, 1–2 min suggests cron, hours suggests manual or backlog (B-1); `completed_before_end_at` (B-2) | Up to 26 weekly rows |
| Q-E4 | Battles completed **before** scheduled end, with whether the host won (B-2) | 0–200 rows |
| Q-E5 | Participants who joined after end or over capacity (N-2) | 0–200 rows |
| Q-E6 | Battle rule-violation log volume (INSERT trigger live and firing) | 1 row per `event_type` |

### H: Historical ingestion

| Query | Verifies | Expected output |
|---|---|---|
| Q-H1 | Import jobs by source, status, phase and provider over 7 days | Grouped rows |
| Q-H2 | Jobs `running`/`queued` with no progress for 30+ minutes (H-6 / HD-6) | 0–200 rows. Any row supports H-6. |
| Q-H3 | Failure classes over 7 days (first 80 characters of the message) | Up to 50 rows |
| Q-H4 | Twelve Data "success" jobs over 4+ days that fetched far fewer bars than expected (H-1) | 0–200 rows. Compare `candles_fetched` with `expected_min_bars`. |
| Q-H5 | Provider market assignments | 1 row per market |
| Q-H6 | Symbol catalog by provider: enabled, never imported, front-edge freshness | Grouped rows |
| Q-H7 | Provider credential presence (`present` boolean; ciphertext **not** selected) | 1 row per (provider, field) |
| Q-H8 | Planner row estimates for candle, job and log tables | Up to 3 rows |

### J: Environment (indirect evidence only)

| Query | Verifies | Expected output |
|---|---|---|
| Q-J1 | Service-role key and Twelve Data key usable: recent server-side import successes | Rows per (source, triggered_by) |
| Q-J2 | Cron secret accepted by the runtime: side effects per hook in 24 h | 4 rows (signal, n) |
| Q-J3 | Email queue behaviour, including stuck `processing` rows (O-1) | 1 row per status |
| Q-J4 | AI gateway path reached (rate-limit windows over 7 days) | Rows per bucket |

App env vars can't be read from SQL. These give **indirect** evidence only.
Record each variable as SET / NOT SET / UNKNOWN in the report, never a value.

### I: Suspicious / forged data (detection only, nothing repaired)

| Query | Verifies | Expected output |
|---|---|---|
| Q-I13 | Journal share exposure size (S-2) | 1 row of counts |
| Q-I9b | Prop challenge status/result census (baseline) | Grouped rows |
| Q-I5b | Account balance-drift summary | 1 row of counts |
| Q-I1 | P&L sign contradictions, closed without exit price, P&L on a flat move (C-1, C-2) | 1 row of counts |
| Q-I4 | Trades with more than one `closed` event (C-3) | 0–200 rows. Any row is a double settlement. |
| Q-I6 | Closed trades updated more than 1 minute after close (C-1, N-1) | Up to 4 rows (is_battle × is_championship) |
| Q-I12 | Battle rewards recorded with no matching XP ledger (B-4) | 1 row of counts |
| Q-I3 | Closed trades with no server-side close event (C-1) | Up to 4 grouped rows with pnl sums |
| Q-I2 | Per-symbol P&L magnitude outliers (more than 10× off the median) | 0–200 rows, competition trades first |
| Q-I5 | Account balance / statistics drift detail (BA-5, BA-11) | 0–200 rows, largest drift first |
| Q-I7 | Battle/championship trades outside the event window or by non-participants (N-1, N-3, N-7) | 0–200 rows |
| Q-I8 | ELO and battle stats inconsistent with `elo_history` / `battle_results` (C-5) | 0–200 rows with `anomaly` |
| Q-I9 | Prop challenges passed without a credible evaluation trail (P-1, P-2) | 0–200 rows with `flags` |
| Q-I10 | Battle results inconsistent with underlying trades | 0–200 rows with `anomaly` |
| Q-I11 | Championship rankings inconsistent with underlying trades | 0–200 rows |

**Any hit is a lead, not a verdict.** Check the "known benign causes" column
in `phase-0-live-verification.md` §9 before labelling anything forged.

---

## 3. How to save each result

Results directory: `docs/migrations/remediation/phase0-results/`

| Output kind | File name | Content |
|---|---|---|
| Normal result | `YYYY-MM-DD_Q-xx.csv` | Editor CSV export, header row included |
| Large text (Q-C2) | `YYYY-MM-DD_Q-C2.sql` | The `live_definition` values, one after another, separated by `-- ===== <signature>` lines |
| Zero rows | `YYYY-MM-DD_Q-xx.csv` | Header row only (or `0 rows` if the editor won't export an empty grid). Zero rows is a result. |
| Error | `YYYY-MM-DD_Q-xx.error.txt` | See §6 |

Use the **UTC date the query ran**. If a query is re-run, keep both files and
add `_run2` before the extension.

### Before committing anything

- **Section I files** (`Q-I*`), **Q-E4**, **Q-E5** and **Q-D4** can contain
  user IDs and usernames. They're production personal data. **Don't commit
  them.** Keep them outside the repository, or add
  `docs/migrations/remediation/phase0-results/private/` to `.gitignore`
  first and save them there. In the committed report, cite counts and IDs
  only as far as needed.
- **Q-G1:** open the CSV and confirm `command_redacted` contains no readable
  secret, bearer token or API key before saving it anywhere.
- **Q-C2 / Q-A2** contain function and policy source only. They're safe to
  commit, and serve as the rollback baseline.

### Run log

Append one line per query to `docs/migrations/remediation/phase0-results/RUNLOG.md`:

```
| 2026-MM-DD HH:MM UTC | Q-B1 | ok | 31 rows | saved 2026-MM-DD_Q-B1.csv |
| 2026-MM-DD HH:MM UTC | Q-G5 | error 42501 | — | saved 2026-MM-DD_Q-G5.error.txt |
```

---

## 4. Queries required before Phase 1 can become GO

These map to prerequisites G-1…G-9 in `phase-0-live-verification.md` §11.

### Required (Phase 1 steps 1.1–1.3 stay NO-GO until all are saved)

| Query | Gate | Why Phase 1 needs it |
|---|---|---|
| Q-00a | — | Proves the catalog reads ran with full visibility (not a restricted role) |
| Q-B1 | G-1, G-9 | Confirms or refutes C-6 (`commit_settlement`) and C-7 (`_join_battle_as`). Base list for the revokes. |
| Q-B2 | G-1, G-5 | The complete exposed set. Step 1.2's allow-list is reconciled against it and against every `.rpc("…")` call in `src/`. |
| Q-B3 | G-2 | The exact role and schema that step 1.3's `ALTER DEFAULT PRIVILEGES` must target |
| Q-B4 | G-3 | Every overload signature, so no revoke misses one (N-4) |
| Q-C1 | G-4 | Shows which live bodies differ from the repo. Phase 1 must never be written against a `DIFFERS` function's repo text. |
| Q-C2 | G-4, G-7 | Rollback baseline for any function Phase 1 touches |
| Q-G1 | G-6 | Which service-role cron paths exist, so revokes don't break them |
| Q-G3 | G-6 | Those jobs actually run |
| Q-G4 | G-6 | Those jobs actually succeed over HTTP |

### Also required, but not a query

- **G-5:** repo grep of `.rpc(` calls, reconciled with Q-B2.
- **G-7:** rollback files generated from the Q-B1, Q-B3 and Q-C2 output.
- **G-8:** recorded decision on a test project vs a production-only rehearsal.

### Strongly recommended before Phase 1 (don't block steps 1.1–1.3)

Q-A1…Q-A6 and Q-C3. They settle C-1, C-5, N-1 and N-2 and shape Phase 2,
but Phase 1 changes no table privileges.

### Required before Phase 2G (not Phase 1)

All of Section I, as the contamination baseline (G-10).

---

## 5. After running

Hand the saved results back and ask for the report to be updated. Each ⏳ in
`phase-0-live-verification.md` §5–§9 is resolved against its stated
confirm/refute condition, and §11 is re-scored for GO/NO-GO.

---

## 6. How to record errors

An error is evidence. **Don't edit the query to make it pass and don't skip
it.** Save `YYYY-MM-DD_Q-xx.error.txt`:

```
query:        Q-G5-vault-secret-names.sql
ran_at_utc:   2026-MM-DD HH:MM
run_as:       <value of run_as from Q-00a>
sqlstate:     42501
message:      permission denied for schema vault
detail/hint:  <verbatim, if shown>
editor_note:  <anything the editor displayed, e.g. "truncated", "timeout">
```

### Expected errors and what they mean

| Error | Likely query | Meaning | Action |
|---|---|---|---|
| `42501 permission denied …` on `vault.*`, `cron.*` or `net.*` | Q-G1…Q-G5 | The editor role lacks access to that schema | Record it. If it's on `cron.job`, Phase 1 gate G-6 is **blocked**; escalate for a role that can read `cron`. |
| `42P01 relation … does not exist` | e.g. `email_queue`, `battle_logs`, `ai_rate_limits`, `vault.secrets` | The table or extension isn't present live, which is itself a live-vs-repo difference | Record it. Note it as a finding in the report. |
| `42703 column … does not exist` | any | The live schema differs from `types.ts` | Record it, including the column name. This is a live-vs-repo difference. **Don't fix the query**; ask for a corrected variant. |
| `22P02 invalid input value for enum` | Q-E*, Q-F3 | The live enum differs from repo types | Record it. Same handling as `42703`. |
| `57014 canceling statement due to statement timeout` | Q-I2, Q-I3, Q-I5, Q-I7 | The scan is too heavy for the editor's timeout | Record it and retry off-peak once. If it fails again, ask for a date-bounded variant. |
| Editor shows success with **no grid** or a partial result | any | Possible paste truncation | Re-paste the whole file and compare the line count with the file. Record as `editor_note: truncated`. |

If a query needs a changed variant, it gets a **new file** (for example
`Q-I2a-…sql`) with the reason in its header. The original file stays unchanged.

# Phase 1 rehearsal environment: creation and parity check

**Date:** 2026-09-17 (remix 10:02 UTC; checks 10:04 to about 10:12 UTC)

**Changes:** none, to either database. Every SQL statement listed below is read-only (`SELECT`, catalog functions, `query_to_xml` over `SELECT count(*)`). `containment.sql` has **not** been run.

## 1. Projects

| | Production | Rehearsal |
|---|---|---|
| Name | THIVE ARENA | THIVE ARENA - PHASE1 REHEARSAL |
| Lovable project ID | `237f7325-035a-4d38-a67f-36c64e02b573` | `a4d32bcf-1960-4144-a713-666d55dc26b5` |
| Workspace | `IV22Gs2FsVgJDtJSxCv8` | same |
| Created by | — | `remix_project` (include_history=false, include_custom_knowledge=false) |
| Published | **yes**, public | **no** (`is_published=false`, no publish audience) |
| Visibility | workspace_edit | workspace_edit |
| Latest commit | `24edd5ef41ac24de317ed8659685adbb10110069` | `772c0ac81aefc207e0c4d1186c5630bb5902661d` |
| Production last edited | 2026-09-16 12:57:33 UTC (unchanged by the remix) | — |
| Preview URL | id-preview--237f7325… | id-preview--a4d32bcf… |
| `agentFinished` at check time | true | **false** (the Lovable agent was still active on the new project) |
| `get_database_status` | enabled, supabase | enabled, supabase |
| `get_database_connection_info` | **tool not available** in the Lovable MCP plugin | same |

## 2. Database identity (proves a separate database)

| Identifier | Production | Rehearsal |
|---|---|---|
| Supabase project ref (`supabase/config.toml`, read via MCP `read_file`) | `afhjjcivjkzcmdqzutfh` | `plcwtdcvvdhvdndnbutw` |
| `.env` `SUPABASE_URL` host | `afhjjcivjkzcmdqzutfh.supabase.co` | `plcwtdcvvdhvdndnbutw.supabase.co` |
| `pg_control_system().system_identifier` | `7662742571317219726` | `7678069749886157684` |
| `pg_postmaster_start_time()` | 2026-07-17 01:13:58 UTC | 2026-09-17 08:33:05 UTC |
| Server address | distinct (not recorded) | distinct (not recorded) |
| PostgreSQL | 17.6 | 17.6 |
| Role used by MCP | postgres | postgres |

**Verdict: a separate database.** The cluster identifier, server, start time and Supabase project ref all differ. **Not UNSAFE.**

## 3. Schema and data comparison

| Metric | Production | Rehearsal | Match |
|---|---|---|---|
| public tables | 239 | 239 | ✅ |
| public views | 2 | 2 | ✅ |
| public functions | 83 | 83 | ✅ |
| public security-definer functions | 76 | 76 | ✅ |
| public policies | 421 | 421 | ✅ |
| public non-internal triggers | 174 | 174 | ✅ |
| Relations fingerprint (name + kind) | `3f6785b9…` | `3f6785b9…` | ✅ |
| Function body fingerprint (all 83) | `bc71db1a…` | `bc71db1a…` | ✅ |
| Policy fingerprint | `5c3245aa…` | `5c3245aa…` | ✅ |
| Trigger fingerprint | `407ff738…` | `407ff738…` | ✅ |
| Default ACL fingerprint | `1f5ae099…` | `1f5ae099…` | ✅ |
| Extensions fingerprint | `cd9d9c73…` | `cd9d9c73…` | ✅ |
| **Function ACL fingerprint** | `0ef3243e…` | `90b01c0b…` | ❌ (§4) |
| `supabase_migrations.schema_migrations` table | exists | **absent** | ❌ |
| `auth.users` count | 55 | **0** | ❌ |
| `cron.job` count | 7 | **0** (0 targeting `tradershive.lovable.app`) | ❌ (desired for rehearsal) |
| `vault.secrets` count | 0 | 0 | ✅ |
| rows `paper_trades` | 183 | 0 | ❌ |
| rows `paper_accounts` | 124 | 0 | ❌ |
| rows `battles` | 35 | 0 | ❌ |
| rows `battle_participants` | 49 | 0 | ❌ |
| rows `battle_results` | 27 | 0 | ❌ |
| rows `championships` | 1 | 0 | ❌ |
| rows `prop_challenges` | 6 | 0 | ❌ |
| rows `profiles` | 55 | 0 | ❌ |
| rows `historical_candles` | ≈2,188,087 (planner estimate; exact `count(*)` was cancelled by the API, HTTP 499) | 0 (exact) | ❌ |

## 4. Containment-target functions

All 8 exist on both databases, with **identical** ACL string, effective EXECUTE, owner and body fingerprint:

| Function | ACL (both) | public / anon / auth / service | Body md5 (both) |
|---|---|---|---|
| commit_settlement(uuid,uuid,numeric) | `{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}` | t/t/t/t | 77d2b30c… |
| _join_battle_as(uuid,uuid) | same | t/t/t/t | db7d7f95… |
| tick_battle(uuid) | same | t/t/t/t | 2234ab6e… |
| join_battle(uuid,boolean) | same | t/t/t/t | b9e0e869… |
| social_follow_counts(uuid) | same | t/t/t/t | bb1aeab4… |
| journal_sync_tag_arrays_for(uuid) | same | t/t/t/t | 25671ab7… |
| journal_entry_tags_sync_trg() | same | t/t/t/t | 8e04477e… |
| journal_tags_rename_sync_trg() | same | t/t/t/t | 75b6c2df… |

This also closes the Phase 0 gap: the raw ACLs of `social_follow_counts` and the three journal helpers on **production** are now captured, and they equal the pattern `containment.sql` asserts.

### 4.1 Function ACL drift outside the targets

On **production**, 69 of 83 public functions have restricted ACLs, from earlier REVOKE migrations. On the **rehearsal** database, **all 83** carry the full default ACL `{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}`. The remix copied function definitions but **not** their privilege history.

Functions whose ACL is narrower on production (69):

- `admin_ai_usage_series`, `admin_dashboard_kpis`, `admin_growth_series`, `admin_table_sizes`
- `bump_ai_rate_limit`
- `cancel_championship_registration`, `championship_participant_count`
- `community_recompute_reputation`, `community_recompute_trending`
- `create_journal_draft_from_trade`
- `emit_battle_event`, `emit_championship_activity`
- `enforce_battle_chat_integrity`, `enforce_battle_rules_on_trade`, `enforce_championship_rules_on_trade`, `enforce_community_challenge_creator`
- `finalize_battle`, `finalize_championship`
- `get_my_profile`, `handle_new_user`
- `has_permission`, `has_role`, `is_battle_host`, `is_battle_participant`, `is_platform_admin`, `is_privileged_admin`, `is_study_group_visible`
- `join_battle_by_code`, `join_championship_live`
- `protect_profile_privileged_columns`, `protect_trade_review_target`
- `recompute_battle_live_stats`, `recompute_battle_ranking`, `recompute_championship_ranking`
- `record_practice_activity`, `register_for_championship`
- `seed_email_preferences`, `seed_gamification_stats`, `seed_paper_defaults`
- `set_trade_battle_id_from_account`, `set_trade_championship_id`
- `snapshot_system_setting`
- `start_championship`, `tick_battles`, `tick_championships`
- `trg_admin_audit_notify`, `trg_battle_log_event`, `trg_battle_participant_event`, `trg_battle_rank_event`, `trg_battle_status_event`, `trg_battle_trade_event`
- `trg_ccat_count`, `trg_cch_participant_count`, `trg_champ_rank_event`
- `trg_community_bookmark_counts`, `trg_community_comment_counts`, `trg_community_notify`, `trg_community_reaction_counts`
- `trg_group_member_count`, `trg_idea_to_post`, `trg_live_attendee_count`
- `trg_recompute_battle_ranking`, `trg_recompute_championship_ranking`
- `trg_recompute_post_trending_bookmark`, `trg_recompute_post_trending_comment`, `trg_recompute_post_trending_reaction`
- `trg_reputation_on_post`, `trg_review_notify`
- `update_updated_at_column`

Functions whose ACL is identical (14): the 8 targets, plus `calculate_elo_change`, `detect_session`, `detect_session_batch`, `paper_trade_exits_check_allocation`, `set_bug_report_reference_code`, `set_feature_request_reference_code`.

**Consequence for the rehearsal:**

- The containment blocks and their rollback can be rehearsed with exact parity. The drift guards will pass on the copy exactly as they would on production.
- The rehearsal's **no-regression baseline is not production-faithful**. Functions that fail on production for the logged-in role (N-20: AI rate limiter, championship admin actions, live battle stats, trending, admin AI usage chart) will **work** on the copy. Security-definer helpers also run with much wider access.
- `REHEARSAL.md` §1.3 parity for `Q-B2` fails.

## 5. What the remix copied

| Item | Copied? | Evidence |
|---|---|---|
| Source code | **YES (copied and rewired)**, full-tree equality **UNKNOWN** | New repo at commit `772c0ac8…`. `supabase/config.toml` and `.env` differ from production **by design** (new project ref and URL). Other files were not diffed. |
| Project settings | **PARTIAL** | Workspace and visibility (workspace_edit) match. Not published. Chat history and custom knowledge **not copied** (chosen false). Custom domain `tradershive.lovable.app` **not** carried (UNKNOWN whether any domain is attached). Other settings UNKNOWN. |
| Lovable Cloud database schema | **YES, excluding function privileges** | Identical relations, 83 function bodies, 421 policies, 174 triggers, default ACLs and extensions. Includes hand-applied objects (journal tag functions) → cloned from the **live** schema, not replayed from `supabase/migrations/`. **Function ACLs not preserved (69 differ).** `supabase_migrations.schema_migrations` absent. Table and column grants: UNKNOWN (not compared). |
| Database data | **NO** | All 9 audited tables have 0 rows (`historical_candles` included) |
| Auth / users | **NO** | `auth.users` = 0 (production 55) |
| Secrets / environment configuration | **UNKNOWN** | `.env` holds only the new project's public URL, ID and publishable key. Runtime secrets (`SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `TWELVE_DATA_API_KEY`, `LOVABLE_API_KEY`, …) cannot be listed with the available MCP tools. `vault.secrets` = 0 on both. |
| Scheduled cron jobs | **NO** | `cron.job` = 0 (pg_cron 1.6.4 installed). No job targets production. |

## 6. Classification

**NOT READY: separate database, but schema and data are incomplete.**

- **Not UNSAFE:** distinct database (§2).
- **Not NO DATABASE:** enabled and schema present.
- **Not READY:**
  1. Function privileges were not copied: 69 of 83 functions are more permissive than production.
  2. No auth users or data. This is acceptable per `REHEARSAL.md` §1.4, but smoke tests need test users created.
  3. No migration history table.
  4. Runtime secrets are unverified.
  5. The Lovable agent had not finished (`agentFinished=false`) at check time.

**To reach READY** (each step changes only the **rehearsal** database and needs explicit approval first):

1. Wait for the rehearsal project's agent to finish, then re-run the identity and fingerprint checks.
2. Reconcile the 69 function ACLs on the rehearsal database to production. Generate the GRANT/REVOKE set from the production per-function ACL capture (P5), then confirm the function ACL fingerprint equals `0ef3243e…`.
3. Compare table and column grants (`Q-A3`/`Q-A4`) and reconcile if they differ.
4. Create test users USER_A and USER_B through the rehearsal preview (sign-up only).
5. Confirm required runtime secrets exist on the rehearsal project (Lovable UI). Do **not** copy production's `CRON_SECRET`, and do **not** create cron jobs pointing at production.

## 7. Queries used (read-only)

| ID | Purpose | Run on |
|---|---|---|
| P1 | `current_database, current_user, version(), pg_control_system().system_identifier, inet_server_addr, cluster_name, pg_postmaster_start_time` | both |
| P2 / P2b | Counts of public tables, views, functions, security-definer functions, policies and triggers; schema_migrations presence; `auth.users`, `cron.job`, `vault.secrets` counts; per-table `count(*)` (P2b uses `pg_stat_user_tables.n_live_tup` for `historical_candles` on production after P2 was cancelled) | rehearsal (P2), production (P2b) |
| P3 | 8 target functions: existence, `proacl`, effective EXECUTE per role, owner, body md5 | both |
| P4 | md5 fingerprints of relations, function bodies, policies, triggers, default ACLs, function ACLs, extensions. The first attempt failed on both with `42725` (`text \|\| "char"`); re-run with explicit casts. | both |
| P5 | Per-function `proacl` for all public functions (to localise the P4 ACL difference) | both |
| — | MCP `read_file` `supabase/config.toml` (both) and `.env` (rehearsal). The publishable key is public by design and is **not** reproduced here. | both |

# TradersHIVE Admin Dashboard — Full Build Plan

The project already ships a thin admin console under `/admin/*` with 20 routes, a shell, a permissions helper, an audit helper and 475 lines of server functions. This plan **expands what exists** into the professional 19-section console you described — it does not rebuild it from scratch.

## Scope decisions (please confirm)

1. **Revenue / Stripe (Section 8)** — the codebase has no billing tables yet. I'll ship the UI with clearly-labelled empty states + a `subscriptions` schema stub so it lights up the day Stripe is wired. No fake numbers.
2. **Support Centre (Section 6)** — `support_tickets` exists (11 cols) but no bugs/feedback tables. I'll add `bug_reports` and `feature_requests` tables and unify the inbox.
3. **Notifications (Section 10)** — no `admin_notifications` table. I'll add one and seed it from cron/error triggers already present.
4. **Global search (Section 16)** — server-side ILIKE across users / sessions / trades / tickets / logs behind one `adminGlobalSearch` fn. No new search infra (Meilisearch/pgvector) unless you ask.
5. **AI conversations viewer (Section 5)** — read-only view of `ai_chat_sessions` / `ai_chat_messages` for admins, gated by a new `ai:read_conversations` permission (privacy-sensitive).

If any of the above should change, tell me before I start.

## What already exists (kept, hardened)

- `AdminShell.tsx`, `admin.tsx` layout, sidebar
- Routes: dashboard, users, roles, feature-flags, logs, settings, market-data, historical, storage, trades, journal, achievements, challenges, championships, content, leaderboards, reports, announcements
- `src/lib/admin/permissions.ts`, `audit.server.ts`, `admin.functions.ts`
- DB: `user_roles`, `role_permissions`, `has_role`, `has_permission`, `is_platform_admin`, `admin_audit_logs`, `feature_flags`, `system_settings`, `support_tickets`, `announcements`, `maintenance_windows`

## What gets added / rebuilt

### Database (one migration)
- `bug_reports`, `feature_requests`, `contact_messages`, `user_feedback`
- `admin_notifications` (+ trigger on `admin_audit_logs` severity=error, cron failures)
- `subscription_plans`, `user_subscriptions`, `subscription_events` (Stripe-shaped, unused for now)
- `admin_security_events` (failed logins from `auth_logs`, permission changes, rate-limit breaches)
- `admin_saved_views` (per-admin table filters)
- New permissions inserted into `role_permissions`: `users:*`, `subs:*`, `ai:read_conversations`, `support:*`, `flags:write`, `security:read`, `db:read`, `notifications:read`. Super Admin gets all; other roles get scoped subsets (Support: users:read + support:*; Analyst: read-only everything; Moderator: users:suspend + support:*; Developer: flags + db + logs; Administrator: everything except super-admin-only destructive ops).
- Owner-scoped SELECT + admin-scoped SELECT policies on every new table; GRANTs to `authenticated` + `service_role`.
- Helper RPCs: `admin_kpis()`, `admin_growth_series(days int)`, `admin_ai_usage(days int)`, `admin_top_pages(days int)`, `admin_table_sizes()` — all `SECURITY DEFINER` + `is_platform_admin(auth.uid())` gate at top.

### Server functions (`src/lib/admin/*.functions.ts`, split by domain)
- `overview.functions.ts` — `getAdminKpis`, `getUserGrowth`, `getRecentActivity`
- `users.functions.ts` — `listUsers` (server pagination, filter, sort), `getUserDetail`, `suspendUser`, `activateUser`, `deleteUser`, `resetTrial`, `grantPremium`, `revokePremium`, `changeRole`, `banUser`, `adminResetPassword` (via `supabaseAdmin.auth.admin`)
- `subscriptions.functions.ts` — CRUD + `extendSubscription`, `refund` (stub)
- `replay.functions.ts` — session stats, delete-broken, reprocess (marks queue row)
- `ai.functions.ts` (admin-scoped) — usage aggregates, failed retries, conversation viewer
- `support.functions.ts` — unified inbox, assign/resolve/tag/priority
- `analytics.functions.ts` — DAU/WAU/MAU/retention/churn from `auth.users` + `ai_usage_logs`
- `revenue.functions.ts` — stubs returning zeros until Stripe
- `flags.functions.ts` — already exists; add `setFlag` with audit
- `notifications.functions.ts` — list, ack, dismiss
- `audit.functions.ts` — search/filter/export CSV
- `health.functions.ts` — DB size, storage, cron heartbeats, provider status
- `security.functions.ts` — failed logins (from `auth_logs` via `supabase--analytics_query`-equivalent server call), rate limit breaches
- `database.functions.ts` — read-only `pg_stat_user_tables`, `pg_indexes`, `pg_stat_statements`
- `search.functions.ts` — `adminGlobalSearch(term)` fanning to 6 tables
- Every mutating fn: `.middleware([requireSupabaseAuth])` + explicit `has_permission(userId, '<key>')` check + `logAdminAction()` before returning.

### Routes rebuilt/added under `/admin`
Rebuilt: `dashboard`, `users`, `users.$userId` (new detail page with 11 tabs), `feature-flags`, `logs`, `settings`, `roles`
Added: `subscriptions`, `subscriptions.$id`, `replay`, `ai`, `ai.conversations.$sessionId`, `support`, `support.$ticketId`, `analytics`, `revenue`, `notifications`, `health`, `security`, `database`, `search`

Each list route: virtualised table via `@tanstack/react-virtual` (already in tree), server-side pagination, saved views, CSV export.

### Shared components (`src/components/admin/`)
`DataTable.tsx` (generic, virtualised, sortable, server-paginated) · `Filters.tsx` · `SavedViewsMenu.tsx` · `KpiCard.tsx` (extend) · `TrendChart.tsx` · `StatusPill.tsx` · `PermissionGate.tsx` · `AuditTrailList.tsx` · `AdminSearchPalette.tsx` (⌘K, hooks into `adminGlobalSearch`) · `HealthLight.tsx` · `NotificationBell.tsx`

### RBAC enforcement
- Route guards via existing `_authenticated` layout + a new `_authenticated/admin/route.tsx` `beforeLoad` calling a `requireAdminPermission(key)` server fn on entry. Individual sensitive sub-routes gate further.
- Client: `PermissionGate` hides UI it can't call. Server always re-checks — client is decoration.
- No blanket "admin bypass" — every mutating fn checks the exact permission key.

### Audit & notifications
- Every mutation calls `logAdminAction({ action, target_type, target_id, before, after, ip })`.
- Trigger writes to `admin_notifications` on error-severity audit rows, failed cron runs (`historical_sync_logs.status='error'`), and rate-limit breaches. Bell in shell polls `notifications:unread_count` every 60s.

### Performance
- Server pagination + cursor keyset on `admin_audit_logs`, `ai_chat_messages`, `paper_trades`
- Materialised `admin_daily_stats` refreshed by a scheduled server route `/api/public/hooks/admin-stats-refresh` (pg_cron every 15m, signed with `WEBHOOK_SECRET`)
- Virtualised tables · lazy-loaded route chunks · Query caching 30-60s per KPI

### QA checklist
- Non-admin hitting `/admin/*` → redirect to `/dashboard`
- Permission-scoped route reachable only for granted role
- Every mutation writes an audit row
- Typecheck clean (`bunx tsgo`)
- No `SECURITY DEFINER` RPC callable by anon

## Order of work

1. Migration (schema + policies + permissions + RPCs) — ships as one migration for review
2. `admin/*.functions.ts` server layer + audit wiring
3. Shell + RBAC guard + shared components (DataTable, SearchPalette, NotificationBell)
4. Overview / Users / User Detail / Roles (highest-value first)
5. Support / Notifications / Audit / Security / Health / Database
6. Replay / AI / Analytics / Subscriptions / Revenue (stubs) / Feature Flags / Settings
7. Typecheck, visual pass, close

## Non-goals (explicit)

- No fabricated Stripe/MRR numbers — Revenue is stub UI + real schema
- No direct SQL execution UI
- No new external services (Meilisearch, Sentry) unless you ask
- Auth/Landing/Dashboard/Paper Trading/Journal/Challenges/Statistics remain untouched per your standing rule

Approve to start with the migration, or tell me what to change.

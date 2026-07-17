# Admin Panel & Platform Management — Build Plan

An enterprise-grade admin workspace layered on top of the existing `_authenticated/admin.tsx` stub, reusing the current design system, `has_role` RBAC, and Supabase schema.

## Scope (routes)

Nested under `/admin` with its own sidebar shell:

- `/admin` → redirect to `/admin/dashboard`
- `dashboard` — KPIs (users, active, trades, journal, challenges, XP today, storage, error rate)
- `users` — table + drawer + bulk + user actions (suspend/ban/reset/grant)
- `trades` — all paper trades, filters, soft delete, audit
- `journal` — moderation of shared entries, hide/delete/restore
- `challenges` — CRUD, duplicate, archive, schedule, enable/disable
- `achievements` — CRUD achievements/badges/titles
- `leaderboards` — recalculate, reset season, promote/demote, exclude
- `reports` — generate CSV/JSON exports (users, trades, journal, challenges, activity)
- `content` — FAQ / Help / Terms / Privacy / Tutorials / Banners (CMS)
- `announcements` — banners/popups/notifications with schedule
- `settings` — platform settings with version history
- `logs` — audit + application/auth/error/security logs
- `storage` — file browser across buckets, delete/restore
- `roles` — custom roles + granular permissions matrix
- `feature-flags` — toggles + rollout % for AI Coach, Guilds, etc.

## Access control

- Extend `app_role` enum: `super_admin`, `admin`, `moderator`, `support`, `content_manager`, `developer`, `analyst` (in addition to existing `admin`/`member`).
- New `admin_permissions` + `role_permissions` (permission = `resource:action`, e.g. `users:suspend`).
- `has_permission(_user_id, _permission)` SECURITY DEFINER function.
- Route gate: existing pattern in `/admin` (redirect if not admin) extended to check `has_permission`.
- `<Permission need="...">` component + `usePermission` hook for UI gating.
- Only `super_admin` may edit roles/permissions or system settings.

## Database (single migration)

New tables (all with GRANTs + RLS + `has_permission` policies + soft-delete `deleted_at`):

- `admin_permissions(key, label, group)` — seeded catalog
- `role_permissions(role app_role, permission_key)`
- `admin_audit_logs(admin_id, action, resource, resource_id, meta jsonb, ip, ua, created_at)`
- `feature_flags(key, label, description, enabled, rollout_percent, audience jsonb)`
- `announcements(kind, title, body, severity, starts_at, ends_at, published, audience jsonb)`
- `system_settings(key, value jsonb, updated_by)` + `system_settings_history`
- `maintenance_windows(starts_at, ends_at, message, active)`
- `content_pages(slug, title, body, kind, published, version)`
- `notification_campaigns(title, body, audience jsonb, channel, scheduled_at, sent_at)`
- `notification_recipients(campaign_id, user_id, read_at)`
- `support_tickets(user_id, subject, body, status, assigned_to)`
- `system_reports(kind, params jsonb, generated_by, file_path, created_at)`
- `user_moderation(user_id, status enum{active,suspended,banned}, reason, until, moderator_id)` + soft-delete columns on `profiles` via `deleted_at`.

Seed: default permissions + baseline role→permission mapping.

## Server layer

`src/lib/admin.functions.ts` + split modules:
- `admin/users.functions.ts` — list/search/suspend/ban/restore/reset/grant (uses `supabaseAdmin` after `has_permission` check).
- `admin/moderation.functions.ts` — journal/trade moderation.
- `admin/challenges.functions.ts`, `achievements.functions.ts` — CRUD.
- `admin/leaderboard.functions.ts` — recalc/reset/promote/demote.
- `admin/settings.functions.ts` — settings, feature flags, announcements, content.
- `admin/logs.functions.ts` — audit + report queries.
- `admin/storage.functions.ts` — bucket listing/delete via admin client.
- `admin/reports.functions.ts` — CSV/JSON generation.
- `admin/dashboard.functions.ts` — KPI aggregation.

Every mutation writes to `admin_audit_logs` via a shared `logAudit(ctx, …)` helper.

## UI shell & components

`src/routes/_authenticated/admin.tsx` becomes a layout with:
- Collapsible admin sidebar (Dashboard, Users, Content, Ops, System groups)
- Top bar: env badge, search, quick nav
- `<Outlet />`

Reusable components in `src/components/admin/`:
- `KpiCard`, `AdminTable` (virtualized w/ TanStack Table), `FiltersToolbar`, `BulkActionBar`, `EntityDrawer`, `ConfirmDialog`, `AuditTrail`, `PermissionMatrix`, `RolePicker`, `AudienceBuilder`, `RichTextEditor` (tiptap already? if not, textarea + markdown), `FeatureFlagToggle`, `AnnouncementCard`, `StorageBrowser`, `LogViewer`, `JsonDiff` (settings history).

Feature-flag UI hook: `useFeatureFlag(key)` reads from `feature_flags` (client cached, invalidated on flag change).

## Business rules

- Soft delete everywhere (`deleted_at`); list views filter it, `Restore` clears it.
- Confirmations for destructive/critical actions; typed-name confirmation for bans/resets.
- Settings changes snapshot into `system_settings_history` (JSON diff view).
- `super_admin` only for roles/permissions/system settings.
- All admin API calls: `requireSupabaseAuth` → `has_permission` check → action → audit log.

## Non-goals for this build

Payments, guild/marketplace/battle arena screens (feature-flag placeholders only). PDF export (CSV/JSON only). Real IP/device capture wired from request headers when available; UI shows "—" otherwise. Email send is scaffolded via a `notification_campaigns` queue row; no SMTP wired.

## Files (approximate)

- 1 SQL migration (~500 lines)
- 8 server-fn modules under `src/lib/admin/`
- 15 route files under `src/routes/_authenticated/admin/`
- ~20 components under `src/components/admin/`
- Extend `has_permission` + audit helper

## Risk / open questions

1. New roles beyond existing `admin`/`member` — safe to extend the enum? (default: yes, add via `ALTER TYPE`.)
2. Rich text: install `@tiptap/*` (fast) or ship a lightweight markdown editor?
3. Real-time propagation: use `supabase.channel` for `feature_flags` + `system_settings`?

Confirm and I'll build the whole thing in one pass.
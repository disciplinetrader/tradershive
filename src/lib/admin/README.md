# Admin

Role-Based Access Control (RBAC) gated admin surface for managing users,
roles, settings, achievements, trading logs, market-data providers and
audit trails.

## Files

- `permissions.ts` — Client-safe helpers for gating UI (`canAccessAdmin`,
  role predicates). Never trust these for security — server functions
  re-check via `has_role()` under RLS.
- `audit.server.ts` — Writes to `admin_audit_log`. Every mutating admin
  action funnels through this so we have a searchable trail.
- `format.ts` — Table formatters for the admin panel UI.
- `settings.functions.ts` — Global settings server functions
  (feature flags, provider config, quotas).

## Server surface

`src/lib/admin.functions.ts` — protected server functions.
Authorization pattern:

1. `.middleware([requireSupabaseAuth])` verifies the session.
2. Inside `.handler()`, query the caller's own `user_roles` row via
   `context.supabase` (RLS-bound) to confirm they hold `admin` or
   `moderator`.
3. Only then load `supabaseAdmin` via dynamic import to perform the
   privileged mutation.

Never use `supabaseAdmin` to establish authorization — it bypasses RLS.

## RBAC storage

Roles live in `public.user_roles` (NOT on `profiles`). The
`has_role(user_id, role)` security-definer function is used inside RLS
policies to avoid recursion.

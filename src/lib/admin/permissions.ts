import { useAuth } from "@/hooks/use-auth";

export const PERMISSIONS = {
  DashboardView: "dashboard:view",
  UsersView: "users:view",
  UsersEdit: "users:edit",
  UsersSuspend: "users:suspend",
  UsersDelete: "users:delete",
  UsersReset: "users:reset",
  UsersGrant: "users:grant",
  UsersRole: "users:role",
  TradesView: "trades:view",
  TradesManage: "trades:manage",
  JournalView: "journal:view",
  JournalManage: "journal:manage",
  ChallengesView: "challenges:view",
  ChallengesManage: "challenges:manage",
  AchievementsView: "achievements:view",
  AchievementsManage: "achievements:manage",
  LeaderboardManage: "leaderboard:manage",
  ReportsView: "reports:view",
  ContentManage: "content:manage",
  AnnouncementsManage: "announcements:manage",
  SettingsView: "settings:view",
  SettingsManage: "settings:manage",
  LogsView: "logs:view",
  StorageView: "storage:view",
  StorageManage: "storage:manage",
  RolesManage: "roles:manage",
  FlagsManage: "flags:manage",
  NotificationsManage: "notifications:manage",
  SupportManage: "support:manage",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ADMIN_ROLES = [
  "super_admin",
  "admin",
  "moderator",
  "support",
  "content_manager",
  "developer",
  "analyst",
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

const ROLE_META: Record<AdminRole, { label: string; description: string; color: string }> = {
  super_admin: { label: "Super Admin", description: "Full control of the platform", color: "text-rose-400" },
  admin: { label: "Admin", description: "Manage users, content and operations", color: "text-primary" },
  moderator: { label: "Moderator", description: "Moderate community content", color: "text-amber-400" },
  support: { label: "Support", description: "Assist users and answer tickets", color: "text-cyan-400" },
  content_manager: { label: "Content Manager", description: "Publish announcements & content", color: "text-emerald-400" },
  developer: { label: "Developer", description: "Feature flags & storage", color: "text-indigo-400" },
  analyst: { label: "Analyst", description: "Reports & analytics only", color: "text-fuchsia-400" },
};

export function roleMeta(role: string) {
  return ROLE_META[role as AdminRole] ?? { label: role, description: "", color: "text-muted-foreground" };
}

export function isPlatformAdmin(roles: string[] | undefined | null) {
  if (!roles) return false;
  return roles.some((r) => (ADMIN_ROLES as readonly string[]).includes(r));
}

/** Best-effort client-side permission check (server always re-verifies). */
export function useHasPermission(permission: PermissionKey): boolean {
  const { roles } = useAuth();
  if (!roles) return false;
  if (roles.includes("super_admin" as any)) return true;
  // Client is optimistic – server RLS is source of truth. Admin has all except role/settings manage.
  if (roles.includes("admin" as any) && permission !== PERMISSIONS.RolesManage && permission !== PERMISSIONS.SettingsManage) {
    return true;
  }
  return false;
}

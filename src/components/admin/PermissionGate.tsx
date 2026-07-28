import { ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { PERMISSIONS, isPlatformAdmin, type PermissionKey } from "@/lib/admin/permissions";

/**
 * Client-side permission-gated render. Server always re-validates — this only
 * hides UI the caller can't successfully invoke to reduce noise.
 */
export function PermissionGate({
  permission,
  fallback = null,
  children,
}: {
  permission: PermissionKey;
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const { roles } = useAuth();
  const list = (roles ?? []) as string[];
  const superAdmin = list.includes("super_admin");
  const admin = list.includes("admin");
  // Super admin sees everything; admin sees everything except role-management + super-admin-only ops.
  const allowed =
    superAdmin ||
    (admin && permission !== PERMISSIONS.RolesManage) ||
    (isPlatformAdmin(list) && permission === PERMISSIONS.DashboardView);
  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}

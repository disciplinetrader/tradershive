import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listPermissions, setRolePermission } from "@/lib/admin/settings.functions";
import { GlassCard } from "@/components/ui/glass-card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ADMIN_ROLES, roleMeta } from "@/lib/admin/permissions";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/admin/roles")({
  component: AdminRoles,
});

function AdminRoles() {
  const qc = useQueryClient();
  const { roles: myRoles } = useAuth();
  const isSuper = (myRoles ?? []).includes("super_admin" as any);
  const listFn = useServerFn(listPermissions);
  const setFn = useServerFn(setRolePermission);

  const q = useQuery({ queryKey: ["admin-perms"], queryFn: () => listFn({}) });
  const mut = useMutation({
    mutationFn: (v: { role: string; permissionKey: string; enabled: boolean }) => setFn({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-perms"] }); toast.success("Saved"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const has = (role: string, key: string) =>
    (q.data?.mappings ?? []).some((m: any) => m.role === role && m.permission_key === key);

  const groups: Record<string, any[]> = {};
  (q.data?.permissions ?? []).forEach((p: any) => {
    (groups[p.group_name] ??= []).push(p);
  });

  return (
    <div className="space-y-4">
      <GlassCard className="p-4">
        <h3 className="text-sm font-semibold">Roles & permissions</h3>
        <p className="text-xs text-muted-foreground">
          Fine-grained permission matrix. Super Admin has all permissions implicitly.
          {!isSuper ? " (Read-only — only Super Admin can edit.)" : ""}
        </p>
      </GlassCard>

      {q.isLoading ? (
        <Skeleton className="h-96 w-full rounded-2xl" />
      ) : (
        <GlassCard className="overflow-x-auto p-0">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 border-b border-border/60 bg-surface/70 backdrop-blur text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="p-3 text-left">Permission</th>
                {ADMIN_ROLES.filter((r) => r !== "super_admin").map((r) => (
                  <th key={r} className={"p-3 text-center " + roleMeta(r).color}>{roleMeta(r).label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(groups).map(([group, perms]) => (
                <>
                  <tr key={group} className="bg-surface/30"><td colSpan={ADMIN_ROLES.length} className="p-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{group}</td></tr>
                  {perms.map((p) => (
                    <tr key={p.key} className="border-b border-border/40">
                      <td className="p-3">
                        <div className="text-sm">{p.label}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">{p.key}</div>
                      </td>
                      {ADMIN_ROLES.filter((r) => r !== "super_admin").map((r) => (
                        <td key={r} className="p-3 text-center">
                          <Checkbox
                            checked={has(r, p.key)}
                            disabled={!isSuper || mut.isPending}
                            onCheckedChange={(v) => mut.mutate({ role: r, permissionKey: p.key, enabled: !!v })}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </GlassCard>
      )}
    </div>
  );
}

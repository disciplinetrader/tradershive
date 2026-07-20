import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listUsers, getUserDetails, moderateUser, softDeleteUser, grantReward,
  resetUserData, assignRole,
} from "@/lib/admin.functions";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { ADMIN_ROLES, roleMeta } from "@/lib/admin/permissions";
import { Ban, RotateCcw, Search, ShieldPlus, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/admin/users")({
  component: AdminUsers,
});

function AdminUsers() {
  const qc = useQueryClient();
  const listFn = useServerFn(listUsers);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "suspended" | "banned" | "deleted">("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["admin-users", search, status, page],
    queryFn: () => listFn({ data: { search: search || null, status, page, pageSize: 25, sortBy: "created_at", sortDir: "desc" } }),
  });

  return (
    <div className="space-y-4">
      <GlassCard className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search username, email, name…"
              className="pl-8"
            />
          </div>
          <Select value={status} onValueChange={(v: any) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="banned">Banned</SelectItem>
              <SelectItem value="deleted">Deleted</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">{query.data?.total ?? 0} total</span>
        </div>
      </GlassCard>

      <GlassCard className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-border/60 bg-surface/40 text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="p-3 text-left">User</th>
                <th className="p-3 text-left">Country</th>
                <th className="p-3 text-left">Roles</th>
                <th className="p-3 text-right">Level</th>
                <th className="p-3 text-right">XP</th>
                <th className="p-3 text-right">Coins</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Joined</th>
              </tr>
            </thead>
            <tbody>
              {query.isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/40">
                      <td colSpan={8} className="p-2"><Skeleton className="h-8 w-full" /></td>
                    </tr>
                  ))
                : (query.data?.rows ?? []).map((u: any) => (
                    <tr
                      key={u.id}
                      onClick={() => setSelected(u.id)}
                      className="cursor-pointer border-b border-border/40 transition hover:bg-surface/50"
                    >
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-primary">
                            {u.avatar_url ? <img src={u.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" /> : <User className="h-3.5 w-3.5" />}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">{u.display_name ?? u.username}</div>
                            <div className="truncate text-[11px] text-muted-foreground">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">{u.country ?? "—"}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {(u.roles ?? []).map((r: string) => (
                            <Badge key={r} variant="outline" className={"text-[10px] " + roleMeta(r).color}>{roleMeta(r).label}</Badge>
                          ))}
                          {u.roles?.length === 0 ? <span className="text-[10px] text-muted-foreground">—</span> : null}
                        </div>
                      </td>
                      <td className="p-3 text-right font-mono">{u.level}</td>
                      <td className="p-3 text-right font-mono">{u.xp?.toLocaleString?.() ?? 0}</td>
                      <td className="p-3 text-right font-mono">{u.coins?.toLocaleString?.() ?? 0}</td>
                      <td className="p-3">
                        {u.deleted_at ? (
                          <Badge variant="destructive" className="text-[10px]">Deleted</Badge>
                        ) : u.moderation?.status === "banned" ? (
                          <Badge variant="destructive" className="text-[10px]">Banned</Badge>
                        ) : u.moderation?.status === "suspended" ? (
                          <Badge className="bg-warning/10 text-warning text-[10px]">Suspended</Badge>
                        ) : (
                          <Badge className="bg-success/10 text-success text-[10px]">Active</Badge>
                        )}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {u.created_at ? formatDistanceToNow(new Date(u.created_at), { addSuffix: true }) : "—"}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-border/60 p-3 text-xs">
          <span>Page {page}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
            <Button
              size="sm"
              variant="outline"
              disabled={(query.data?.rows?.length ?? 0) < 25}
              onClick={() => setPage((p) => p + 1)}
            >Next</Button>
          </div>
        </div>
      </GlassCard>

      <UserDrawer userId={selected} onClose={() => setSelected(null)} onChanged={() => qc.invalidateQueries({ queryKey: ["admin-users"] })} />
    </div>
  );
}

function UserDrawer({ userId, onClose, onChanged }: { userId: string | null; onClose: () => void; onChanged: () => void }) {
  const detailsFn = useServerFn(getUserDetails);
  const modFn = useServerFn(moderateUser);
  const delFn = useServerFn(softDeleteUser);
  const grantFn = useServerFn(grantReward);
  const resetFn = useServerFn(resetUserData);
  const roleFn = useServerFn(assignRole);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-user", userId],
    queryFn: () => detailsFn({ data: { userId: userId! } }),
    enabled: !!userId,
  });

  const [confirm, setConfirm] = useState<null | { title: string; description?: string; onConfirm: () => Promise<void>; destructive?: boolean }>(null);
  const [grantAmount, setGrantAmount] = useState(100);
  const [grantKind, setGrantKind] = useState<"xp" | "coins">("xp");
  const [selectedRole, setSelectedRole] = useState<string>("moderator");

  const run = (mut: () => Promise<any>, success: string) => async () => {
    try {
      await mut();
      toast.success(success);
      await refetch();
      onChanged();
      setConfirm(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
      setConfirm(null);
    }
  };

  return (
    <Sheet open={!!userId} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{data?.profile?.display_name ?? data?.profile?.username ?? "User"}</SheetTitle>
          <SheetDescription>{data?.profile?.email}</SheetDescription>
        </SheetHeader>
        {isLoading ? (
          <div className="space-y-2 py-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
        ) : data ? (
          <div className="space-y-5 py-4">
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <Stat label="Level" value={data.profile?.level ?? 0} />
              <Stat label="XP" value={data.profile?.xp?.toLocaleString?.() ?? 0} />
              <Stat label="Coins" value={data.profile?.coins?.toLocaleString?.() ?? 0} />
              <Stat label="Trades" value={data.tradeCount} />
              <Stat label="Journal" value={data.journalCount} />
              <Stat label="League" value={data.profile?.league ?? "—"} />
            </div>

            <Section title="Moderation">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setConfirm({
                  title: "Suspend this user?",
                  description: "They will lose access to protected features until unsuspended.",
                  onConfirm: run(() => modFn({ data: { userId: userId!, action: "suspend" } }), "Suspended"),
                })}><Ban className="mr-1 h-3.5 w-3.5" /> Suspend</Button>
                <Button size="sm" variant="destructive" onClick={() => setConfirm({
                  title: "Ban this user?",
                  description: "This is a critical action. They can no longer sign in.",
                  destructive: true,
                  onConfirm: run(() => modFn({ data: { userId: userId!, action: "ban" } }), "Banned"),
                })}><Ban className="mr-1 h-3.5 w-3.5" /> Ban</Button>
                <Button size="sm" variant="outline" onClick={() => run(() => modFn({ data: { userId: userId!, action: "unsuspend" } }), "Reinstated")()}>Reinstate</Button>
                {data.profile?.deleted_at ? (
                  <Button size="sm" variant="outline" onClick={() => run(() => delFn({ data: { userId: userId!, restore: true } }), "Restored")()}>Restore</Button>
                ) : (
                  <Button size="sm" variant="destructive" onClick={() => setConfirm({
                    title: "Soft-delete this user?",
                    description: "The profile becomes hidden but can be restored.",
                    destructive: true,
                    onConfirm: run(() => delFn({ data: { userId: userId!, restore: false } }), "Deleted"),
                  })}><Trash2 className="mr-1 h-3.5 w-3.5" /> Soft delete</Button>
                )}
              </div>
            </Section>

            <Section title="Grant reward">
              <div className="flex items-center gap-2">
                <Select value={grantKind} onValueChange={(v: any) => setGrantKind(v)}>
                  <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="xp">XP</SelectItem>
                    <SelectItem value="coins">Coins</SelectItem>
                  </SelectContent>
                </Select>
                <Input type="number" value={grantAmount} onChange={(e) => setGrantAmount(Number(e.target.value))} className="w-[120px]" />
                <Button size="sm" onClick={run(() => grantFn({ data: { userId: userId!, kind: grantKind, amount: grantAmount } }), "Granted")}>Grant</Button>
              </div>
            </Section>

            <Section title="Reset data">
              <div className="flex flex-wrap gap-2 text-xs">
                {(["xp", "coins", "challenges", "statistics", "paper_accounts"] as const).map((s) => (
                  <Button key={s} size="sm" variant="outline" onClick={() => setConfirm({
                    title: `Reset ${s}?`,
                    description: "This deletes the corresponding rows and cannot be undone.",
                    destructive: true,
                    onConfirm: run(() => resetFn({ data: { userId: userId!, scope: s } }), "Reset"),
                  })}><RotateCcw className="mr-1 h-3.5 w-3.5" /> {s.replace("_", " ")}</Button>
                ))}
              </div>
            </Section>

            <Section title="Roles">
              <div className="flex flex-wrap gap-1">
                {(data.roles ?? []).map((r: string) => (
                  <Badge key={r} variant="outline" className={roleMeta(r).color}>{roleMeta(r).label}
                    <button className="ml-1 opacity-60 hover:opacity-100" onClick={run(() => roleFn({ data: { userId: userId!, role: r, add: false } }), "Removed")}>×</button>
                  </Badge>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                  <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ADMIN_ROLES.map((r) => <SelectItem key={r} value={r}>{roleMeta(r).label}</SelectItem>)}
                    <SelectItem value="premium">Premium</SelectItem>
                    <SelectItem value="member">Member</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={run(() => roleFn({ data: { userId: userId!, role: selectedRole, add: true } }), "Role granted")}><ShieldPlus className="mr-1 h-3.5 w-3.5" /> Grant</Button>
              </div>
            </Section>
          </div>
        ) : null}
      </SheetContent>
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={() => setConfirm(null)}
        title={confirm?.title ?? ""}
        description={confirm?.description}
        destructive={confirm?.destructive}
        onConfirm={() => confirm?.onConfirm()}
      />
    </Sheet>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-xl border border-border/60 bg-surface/40 p-2">
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-bold">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{title}</h4>
      {children}
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAdminChallenges, toggleChallenge } from "@/lib/admin/settings.functions";
import { GlassCard } from "@/components/ui/glass-card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/challenges")({
  component: AdminChallenges,
});

function AdminChallenges() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAdminChallenges);
  const toggleFn = useServerFn(toggleChallenge);
  const q = useQuery({ queryKey: ["admin-challenges"], queryFn: () => listFn({}) });
  const mut = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => toggleFn({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-challenges"] }); toast.success("Saved"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <div className="space-y-4">
      <GlassCard className="p-4">
        <h3 className="text-sm font-semibold">Challenges catalog</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Toggle challenges live. Progress recalculates automatically on the next user action.
        </p>
      </GlassCard>

      <GlassCard className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-border/60 bg-surface/40 text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="p-3 text-left">Title</th>
                <th className="p-3 text-left">Scope</th>
                <th className="p-3 text-right">XP</th>
                <th className="p-3 text-right">Coins</th>
                <th className="p-3 text-right">Active</th>
              </tr>
            </thead>
            <tbody>
              {q.isLoading
                ? Array.from({ length: 6 }).map((_, i) => <tr key={i}><td colSpan={5} className="p-2"><Skeleton className="h-8 w-full" /></td></tr>)
                : (q.data ?? []).map((c: any) => (
                    <tr key={c.id} className="border-b border-border/40 hover:bg-surface/50">
                      <td className="p-3">
                        <div className="text-sm font-semibold">{c.title}</div>
                        <div className="text-[11px] text-muted-foreground">{c.description}</div>
                      </td>
                      <td className="p-3"><Badge variant="outline">{c.scope}</Badge></td>
                      <td className="p-3 text-right font-mono">{c.xp_reward}</td>
                      <td className="p-3 text-right font-mono">{c.coin_reward ?? 0}</td>
                      <td className="p-3 text-right">
                        <Switch checked={c.active ?? false} onCheckedChange={(v) => mut.mutate({ id: c.id, active: v })} />
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}

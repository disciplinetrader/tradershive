import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAdminAchievements } from "@/lib/admin/settings.functions";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/admin/achievements")({
  component: AdminAchievements,
});

function AdminAchievements() {
  const fn = useServerFn(listAdminAchievements);
  const q = useQuery({ queryKey: ["admin-achievements"], queryFn: () => fn({}) });

  return (
    <div className="space-y-4">
      <GlassCard className="p-4">
        <h3 className="text-sm font-semibold">Achievements & badges</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Achievements automatically unlock based on user activity. Manage rewards and categories.
        </p>
      </GlassCard>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {q.isLoading
          ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)
          : (q.data ?? []).map((a: any) => (
              <GlassCard key={a.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{a.name}</div>
                    <div className="text-[11px] text-muted-foreground">{a.description}</div>
                  </div>
                  <Badge variant="outline">{a.category ?? "general"}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div><div className="text-[9px] uppercase text-muted-foreground">XP</div><div className="font-mono font-bold">{a.xp_reward ?? 0}</div></div>
                  <div><div className="text-[9px] uppercase text-muted-foreground">Coins</div><div className="font-mono font-bold">{a.coin_reward ?? 0}</div></div>
                  <div><div className="text-[9px] uppercase text-muted-foreground">Tier</div><div className="font-mono font-bold">{a.tier ?? "—"}</div></div>
                </div>
              </GlassCard>
            ))}
      </div>
    </div>
  );
}

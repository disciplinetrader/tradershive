import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { leaderboardAction } from "@/lib/admin/settings.functions";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { RotateCw, ArrowUp, ArrowDown, Trophy, Ban } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/leaderboards")({
  component: AdminLeaderboards,
});

function AdminLeaderboards() {
  const fn = useServerFn(leaderboardAction);
  const mut = useMutation({
    mutationFn: (action: any) => fn({ data: { action } }),
    onSuccess: (r: any) => toast.success(`${r.action} queued`),
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const actions = [
    { key: "recalculate", label: "Recalculate rankings", desc: "Rebuild rankings from current trade & journal data.", icon: RotateCw },
    { key: "reset_season", label: "Reset season", desc: "Archive current standings and start a fresh season.", icon: Trophy },
    { key: "promote", label: "Promote leagues", desc: "Move top-10% of each league up one tier.", icon: ArrowUp },
    { key: "demote", label: "Demote leagues", desc: "Move bottom-20% of each league down one tier.", icon: ArrowDown },
    { key: "exclude", label: "Exclude flagged users", desc: "Hide users flagged for suspicious activity.", icon: Ban },
  ];

  return (
    <div className="space-y-4">
      <GlassCard className="p-4">
        <h3 className="text-sm font-semibold">Leaderboard operations</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Trigger platform-wide leaderboard changes. All actions are logged to the audit trail.
        </p>
      </GlassCard>
      <div className="grid gap-3 sm:grid-cols-2">
        {actions.map((a) => (
          <GlassCard key={a.key} className="p-4">
            <div className="flex items-start gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
                <a.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{a.label}</div>
                <p className="text-[11px] text-muted-foreground">{a.desc}</p>
                <Button size="sm" className="mt-3" onClick={() => mut.mutate(a.key)} disabled={mut.isPending}>
                  Run
                </Button>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}

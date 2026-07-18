import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Play, StopCircle, XCircle, RefreshCcw, Trophy } from "lucide-react";
import { listChampionships, adminChampionshipAction } from "@/lib/championship.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/glass-card";

export const Route = createFileRoute("/_authenticated/admin/championships")({
  component: AdminChampionships,
});

function AdminChampionships() {
  const qc = useQueryClient();
  const listFn = useServerFn(listChampionships);
  const actFn = useServerFn(adminChampionshipAction);
  const q = useQuery({
    queryKey: ["admin", "championships"],
    queryFn: () => listFn({ data: { scope: "all", limit: 50 } }) as unknown as Promise<any[]>,
  });
  const mut = useMutation({
    mutationFn: (vars: { id: string; action: any }) => actFn({ data: { championship_id: vars.id, action: vars.action } }),
    onSuccess: () => {
      toast.success("Action applied");
      qc.invalidateQueries({ queryKey: ["admin", "championships"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const tick = useMutation({
    mutationFn: () => actFn({ data: { championship_id: q.data?.[0]?.id ?? crypto.randomUUID(), action: "tick" } }),
    onSuccess: () => {
      toast.success("Tick processed");
      qc.invalidateQueries({ queryKey: ["admin", "championships"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <div className="space-y-4">
      <GlassCard className="flex items-center justify-between p-4">
        <div>
          <h3 className="text-sm font-semibold">Championship management</h3>
          <p className="text-xs text-muted-foreground">Create, start, cancel, and finalize monthly championships.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => tick.mutate()} disabled={tick.isPending}>
          <RefreshCcw className="mr-1.5 h-3.5 w-3.5" /> Run tick
        </Button>
      </GlassCard>

      <div className="grid gap-3">
        {q.data?.map((c) => (
          <GlassCard key={c.id} className="flex flex-wrap items-center gap-3 p-4">
            <Trophy className="h-4 w-4 text-amber-500" />
            <div className="min-w-0 flex-1">
              <Link to="/championship/$slug" params={{ slug: c.slug }} className="text-sm font-semibold hover:underline">
                {c.name}
              </Link>
              <div className="text-[11px] text-muted-foreground">
                {new Date(c.start_at).toLocaleDateString()} → {new Date(c.end_at).toLocaleDateString()} · {c.win_condition}
              </div>
            </div>
            <Badge variant="outline" className="uppercase">{c.status}</Badge>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => mut.mutate({ id: c.id, action: "start" })}>
                <Play className="mr-1 h-3 w-3" /> Start
              </Button>
              <Button size="sm" variant="outline" onClick={() => mut.mutate({ id: c.id, action: "finalize" })}>
                <StopCircle className="mr-1 h-3 w-3" /> Finalize
              </Button>
              <Button size="sm" variant="ghost" onClick={() => mut.mutate({ id: c.id, action: "cancel" })}>
                <XCircle className="mr-1 h-3 w-3" /> Cancel
              </Button>
            </div>
          </GlassCard>
        ))}
        {q.isLoading ? <div className="h-16 animate-pulse rounded-xl bg-muted/40" /> : null}
      </div>
    </div>
  );
}

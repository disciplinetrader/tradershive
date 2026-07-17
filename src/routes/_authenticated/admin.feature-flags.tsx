import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listFeatureFlags, upsertFeatureFlag } from "@/lib/admin/settings.functions";
import { GlassCard } from "@/components/ui/glass-card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/feature-flags")({
  component: AdminFlags,
});

function AdminFlags() {
  const qc = useQueryClient();
  const listFn = useServerFn(listFeatureFlags);
  const upFn = useServerFn(upsertFeatureFlag);
  const q = useQuery({ queryKey: ["admin-flags"], queryFn: () => listFn({}) });
  const mut = useMutation({
    mutationFn: (v: any) => upFn({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-flags"] }); toast.success("Saved"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <div className="space-y-4">
      <GlassCard className="p-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Feature flags</h3>
          <p className="text-xs text-muted-foreground">Toggle modules and control gradual rollouts by percentage.</p>
        </div>
        <NewFlagDialog onSave={mut.mutate} />
      </GlassCard>

      <div className="grid gap-3">
        {q.isLoading
          ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)
          : (q.data ?? []).map((f: any) => (
              <GlassCard key={f.key} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{f.label}</div>
                    <div className="text-[11px] text-muted-foreground font-mono">{f.key}</div>
                    <p className="mt-1 text-xs text-muted-foreground">{f.description}</p>
                  </div>
                  <Switch checked={f.enabled} onCheckedChange={(v) => mut.mutate({ ...f, enabled: v })} />
                </div>
                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Rollout</span><span className="font-mono">{f.rollout_percent}%</span>
                  </div>
                  <Slider
                    value={[f.rollout_percent]} min={0} max={100} step={5}
                    onValueChange={(v) => mut.mutate({ ...f, rollout_percent: v[0] })}
                  />
                </div>
              </GlassCard>
            ))}
      </div>
    </div>
  );
}

function NewFlagDialog({ onSave }: { onSave: (v: any) => void }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ key: "", label: "", description: "", enabled: false, rollout_percent: 100 });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus className="mr-1 h-3.5 w-3.5" /> New flag</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New feature flag</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Input placeholder="key (lowercase, underscores)" value={state.key} onChange={(e) => setState({ ...state, key: e.target.value })} />
          <Input placeholder="Label" value={state.label} onChange={(e) => setState({ ...state, label: e.target.value })} />
          <Input placeholder="Description" value={state.description} onChange={(e) => setState({ ...state, description: e.target.value })} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => { onSave(state); setOpen(false); }}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

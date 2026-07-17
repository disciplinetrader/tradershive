import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { importFromJSON } from "@/lib/strategy.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/strategies/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const [raw, setRaw] = useState("");
  const imp = useServerFn(importFromJSON);
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: async () => {
      try { const payload = JSON.parse(raw); return imp({ data: { payload } }); }
      catch { throw new Error("Invalid JSON"); }
    },
    onSuccess: () => { toast.success("Strategy imported"); qc.invalidateQueries({ queryKey: ["strategies"] }); setRaw(""); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  return (
    <div className="space-y-4">
      <PageHeader title="Strategy Settings" description="Preferences, import and export." />
      <GlassCard className="p-4 space-y-3">
        <div className="text-sm font-semibold">Import Strategy (JSON)</div>
        <p className="text-xs text-muted-foreground">Paste a JSON export from another TradersHIVE strategy or any compatible schema.</p>
        <Textarea rows={10} value={raw} onChange={(e) => setRaw(e.target.value)} placeholder='{"strategy": {...}}' className="font-mono text-xs" />
        <div className="flex justify-end">
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !raw.trim()}>{mut.isPending ? "Importing…" : "Import"}</Button>
        </div>
      </GlassCard>
    </div>
  );
}

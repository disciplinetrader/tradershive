import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassCard } from "@/components/ui/glass-card";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createAlert, deleteAlert, listAlerts } from "@/lib/market-data.functions";
import { QuoteTicker } from "@/components/market/QuoteTicker";
import { Trash2, PlusCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/market/alerts")({
  component: AlertsPage,
});

function AlertsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listAlerts);
  const create = useServerFn(createAlert);
  const del = useServerFn(deleteAlert);
  const { data: alerts = [] } = useQuery({ queryKey: ["market", "alerts"], queryFn: () => list() });

  const [symbol, setSymbol] = useState("EURUSD");
  const [kind, setKind] = useState<"above" | "below" | "cross_up" | "cross_down">("above");
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");

  const add = useMutation({
    mutationFn: () => create({ data: { symbol, kind, target_price: Number(target), note: note || null } }),
    onSuccess: () => { toast.success("Alert created"); setTarget(""); setNote(""); qc.invalidateQueries({ queryKey: ["market", "alerts"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Removed"); qc.invalidateQueries({ queryKey: ["market", "alerts"] }); },
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Price Alerts" description="Let the engine watch prices and notify you when they cross." />
      <GlassCard className="p-4 space-y-3">
        <div className="grid gap-2 md:grid-cols-5">
          <Input placeholder="Symbol" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} />
          <Select value={kind} onValueChange={(v) => setKind(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="above">Above</SelectItem>
              <SelectItem value="below">Below</SelectItem>
              <SelectItem value="cross_up">Cross up</SelectItem>
              <SelectItem value="cross_down">Cross down</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="Target price" type="number" step="any" value={target} onChange={(e) => setTarget(e.target.value)} />
          <Input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button onClick={() => add.mutate()} disabled={!symbol || !target}><PlusCircle className="mr-2 h-4 w-4" />Create</Button>
        </div>
      </GlassCard>

      <GlassCard className="p-4">
        <div className="mb-3 text-sm font-semibold">Your alerts</div>
        {alerts.length === 0 ? <div className="text-xs text-muted-foreground">No alerts yet.</div> : (
          <ul className="divide-y divide-border/60">
            {(alerts as any[]).map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-semibold">{a.symbol}</span>
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] uppercase text-primary">{a.kind}</span>
                  <span className="text-sm tabular-nums">@ {a.target_price}</span>
                  {a.note && <span className="text-xs text-muted-foreground">— {a.note}</span>}
                </div>
                <div className="flex items-center gap-3">
                  <QuoteTicker symbol={a.symbol} />
                  <Button size="icon" variant="ghost" aria-label="Delete alert" onClick={() => remove.mutate(a.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdminShell } from "@/components/admin/AdminShell";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { adminProviderHealth, adminSetProviderEnabled } from "@/lib/market-data.functions";
import { ProviderStatusStrip } from "@/components/market/ProviderStatusStrip";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/market-data")({
  component: AdminMarketDataPage,
});

function AdminMarketDataPage() {
  const qc = useQueryClient();
  const healthFn = useServerFn(adminProviderHealth);
  const toggleFn = useServerFn(adminSetProviderEnabled);
  const { data } = useQuery({ queryKey: ["admin", "market-data"], queryFn: () => healthFn(), refetchInterval: 10_000 });
  const toggle = useMutation({
    mutationFn: (v: { code: string; enabled: boolean }) => toggleFn({ data: v }),
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["admin", "market-data"] }); },
  });

  return (
    <AdminShell>
      <div>
        <h1 className="text-xl font-bold">Market Data</h1>
        <p className="text-sm text-muted-foreground">Monitor providers, connections, streams and historical downloads.</p>
      </div>
      <GlassCard className="p-4"><ProviderStatusStrip /></GlassCard>

      <GlassCard className="p-4">
        <div className="mb-3 text-sm font-semibold">Providers</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr className="[&>th]:py-2 [&>th]:pr-4"><th>Provider</th><th>Priority</th><th>Markets</th><th>Enabled</th><th></th></tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {(data?.providers ?? []).map((p: any) => (
                <tr key={p.id} className="[&>td]:py-2 [&>td]:pr-4">
                  <td className="font-semibold">{p.name}</td>
                  <td>{p.priority}</td>
                  <td className="text-xs text-muted-foreground">{(p.markets ?? []).join(", ")}</td>
                  <td>{p.is_enabled ? <span className="text-emerald-400">On</span> : <span className="text-rose-400">Off</span>}</td>
                  <td className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => toggle.mutate({ code: p.code, enabled: !p.is_enabled })}>
                      {p.is_enabled ? "Disable" : "Enable"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <GlassCard className="p-4">
        <div className="mb-3 text-sm font-semibold">Recent stream events</div>
        {(data?.events?.length ?? 0) === 0 ? <div className="text-xs text-muted-foreground">No events yet.</div> : (
          <ul className="divide-y divide-border/60 text-sm">
            {(data?.events ?? []).map((e: any) => (
              <li key={e.id} className="flex items-center justify-between py-2">
                <div>
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] uppercase text-primary mr-2">{e.event_type}</span>
                  <span className="text-xs text-muted-foreground">{e.message ?? "—"}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">{new Date(e.created_at).toLocaleString()}</div>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>

      <GlassCard className="p-4">
        <div className="mb-3 text-sm font-semibold">Historical cache</div>
        {(data?.caches?.length ?? 0) === 0 ? <div className="text-xs text-muted-foreground">No cached ranges.</div> : (
          <ul className="grid gap-2 md:grid-cols-2">
            {(data?.caches ?? []).map((c: any) => (
              <li key={c.id} className="rounded-md border border-border/60 bg-card/40 px-3 py-2 text-sm">
                <div className="flex justify-between">
                  <span className="font-mono">{c.symbol}</span>
                  <span className="text-xs text-muted-foreground">{c.timeframe} · {c.provider_code}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">{c.candle_count} candles · fetched {new Date(c.fetched_at).toLocaleString()}</div>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </AdminShell>
  );
}

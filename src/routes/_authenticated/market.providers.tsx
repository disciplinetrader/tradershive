import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassCard } from "@/components/ui/glass-card";
import { PageHeader } from "@/components/ui/page-header";
import { ProviderStatusStrip } from "@/components/market/ProviderStatusStrip";
import { listProvidersDb } from "@/lib/market-data.functions";

export const Route = createFileRoute("/_authenticated/market/providers")({
  component: ProvidersPage,
});

function ProvidersPage() {
  const listFn = useServerFn(listProvidersDb);
  const { data: providers = [] } = useQuery({ queryKey: ["market", "providers"], queryFn: () => listFn() });
  return (
    <div className="space-y-4">
      <PageHeader title="Providers" description="Registered market data providers and their live connection status." />
      <GlassCard className="p-4"><ProviderStatusStrip /></GlassCard>
      <GlassCard className="p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr className="[&>th]:py-2 [&>th]:pr-4">
                <th>Provider</th><th>Markets</th><th>REST</th><th>WS</th><th>Historical</th><th>Streaming</th><th>Priority</th><th>Enabled</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {(providers as any[]).map((p) => (
                <tr key={p.id} className="[&>td]:py-2 [&>td]:pr-4">
                  <td className="font-semibold">{p.name} <span className="ml-1 text-[10px] uppercase text-muted-foreground">{p.code}</span></td>
                  <td className="text-xs text-muted-foreground">{(p.markets ?? []).join(", ")}</td>
                  <td>{p.supports_rest ? "✓" : "—"}</td>
                  <td>{p.supports_ws ? "✓" : "—"}</td>
                  <td>{p.supports_historical ? "✓" : "—"}</td>
                  <td>{p.supports_streaming ? "✓" : "—"}</td>
                  <td>{p.priority}</td>
                  <td>{p.is_enabled ? <span className="text-success">On</span> : <span className="text-danger">Off</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSystemHealth } from "@/lib/admin/console.functions";
import { GlassCard } from "@/components/ui/glass-card";
import { KpiCard } from "@/components/admin/KpiCard";
import { StatusPill } from "@/components/admin/StatusPill";
import { Activity, Cpu, Database, HeartPulse, Zap } from "lucide-react";
import { fmtNumber } from "@/lib/admin/format";

export const Route = createFileRoute("/_authenticated/admin/health")({
  component: AdminHealth,
});

function AdminHealth() {
  const fn = useServerFn(getSystemHealth);
  const q = useQuery({ queryKey: ["admin-health"], queryFn: () => fn({}), refetchInterval: 30_000 });
  const h = q.data ?? ({} as any);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Overall" value={h.overall ?? "—"} icon={HeartPulse} tone={h.overall === "operational" ? "positive" : "warning"} />
        <KpiCard label="DB status" value={h.database?.status ?? "—"} icon={Database} tone={h.database?.status === "healthy" ? "positive" : "warning"} />
        <KpiCard label="Edge functions" value={h.edge?.status ?? "—"} icon={Zap} />
        <KpiCard label="Storage" value={h.storage?.status ?? "—"} icon={Cpu} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard className="p-4">
          <h3 className="mb-2 text-sm font-semibold">Errors · last 24h</h3>
          <div className="text-3xl font-bold">{fmtNumber(h.errors_24h ?? 0)}</div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {h.errors_24h ? "Investigate the security centre and audit logs." : "No error events recorded."}
          </p>
        </GlassCard>
        <GlassCard className="p-4">
          <h3 className="mb-2 text-sm font-semibold">Slow queries</h3>
          <div className="divide-y divide-border/40">
            {(h.slow_queries ?? []).slice(0, 6).map((s: any, i: number) => (
              <div key={i} className="py-2 text-xs">
                <div className="flex justify-between">
                  <span className="font-mono truncate max-w-[70%]">{s.query?.slice(0, 80)}…</span>
                  <span className="text-muted-foreground">{s.mean_ms?.toFixed(1)} ms</span>
                </div>
              </div>
            ))}
            {!(h.slow_queries ?? []).length ? (
              <div className="py-4 text-xs text-muted-foreground">No slow queries.</div>
            ) : null}
          </div>
        </GlassCard>
      </div>

      <GlassCard className="p-4">
        <h3 className="mb-2 text-sm font-semibold">Service checks</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(h.services ?? []).map((s: any) => (
            <div key={s.name} className="rounded-lg border border-border/60 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{s.name}</span>
                <StatusPill value={s.status} />
              </div>
              {s.detail ? <div className="mt-1 text-[11px] text-muted-foreground">{s.detail}</div> : null}
              {typeof s.latency_ms === "number" ? (
                <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Activity className="h-3 w-3" /> {s.latency_ms.toFixed(0)} ms
                </div>
              ) : null}
            </div>
          ))}
          {!(h.services ?? []).length ? (
            <div className="col-span-full text-xs text-muted-foreground">No probes yet.</div>
          ) : null}
        </div>
      </GlassCard>
    </div>
  );
}

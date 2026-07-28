import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSystemHealth } from "@/lib/admin/console.functions";
import { GlassCard } from "@/components/ui/glass-card";
import { KpiCard } from "@/components/admin/KpiCard";
import { StatusPill } from "@/components/admin/StatusPill";
import { HeartPulse, Zap, AlertTriangle, Activity } from "lucide-react";
import { fmtNumber } from "@/lib/admin/format";
import { formatDistanceToNow } from "date-fns";

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
        <KpiCard label="Sync error rate (1h)" value={`${h.syncErrorRate ?? 0}%`} icon={Zap} tone={h.syncErrorRate > 20 ? "warning" : "default"} />
        <KpiCard label="Running jobs" value={fmtNumber(h.runningJobs ?? 0)} icon={Activity} />
        <KpiCard label="Errors (1h)" value={fmtNumber(h.hourlyErrors ?? 0)} icon={AlertTriangle} tone={h.hourlyErrors ? "negative" : "positive"} />
      </div>

      <GlassCard className="p-4">
        <h3 className="mb-3 text-sm font-semibold">Market data providers</h3>
        <div className="divide-y divide-border/40">
          {(h.providers ?? []).map((p: any) => (
            <div key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{p.name}</div>
                {p.last_health_check_at ? (
                  <div className="text-[11px] text-muted-foreground">
                    checked {formatDistanceToNow(new Date(p.last_health_check_at), { addSuffix: true })}
                  </div>
                ) : null}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-muted-foreground">error rate {((p.error_rate ?? 0) * 100).toFixed(1)}%</span>
                <StatusPill value={p.status ?? "unknown"} />
              </div>
            </div>
          ))}
          {!(h.providers ?? []).length ? (
            <div className="py-4 text-center text-xs text-muted-foreground">No providers registered.</div>
          ) : null}
        </div>
      </GlassCard>

      <GlassCard className="p-4">
        <h3 className="mb-3 text-sm font-semibold">Largest tables</h3>
        <div className="divide-y divide-border/40">
          {(h.dbSizes ?? []).slice(0, 12).map((t: any) => (
            <div key={t.table_name ?? t.name} className="flex items-center justify-between py-1.5 text-xs">
              <span className="font-mono">{t.table_name ?? t.name}</span>
              <span className="text-muted-foreground">{t.size_pretty ?? `${fmtNumber(t.size_bytes ?? 0)} B`}</span>
            </div>
          ))}
          {!(h.dbSizes ?? []).length ? (
            <div className="py-4 text-center text-xs text-muted-foreground">Statistics unavailable.</div>
          ) : null}
        </div>
      </GlassCard>
    </div>
  );
}

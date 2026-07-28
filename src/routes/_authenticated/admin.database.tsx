import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listSlowQueries, getSystemHealth } from "@/lib/admin/console.functions";
import { GlassCard } from "@/components/ui/glass-card";
import { KpiCard } from "@/components/admin/KpiCard";
import { fmtBytes, fmtNumber } from "@/lib/admin/format";
import { Database, Timer, HardDrive } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/database")({
  component: AdminDatabase,
});

function AdminDatabase() {
  const slowFn = useServerFn(listSlowQueries);
  const healthFn = useServerFn(getSystemHealth);

  const slow = useQuery({ queryKey: ["admin-slow"], queryFn: () => slowFn({ data: { limit: 30 } }) });
  const health = useQuery({ queryKey: ["admin-health-db"], queryFn: () => healthFn({}) });
  const db = health.data?.database ?? ({} as any);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="DB size" value={fmtBytes(db.size_bytes ?? 0)} icon={Database} />
        <KpiCard label="Tables" value={fmtNumber(db.table_count ?? 0)} icon={HardDrive} />
        <KpiCard label="Active connections" value={fmtNumber(db.active_connections ?? 0)} icon={Timer} />
      </div>

      <GlassCard className="p-4">
        <h3 className="mb-2 text-sm font-semibold">Largest tables</h3>
        <div className="divide-y divide-border/40">
          {(db.largest_tables ?? []).map((t: any) => (
            <div key={t.name} className="flex justify-between py-1.5 text-xs">
              <span className="font-mono">{t.name}</span>
              <span className="text-muted-foreground">{fmtBytes(t.size_bytes ?? 0)} · {fmtNumber(t.row_estimate ?? 0)} rows</span>
            </div>
          ))}
          {!(db.largest_tables ?? []).length ? (
            <div className="py-4 text-center text-xs text-muted-foreground">Statistics unavailable.</div>
          ) : null}
        </div>
      </GlassCard>

      <GlassCard className="p-4">
        <h3 className="mb-2 text-sm font-semibold">Slowest queries</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/60 text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="py-1.5 pr-2">Query</th>
                <th className="pr-2">Calls</th>
                <th className="pr-2">Mean ms</th>
                <th>Total ms</th>
              </tr>
            </thead>
            <tbody>
              {(slow.data ?? []).map((s: any, i: number) => (
                <tr key={i} className="border-b border-border/40">
                  <td className="py-1.5 pr-2 font-mono text-[11px] max-w-[520px] truncate">{s.query}</td>
                  <td className="pr-2">{fmtNumber(s.calls)}</td>
                  <td className="pr-2">{s.mean_ms?.toFixed(1)}</td>
                  <td>{s.total_ms?.toFixed(0)}</td>
                </tr>
              ))}
              {!(slow.data ?? []).length ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted-foreground">No slow queries.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}

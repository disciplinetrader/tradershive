import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listSlowQueries, getSystemHealth } from "@/lib/admin/console.functions";
import { GlassCard } from "@/components/ui/glass-card";
import { KpiCard } from "@/components/admin/KpiCard";
import { fmtNumber } from "@/lib/admin/format";
import { Database, Timer, HardDrive, Info } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/database")({
  component: AdminDatabase,
});

function AdminDatabase() {
  const slowFn = useServerFn(listSlowQueries);
  const healthFn = useServerFn(getSystemHealth);

  const slow = useQuery({ queryKey: ["admin-slow"], queryFn: () => slowFn({ data: { limit: 30 } }) });
  const health = useQuery({ queryKey: ["admin-health-db"], queryFn: () => healthFn({}) });
  const dbSizes: any[] = health.data?.dbSizes ?? [];
  const totalBytes = dbSizes.reduce((s, t: any) => s + Number(t.size_bytes ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="Tracked tables" value={fmtNumber(dbSizes.length)} icon={Database} />
        <KpiCard label="Approx. total size" value={formatBytes(totalBytes)} icon={HardDrive} />
        <KpiCard label="Slow queries surfaced" value={fmtNumber(slow.data?.rows?.length ?? 0)} icon={Timer} />
      </div>

      <GlassCard className="p-4">
        <h3 className="mb-2 text-sm font-semibold">Largest tables</h3>
        <div className="divide-y divide-border/40">
          {dbSizes.map((t: any) => (
            <div key={t.table_name ?? t.name} className="flex justify-between py-1.5 text-xs">
              <span className="font-mono">{t.table_name ?? t.name}</span>
              <span className="text-muted-foreground">
                {t.size_pretty ?? formatBytes(Number(t.size_bytes ?? 0))}
                {t.row_estimate ? ` · ~${fmtNumber(t.row_estimate)} rows` : ""}
              </span>
            </div>
          ))}
          {!dbSizes.length ? (
            <div className="py-4 text-center text-xs text-muted-foreground">Statistics unavailable.</div>
          ) : null}
        </div>
      </GlassCard>

      <GlassCard className="p-4">
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          Slow queries
        </h3>
        {slow.data?.note ? (
          <div className="mb-3 flex items-start gap-2 rounded-md border border-border/60 bg-muted/10 p-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{slow.data.note}</span>
          </div>
        ) : null}
        <div className="divide-y divide-border/40">
          {(slow.data?.rows ?? []).map((s: any, i: number) => (
            <div key={i} className="py-2 text-xs">
              <div className="flex justify-between gap-3">
                <span className="font-mono truncate max-w-[70%]">{s.query}</span>
                <span className="text-muted-foreground">{s.mean_ms?.toFixed?.(1) ?? "—"} ms</span>
              </div>
            </div>
          ))}
          {!(slow.data?.rows?.length) ? (
            <div className="py-4 text-center text-xs text-muted-foreground">No slow queries surfaced.</div>
          ) : null}
        </div>
      </GlassCard>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAdminAnalytics, getAdminGrowthSeries } from "@/lib/admin/console.functions";
import { GlassCard } from "@/components/ui/glass-card";
import { KpiCard } from "@/components/admin/KpiCard";
import { fmtNumber } from "@/lib/admin/format";
import { Activity, LineChart as LineIcon, Users, Zap } from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip,
  XAxis, YAxis,
} from "recharts";

export const Route = createFileRoute("/_authenticated/admin/analytics")({
  component: AdminAnalytics,
});

function AdminAnalytics() {
  const analyticsFn = useServerFn(getAdminAnalytics);
  const growthFn = useServerFn(getAdminGrowthSeries);

  const analytics = useQuery({ queryKey: ["admin-analytics", 30], queryFn: () => analyticsFn({ data: { days: 30 } }) });
  const growth = useQuery({ queryKey: ["admin-growth-analytics", 30], queryFn: () => growthFn({ data: { days: 30 } }) });

  const a = analytics.data ?? ({} as any);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="DAU" value={fmtNumber(a.dau)} icon={Activity} />
        <KpiCard label="WAU" value={fmtNumber(a.wau)} icon={Users} />
        <KpiCard label="MAU" value={fmtNumber(a.mau)} icon={Users} />
        <KpiCard label="Retention (30d)" value={a.retention_30d ? `${a.retention_30d.toFixed(1)}%` : "—"} icon={Zap} tone="positive" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <GlassCard className="p-4 lg:col-span-2">
          <h3 className="mb-2 text-sm font-semibold">User growth & activity</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <AreaChart data={growth.data ?? []}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" width={30} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11 }} />
                <Area dataKey="new_users" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} />
                <Area dataKey="active_users" stroke="hsl(var(--success))" fill="hsl(var(--success))" fillOpacity={0.1} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <GlassCard className="p-4">
          <h3 className="mb-2 text-sm font-semibold">Feature adoption</h3>
          <div className="space-y-2">
            {(a.feature_adoption ?? []).map((f: any) => (
              <div key={f.feature}>
                <div className="flex items-center justify-between text-xs">
                  <span>{f.feature}</span>
                  <span className="text-muted-foreground">{fmtNumber(f.users)} users</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface">
                  <div className="h-full bg-primary" style={{ width: `${Math.min(100, f.pct ?? 0)}%` }} />
                </div>
              </div>
            ))}
            {!(a.feature_adoption ?? []).length ? (
              <div className="text-xs text-muted-foreground">No data yet.</div>
            ) : null}
          </div>
        </GlassCard>
      </div>

      <GlassCard className="p-4">
        <h3 className="mb-2 text-sm font-semibold">Top pages</h3>
        <div className="h-56">
          <ResponsiveContainer>
            <BarChart data={a.top_pages ?? []}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
              <XAxis dataKey="path" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" width={40} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11 }} />
              <Bar dataKey="views" fill="hsl(var(--primary))" radius={4} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </GlassCard>
    </div>
  );
}

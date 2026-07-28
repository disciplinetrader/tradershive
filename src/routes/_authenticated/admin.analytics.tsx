import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAdminAnalytics } from "@/lib/admin/console.functions";
import { GlassCard } from "@/components/ui/glass-card";
import { KpiCard } from "@/components/admin/KpiCard";
import { Activity, Users, Zap, Globe, Film } from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { fmtNumber } from "@/lib/admin/format";

export const Route = createFileRoute("/_authenticated/admin/analytics")({
  component: AdminAnalytics,
});

function AdminAnalytics() {
  const fn = useServerFn(getAdminAnalytics);
  const q = useQuery({ queryKey: ["admin-analytics", 30], queryFn: () => fn({ data: { days: 30 } }) });
  const a = q.data ?? ({} as any);

  const growth: any[] = a.growth ?? [];
  const aiSeries: any[] = a.aiSeries ?? [];
  const totalNew = growth.reduce((s, r) => s + (r.new_users ?? 0), 0);
  const peakActive = growth.reduce((m, r) => Math.max(m, r.active_users ?? 0), 0);
  const totalAiRequests = aiSeries.reduce((s, r) => s + (r.requests ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="New (30d)" value={fmtNumber(totalNew)} icon={Users} tone="positive" />
        <KpiCard label="Peak DAU" value={fmtNumber(peakActive)} icon={Activity} />
        <KpiCard label="AI requests (30d)" value={fmtNumber(totalAiRequests)} icon={Zap} />
        <KpiCard label="Replay completion" value={`${a.replayCompletionRate ?? 0}%`} icon={Film} tone={a.replayCompletionRate >= 50 ? "positive" : "default"} />
      </div>

      <GlassCard className="p-4">
        <h3 className="mb-2 text-sm font-semibold">User growth & activity · 30 days</h3>
        <div className="h-64">
          <ResponsiveContainer>
            <AreaChart data={growth}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" width={40} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11 }} />
              <Area type="monotone" dataKey="new_users" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} />
              <Line type="monotone" dataKey="active_users" stroke="hsl(var(--success))" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </GlassCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard className="p-4">
          <h3 className="mb-2 text-sm font-semibold">AI usage</h3>
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={aiSeries}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" width={40} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11 }} />
                <Bar dataKey="requests" fill="hsl(var(--primary))" radius={4} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <GlassCard className="p-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <Globe className="h-3.5 w-3.5 text-muted-foreground" /> Top countries
          </h3>
          <div className="divide-y divide-border/40">
            {(a.topCountries ?? []).map((c: any) => (
              <div key={c.code} className="flex items-center justify-between py-1.5 text-xs">
                <span className="font-mono uppercase">{c.code}</span>
                <span className="text-muted-foreground">{fmtNumber(c.count)}</span>
              </div>
            ))}
            {!(a.topCountries ?? []).length ? (
              <div className="py-4 text-center text-xs text-muted-foreground">No country data yet.</div>
            ) : null}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

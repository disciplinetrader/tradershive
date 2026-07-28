import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getAdminDashboardKpis,
  getAdminGrowthSeries,
  getAdminRecentActivity,
  getAdminAiUsageSeries,
} from "@/lib/admin/console.functions";
import { KpiCard } from "@/components/admin/KpiCard";
import { GlassCard } from "@/components/ui/glass-card";
import { fmtNumber } from "@/lib/admin/format";
import {
  Activity, AlertTriangle, Bell, BookOpen, Bot, Boxes, CreditCard,
  DollarSign, LifeBuoy, LineChart, ShieldCheck, Sparkles, TrendingUp,
  UserPlus, Users, Zap,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  LineChart as RLineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip,
  AreaChart, Area,
} from "recharts";

export const Route = createFileRoute("/_authenticated/admin/dashboard")({
  component: AdminDashboard,
});

function AdminDashboard() {
  const kpiFn = useServerFn(getAdminDashboardKpis);
  const growthFn = useServerFn(getAdminGrowthSeries);
  const activityFn = useServerFn(getAdminRecentActivity);
  const aiFn = useServerFn(getAdminAiUsageSeries);

  const kpi = useQuery({ queryKey: ["admin-console-kpis"], queryFn: () => kpiFn({}), refetchInterval: 60_000 });
  const growth = useQuery({ queryKey: ["admin-growth", 30], queryFn: () => growthFn({ data: { days: 30 } }) });
  const activity = useQuery({ queryKey: ["admin-activity"], queryFn: () => activityFn({}), refetchInterval: 30_000 });
  const aiUsage = useQuery({ queryKey: ["admin-ai-series", 14], queryFn: () => aiFn({ data: { days: 14 } }) });

  const v = (n: number | undefined) => (kpi.isLoading ? "…" : fmtNumber(n ?? 0));
  const k = kpi.data ?? ({} as any);

  return (
    <div className="space-y-5">
      {/* KPI row 1 — People */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total users" value={v(k.total_users)} icon={Users} />
        <KpiCard label="Active today" value={v(k.active_today)} icon={Activity} tone="positive" />
        <KpiCard label="Monthly active" value={v(k.mau)} icon={TrendingUp} />
        <KpiCard label="New today" value={v(k.new_today)} icon={UserPlus} hint={`${fmtNumber(k.new_this_month ?? 0)} this month`} />
      </div>

      {/* KPI row 2 — Monetisation & platform */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Active subs" value={v(k.active_subs)} icon={CreditCard} tone="positive" hint={`${fmtNumber(k.trial_subs ?? 0)} trialing`} />
        <KpiCard label="Premium users" value={v(k.premium_users)} icon={DollarSign} />
        <KpiCard label="Total trades" value={v(k.total_trades)} icon={LineChart} />
        <KpiCard label="Replay sessions" value={v(k.total_replays)} icon={Boxes} />
      </div>

      {/* KPI row 3 — AI & health */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="AI requests today" value={v(k.ai_requests_today)} icon={Bot} hint={`${fmtNumber(k.ai_tokens_today ?? 0)} tokens`} />
        <KpiCard label="Open tickets" value={v(k.open_tickets)} icon={LifeBuoy} tone={k.open_tickets ? "warning" : "default"} />
        <KpiCard label="Open bugs" value={v(k.open_bugs)} icon={AlertTriangle} tone={k.open_bugs ? "warning" : "default"} />
        <KpiCard label="24h errors" value={v(k.error_events_24h)} icon={ShieldCheck} tone={k.error_events_24h ? "negative" : "positive"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <GlassCard className="p-4 lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">User growth · 30 days</h3>
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Signups + active</span>
          </div>
          <div className="h-56">
            <ResponsiveContainer>
              <AreaChart data={growth.data ?? []}>
                <defs>
                  <linearGradient id="newG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" width={30} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11 }} />
                <Area type="monotone" dataKey="new_users" stroke="hsl(var(--primary))" fill="url(#newG)" strokeWidth={2} />
                <Line type="monotone" dataKey="active_users" stroke="hsl(var(--success))" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <GlassCard className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">AI usage · 14 days</h3>
            <Bot className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="h-56">
            <ResponsiveContainer>
              <RLineChart data={aiUsage.data ?? []}>
                <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" width={30} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11 }} />
                <Line type="monotone" dataKey="requests" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </RLineChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
      </div>

      <GlassCard className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Recent admin activity</h3>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Latest 20 events</span>
        </div>
        {activity.isLoading ? (
          <div className="text-xs text-muted-foreground">Loading…</div>
        ) : !activity.data?.length ? (
          <div className="text-xs text-muted-foreground">No admin actions yet.</div>
        ) : (
          <div className="divide-y divide-border/40">
            {activity.data.map((row: any) => (
              <div key={row.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <Bell className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="font-mono text-xs">{row.action}</span>
                  <span className="text-muted-foreground text-xs truncate">
                    {row.resource}{row.resource_id ? ` · ${String(row.resource_id).slice(0, 8)}` : ""}
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      <div className="grid gap-3 sm:grid-cols-3">
        <MiniStat icon={Zap} label="Notifications" value={fmtNumber(k.unread_notifications ?? 0)} hint="Unread admin alerts" />
        <MiniStat icon={Sparkles} label="Systems" value={k.error_events_24h ? "Degraded" : "Operational"} hint="24h rolling window" tone={k.error_events_24h ? "warning" : "positive"} />
        <MiniStat icon={BookOpen} label="Docs" value="Public beta" hint="Feature flags live" />
      </div>
    </div>
  );
}

function MiniStat({ icon: Icon, label, value, hint, tone }: {
  icon: typeof Users; label: string; value: string; hint: string; tone?: "positive" | "warning";
}) {
  const cls = tone === "warning" ? "text-warning" : tone === "positive" ? "text-success" : "text-foreground";
  return (
    <GlassCard className="p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
        <Icon className="h-3.5 w-3.5 text-muted-foreground/70" />
      </div>
      <div className={`mt-1 text-lg font-semibold ${cls}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{hint}</div>
    </GlassCard>
  );
}

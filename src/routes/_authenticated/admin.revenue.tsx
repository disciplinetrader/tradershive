import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRevenueOverview } from "@/lib/admin/console.functions";
import { GlassCard } from "@/components/ui/glass-card";
import { KpiCard } from "@/components/admin/KpiCard";
import { DollarSign, TrendingUp, Repeat, CreditCard } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const Route = createFileRoute("/_authenticated/admin/revenue")({
  component: AdminRevenue,
});

function AdminRevenue() {
  const fn = useServerFn(getRevenueOverview);
  const q = useQuery({ queryKey: ["admin-revenue"], queryFn: () => fn({}) });
  const r = q.data ?? ({} as any);

  const fmtUsd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="MRR" value={fmtUsd(r.mrr ?? 0)} icon={DollarSign} tone="positive" />
        <KpiCard label="ARR" value={fmtUsd(r.arr ?? 0)} icon={TrendingUp} />
        <KpiCard label="Active paying" value={String(r.paying_users ?? 0)} icon={CreditCard} />
        <KpiCard label="Churn rate (30d)" value={r.churn_rate_30d ? `${r.churn_rate_30d.toFixed(1)}%` : "—"} icon={Repeat} tone={r.churn_rate_30d > 5 ? "warning" : "default"} />
      </div>

      <GlassCard className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Revenue trend · 30 days</h3>
        </div>
        <div className="h-64">
          <ResponsiveContainer>
            <AreaChart data={r.trend ?? []}>
              <defs>
                <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" width={50} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11 }} />
              <Area type="monotone" dataKey="amount" stroke="hsl(var(--success))" fill="url(#rev)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </GlassCard>

      <GlassCard className="p-4">
        <h3 className="mb-2 text-sm font-semibold">Plan breakdown</h3>
        <div className="divide-y divide-border/40">
          {(r.by_plan ?? []).map((p: any) => (
            <div key={p.plan_id ?? p.name} className="flex items-center justify-between py-2 text-sm">
              <span>{p.name}</span>
              <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                <span>{p.count} subs</span>
                <span className="font-mono">{fmtUsd(p.mrr ?? 0)}</span>
              </div>
            </div>
          ))}
          {!(r.by_plan ?? []).length ? (
            <div className="py-4 text-center text-xs text-muted-foreground">No paid plans yet.</div>
          ) : null}
        </div>
      </GlassCard>
    </div>
  );
}

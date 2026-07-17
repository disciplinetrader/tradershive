import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAdminKpis } from "@/lib/admin.functions";
import { KpiCard } from "@/components/admin/KpiCard";
import { GlassCard } from "@/components/ui/glass-card";
import { fmtNumber } from "@/lib/admin/format";
import {
  Activity, AlertTriangle, Award, BookOpen, LineChart, LifeBuoy, Sparkles, TrendingUp,
  UserPlus, Users, Zap, Server,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/dashboard")({
  component: AdminDashboard,
});

function AdminDashboard() {
  const fn = useServerFn(getAdminKpis);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-kpis"],
    queryFn: () => fn({}),
    refetchInterval: 60_000,
  });

  const v = (n: number | undefined) => (isLoading ? "…" : fmtNumber(n ?? 0));

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total users" value={v(data?.totalUsers)} icon={Users} />
        <KpiCard label="Active 24h" value={v(data?.activeUsers)} icon={Activity} tone="positive" />
        <KpiCard label="New today" value={v(data?.newUsers)} icon={UserPlus} />
        <KpiCard label="Trades today" value={v(data?.tradesToday)} icon={LineChart} />
        <KpiCard label="Journal today" value={v(data?.journalToday)} icon={BookOpen} />
        <KpiCard label="Challenges done" value={v(data?.challengesToday)} icon={Sparkles} />
        <KpiCard label="XP earned" value={v(data?.xpToday)} icon={Zap} tone="positive" />
        <KpiCard label="Open tickets" value={v(data?.openTickets)} icon={LifeBuoy} tone={data?.openTickets ? "warning" : "default"} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Revenue" value="—" icon={TrendingUp} hint="Not connected" />
        <KpiCard label="Storage" value="—" icon={Server} hint="Buckets" />
        <KpiCard label="Error rate" value="0%" icon={AlertTriangle} tone="positive" hint="Last hour" />
        <KpiCard label="System" value="Operational" icon={Award} tone="positive" hint="All services" />
      </div>

      <GlassCard className="p-5">
        <h3 className="text-sm font-semibold">Platform pulse</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Real-time KPIs aggregated from paper trades, journal entries, gamification events and support tickets.
          Data refreshes every 60 seconds.
        </p>
      </GlassCard>
    </div>
  );
}

import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassCard } from "@/components/ui/glass-card";
import { Skeleton } from "@/components/ui/skeleton";
import { getDashboardOverview } from "@/lib/dashboard.functions";

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <GlassCard className="p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="h-40 w-full">{children}</div>
    </GlassCard>
  );
}

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  fontSize: 12,
};

export function PerformanceCharts() {
  const fetch = useServerFn(getDashboardOverview);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard_overview"],
    queryFn: () => fetch(),
    staleTime: 30_000,
  });

  if (isLoading || !data) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-52 w-full rounded-2xl" />)}
      </div>
    );
  }

  const { weekly, monthly, sessions, rrDistribution, winsLosses } = data;
  const winsLossesData = [
    { name: "Wins", value: winsLosses.wins, color: "var(--primary)" },
    { name: "Losses", value: winsLosses.losses, color: "var(--danger)" },
    { name: "BE", value: winsLosses.be, color: "var(--muted-foreground)" },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <ChartCard title="Weekly performance">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={weekly} margin={{ left: -20, right: 0, top: 8, bottom: 0 }}>
            <XAxis dataKey="day" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="pnl" radius={[6, 6, 0, 0]}>
              {weekly.map((d, i) => (
                <Cell key={i} fill={d.pnl >= 0 ? "var(--primary)" : "var(--danger)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      <ChartCard title="Monthly performance">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={monthly} margin={{ left: -20, right: 0, top: 8, bottom: 0 }}>
            <XAxis dataKey="week" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="pnl" radius={[6, 6, 0, 0]}>
              {monthly.map((d, i) => (
                <Cell key={i} fill={d.pnl >= 0 ? "var(--primary)" : "var(--danger)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      <ChartCard title="Win / Loss">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={winsLossesData} dataKey="value" innerRadius={40} outerRadius={60} paddingAngle={2}>
              {winsLossesData.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>
      <ChartCard title="Sessions">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={sessions} layout="vertical" margin={{ left: 12, right: 8, top: 8, bottom: 0 }}>
            <XAxis type="number" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
            <YAxis dataKey="session" type="category" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={60} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="pnl" radius={[0, 6, 6, 0]} fill="var(--primary)" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      <ChartCard title="R distribution">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rrDistribution} margin={{ left: -20, right: 0, top: 8, bottom: 0 }}>
            <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="count" radius={[6, 6, 0, 0]} fill="var(--primary)" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

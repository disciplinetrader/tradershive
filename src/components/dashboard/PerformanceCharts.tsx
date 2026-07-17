import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { GlassCard } from "@/components/ui/glass-card";
import { MOCK_MONTHLY, MOCK_RR_DISTRIBUTION, MOCK_SESSIONS, MOCK_WEEKLY } from "@/lib/dashboard-mock";

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <GlassCard className="p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div className="h-40 w-full">{children}</div>
    </GlassCard>
  );
}

const tooltipStyle = {
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 12,
  fontSize: 12,
};

export function PerformanceCharts() {
  const winsLosses = [
    { name: "Wins", value: 75, color: "hsl(var(--primary))" },
    { name: "Losses", value: 48, color: "hsl(var(--danger))" },
    { name: "BE", value: 5, color: "hsl(var(--muted-foreground))" },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <ChartCard title="Weekly performance">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={MOCK_WEEKLY} margin={{ left: -20, right: 0, top: 8, bottom: 0 }}>
            <XAxis dataKey="day" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="pnl" radius={[6, 6, 0, 0]}>
              {MOCK_WEEKLY.map((d, i) => (
                <Cell key={i} fill={d.pnl >= 0 ? "hsl(var(--primary))" : "hsl(var(--danger))"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Monthly performance">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={MOCK_MONTHLY} margin={{ left: -20, right: 0, top: 8, bottom: 0 }}>
            <XAxis dataKey="week" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="pnl" radius={[6, 6, 0, 0]}>
              {MOCK_MONTHLY.map((d, i) => (
                <Cell key={i} fill={d.pnl >= 0 ? "hsl(var(--primary))" : "hsl(var(--danger))"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Win / Loss ratio">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={winsLosses}
              dataKey="value"
              innerRadius={38}
              outerRadius={62}
              paddingAngle={3}
              stroke="none"
            >
              {winsLosses.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Session performance">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={MOCK_SESSIONS} layout="vertical" margin={{ left: 12, right: 8, top: 8, bottom: 0 }}>
            <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="session" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={60} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="pnl" radius={[0, 6, 6, 0]} fill="hsl(var(--primary))" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="R distribution">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={MOCK_RR_DISTRIBUTION} margin={{ left: -20, right: 0, top: 8, bottom: 0 }}>
            <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="count" radius={[6, 6, 0, 0]} fill="hsl(var(--info))" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

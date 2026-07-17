import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { MOCK_EQUITY } from "@/lib/dashboard-mock";

export function EquityCurve() {
  const first = MOCK_EQUITY[0]?.equity ?? 0;
  const last = MOCK_EQUITY[MOCK_EQUITY.length - 1]?.equity ?? 0;
  const pnl = last - first;
  const pct = first ? (pnl / first) * 100 : 0;
  const up = pnl >= 0;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Equity</div>
          <div className="text-2xl font-bold tabular-nums">${last.toLocaleString()}</div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={up ? "border-primary/30 bg-primary/10 text-primary" : "border-danger/30 bg-danger/10 text-danger"}>
            {up ? "+" : ""}
            {pnl.toLocaleString()} ({up ? "+" : ""}
            {pct.toFixed(2)}%)
          </Badge>
          <Badge variant="outline" className="text-[10px] uppercase tracking-wider">Demo</Badge>
        </div>
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={MOCK_EQUITY} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={48} />
            <Tooltip
              cursor={{ stroke: "hsl(var(--border))" }}
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 12,
                fontSize: 12,
              }}
              formatter={(v: number) => [`$${v.toLocaleString()}`, "Equity"]}
            />
            <Area
              type="monotone"
              dataKey="equity"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              fill="url(#equityFill)"
              isAnimationActive
              animationDuration={800}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

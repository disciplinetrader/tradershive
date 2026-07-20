import { useMemo } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useStatistics } from "./context";
import { fmtCurrency, fmtPercent } from "@/lib/statistics/format";

const tooltipStyle = { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 };

export function EmotionAnalysis() {
  const { filtered } = useStatistics();
  const data = useMemo(() => {
    const map = new Map<string, { emotion: string; trades: number; wins: number; pnl: number }>();
    for (const t of filtered) {
      if (!t.closed_at) continue;
      for (const e of t.emotions ?? []) {
        const cur = map.get(e) ?? { emotion: e, trades: 0, wins: 0, pnl: 0 };
        cur.trades++;
        cur.pnl += t.pnl;
        if (t.pnl > 0) cur.wins++;
        map.set(e, cur);
      }
    }
    return Array.from(map.values())
      .map((r) => ({ ...r, winRate: r.trades ? (r.wins / r.trades) * 100 : 0 }))
      .sort((a, b) => b.pnl - a.pnl);
  }, [filtered]);

  return (
    <GlassCard className="p-4">
      <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Emotion vs performance</div>
      {data.length === 0 ? (
        <div className="grid h-32 place-items-center text-xs text-muted-foreground">No emotions tagged.</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ left: 12, right: 8, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                <XAxis type="number" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="emotion" width={90} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtCurrency(v)} />
                <Bar dataKey="pnl" radius={[0,6,6,0]}>
                  {data.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? "var(--primary)" : "rgb(244 63 94)"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {data.map((d) => (
              <div key={d.emotion} className="rounded-xl border border-border/40 bg-background/40 p-2 flex items-center justify-between text-xs">
                <div className="font-medium capitalize">{d.emotion}</div>
                <div className="flex gap-3 text-muted-foreground">
                  <span>{d.trades} trades</span>
                  <span>Win {fmtPercent(d.winRate)}</span>
                  <span className={d.pnl >= 0 ? "text-success" : "text-danger"}>{fmtCurrency(d.pnl)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </GlassCard>
  );
}

export function MistakeAnalysis() {
  const { filtered } = useStatistics();
  const data = useMemo(() => {
    const map = new Map<string, { mistake: string; count: number; pnl: number; wins: number }>();
    for (const t of filtered) {
      if (!t.closed_at) continue;
      for (const m of t.mistakes ?? []) {
        const cur = map.get(m) ?? { mistake: m, count: 0, pnl: 0, wins: 0 };
        cur.count++;
        cur.pnl += t.pnl;
        if (t.pnl > 0) cur.wins++;
        map.set(m, cur);
      }
    }
    return Array.from(map.values())
      .map((r) => ({ ...r, winRate: r.count ? (r.wins / r.count) * 100 : 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [filtered]);

  return (
    <GlassCard className="p-4">
      <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Top mistakes (last 10)</div>
      {data.length === 0 ? (
        <div className="grid h-32 place-items-center text-xs text-muted-foreground">No mistakes logged yet — keep journaling.</div>
      ) : (
        <div className="space-y-2">
          {data.map((d) => (
            <div key={d.mistake} className="rounded-xl border border-border/40 bg-background/40 p-3">
              <div className="flex items-center justify-between text-sm font-medium">
                <span className="capitalize">{d.mistake}</span>
                <span className="text-xs text-muted-foreground">{d.count}×</span>
              </div>
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>Win rate {fmtPercent(d.winRate)}</span>
                <span className={d.pnl >= 0 ? "text-success" : "text-danger"}>Impact {fmtCurrency(d.pnl)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}

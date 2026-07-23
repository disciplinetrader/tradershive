import { useMemo, useState } from "react";
import { Download, FileJson, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useStatistics } from "./context";
import { computeKpis, groupByDay, groupByMonth } from "@/lib/statistics/calculations";
import { fmtCurrency, fmtNumber, fmtPercent, toCsv, downloadFile } from "@/lib/statistics/format";

type Kind = "daily" | "weekly" | "monthly" | "yearly";

export function ReportsView() {
  const { filtered } = useStatistics();
  const [kind, setKind] = useState<Kind>("monthly");

  const rows = useMemo(() => {
    if (kind === "monthly") return groupByMonth(filtered).map((r) => ({ period: r.month, trades: r.trades, wins: r.wins, losses: r.losses, winRate: r.winRate, avgRR: r.avgRR, netProfit: r.pnl }));
    if (kind === "yearly") {
      const map = new Map<string, { period: string; trades: number; wins: number; losses: number; pnl: number; rrSum: number; rrCount: number }>();
      for (const r of groupByMonth(filtered)) {
        const y = r.month.slice(0, 4);
        const cur = map.get(y) ?? { period: y, trades: 0, wins: 0, losses: 0, pnl: 0, rrSum: 0, rrCount: 0 };
        cur.trades += r.trades; cur.wins += r.wins; cur.losses += r.losses; cur.pnl += r.pnl;
        cur.rrSum += r.avgRR * (r.trades || 1); cur.rrCount += r.trades;
        map.set(y, cur);
      }
      return Array.from(map.values()).map((r) => ({ period: r.period, trades: r.trades, wins: r.wins, losses: r.losses, winRate: r.trades ? (r.wins / r.trades) * 100 : 0, avgRR: r.rrCount ? r.rrSum / r.rrCount : 0, netProfit: r.pnl }));
    }
    const daily = groupByDay(filtered);
    if (kind === "daily") return daily.map((r) => ({ period: r.date, trades: r.trades, wins: r.wins, losses: r.losses, winRate: r.winRate, avgRR: r.avgRR, netProfit: r.pnl }));
    // weekly
    const map = new Map<string, { period: string; trades: number; wins: number; losses: number; pnl: number; rrSum: number; rrCount: number }>();
    for (const r of daily) {
      const d = new Date(r.date);
      const startYear = new Date(d.getFullYear(), 0, 1);
      const week = Math.ceil(((d.getTime() - startYear.getTime()) / 86400000 + startYear.getDay() + 1) / 7);
      const key = `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
      const cur = map.get(key) ?? { period: key, trades: 0, wins: 0, losses: 0, pnl: 0, rrSum: 0, rrCount: 0 };
      cur.trades += r.trades; cur.wins += r.wins; cur.losses += r.losses; cur.pnl += r.pnl;
      cur.rrSum += r.avgRR * (r.trades || 1); cur.rrCount += r.trades;
      map.set(key, cur);
    }
    return Array.from(map.values()).map((r) => ({ period: r.period, trades: r.trades, wins: r.wins, losses: r.losses, winRate: r.trades ? (r.wins / r.trades) * 100 : 0, avgRR: r.rrCount ? r.rrSum / r.rrCount : 0, netProfit: r.pnl }));
  }, [filtered, kind]);

  const summary = useMemo(() => computeKpis(filtered), [filtered]);

  const exportCsv = () => {
    const payload = rows.map((r) => ({
      period: r.period,
      trades: r.trades,
      wins: r.wins,
      losses: r.losses,
      win_rate_pct: r.winRate.toFixed(2),
      avg_rr: r.avgRR.toFixed(2),
      net_profit: r.netProfit.toFixed(2),
    }));
    downloadFile(`traders-hive-report-${kind}.csv`, toCsv(payload), "text/csv");
  };

  const exportJson = () => {
    downloadFile(`traders-hive-report-${kind}.json`, JSON.stringify({ generated_at: new Date().toISOString(), kind, summary, rows }, null, 2), "application/json");
  };

  return (
    <div className="space-y-4">
      <GlassCard className="p-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Report</div>
          <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
            <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={exportCsv}><FileText className="h-3.5 w-3.5 mr-1" />CSV</Button>
          <Button size="sm" variant="outline" onClick={exportJson}><FileJson className="h-3.5 w-3.5 mr-1" />JSON</Button>
        </div>
      </GlassCard>

      <GlassCard className="p-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] uppercase tracking-wider">Period</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider text-right">Trades</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider text-right">Wins</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider text-right">Losses</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider text-right">Win rate</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider text-right">Avg RR</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider text-right">Net P&L</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-8">No data</TableCell></TableRow>
              ) : rows.map((r) => (
                <TableRow key={r.period}>
                  <TableCell className="font-medium">{r.period}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.trades}</TableCell>
                  <TableCell className="text-right tabular-nums text-success">{r.wins}</TableCell>
                  <TableCell className="text-right tabular-nums text-danger">{r.losses}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtPercent(r.winRate)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtNumber(r.avgRR)}R</TableCell>
                  <TableCell className={`text-right tabular-nums font-semibold ${r.netProfit >= 0 ? "text-success" : "text-danger"}`}>{fmtCurrency(r.netProfit)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </GlassCard>
    </div>
  );
}

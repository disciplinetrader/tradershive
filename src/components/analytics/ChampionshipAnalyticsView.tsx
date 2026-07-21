import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trophy } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { listAnalyticsChampionships } from "@/lib/analytics.functions";
import { fmtCurrency, fmtPercent } from "@/lib/statistics/format";

/**
 * Personal championship history — the trader's finish across every
 * championship they participated in, with core scoring metrics.
 */
export function ChampionshipAnalyticsView() {
  const getFn = useServerFn(listAnalyticsChampionships);
  const q = useQuery({ queryKey: ["analytics", "championships"], queryFn: () => getFn(), staleTime: 60_000 });
  const rows = (q.data ?? []) as any[];

  return (
    <GlassCard className="p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        <Trophy className="h-3.5 w-3.5" /> Championship history
      </div>
      {rows.length === 0 ? (
        <div className="grid h-32 place-items-center text-xs text-muted-foreground">
          You haven't finished any championship yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-border/40">
                <th className="py-2 text-left">Championship</th>
                <th className="py-2 text-right">Rank</th>
                <th className="py-2 text-right">PnL</th>
                <th className="py-2 text-right">R multiple</th>
                <th className="py-2 text-right">Win rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/20">
                  <td className="py-2 font-medium">{r.championships?.name ?? "Championship"}</td>
                  <td className="py-2 text-right font-semibold">#{r.final_rank}</td>
                  <td className={"py-2 text-right tabular-nums " + (Number(r.pnl) >= 0 ? "text-success" : "text-danger")}>
                    {fmtCurrency(Number(r.pnl))}
                  </td>
                  <td className="py-2 text-right tabular-nums">{Number(r.r_multiple).toFixed(2)}R</td>
                  <td className="py-2 text-right tabular-nums">{fmtPercent(Number(r.win_rate))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </GlassCard>
  );
}

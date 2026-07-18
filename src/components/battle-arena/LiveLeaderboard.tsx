import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Trophy } from "lucide-react";
import { findWinCondition } from "@/lib/battle-arena/constants";

type Ranking = { user_id: string; rank: number; pnl: number; r_multiple: number; win_rate: number; trades_count: number; max_drawdown: number; score: number };
type Profile = { id: string; username: string | null; display_name: string | null; avatar_url: string | null };

export function LiveLeaderboard({ rankings, profiles, winCondition }: { rankings: Ranking[]; profiles: Profile[]; winCondition: string }) {
  const wc = findWinCondition(winCondition);
  const byId = new Map(profiles.map((p) => [p.id, p]));

  return (
    <div className="rounded-2xl border border-border/60 bg-card/40">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Live leaderboard</h3>
        </div>
        <span className="text-[11px] text-muted-foreground">Sorted by {wc.label.toLowerCase()}</span>
      </div>
      {rankings.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">No trades scored yet. Rankings update as trades close.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">#</th>
                <th className="px-4 py-2 text-left">Trader</th>
                <th className="px-4 py-2 text-right">PnL</th>
                <th className="px-4 py-2 text-right">R</th>
                <th className="px-4 py-2 text-right">Win %</th>
                <th className="px-4 py-2 text-right">Trades</th>
                <th className="px-4 py-2 text-right">Max DD</th>
              </tr>
            </thead>
            <tbody>
              {rankings.map((r) => {
                const p = byId.get(r.user_id);
                return (
                  <tr key={r.user_id} className="border-t border-border/60">
                    <td className="px-4 py-2 font-bold tabular-nums">{r.rank}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6"><AvatarImage src={p?.avatar_url ?? undefined} /><AvatarFallback>{(p?.display_name ?? p?.username ?? "?").slice(0, 1)}</AvatarFallback></Avatar>
                        <span className="truncate">{p?.display_name ?? p?.username ?? "Trader"}</span>
                      </div>
                    </td>
                    <td className={`px-4 py-2 text-right tabular-nums ${Number(r.pnl) > 0 ? "text-emerald-600" : Number(r.pnl) < 0 ? "text-rose-600" : ""}`}>
                      {Number(r.pnl).toLocaleString(undefined, { style: "currency", currency: "USD" })}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{Number(r.r_multiple).toFixed(2)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{Number(r.win_rate).toFixed(1)}%</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.trades_count}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-rose-600/80">-${Number(r.max_drawdown).toFixed(0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

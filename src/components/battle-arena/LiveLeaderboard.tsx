import { useEffect, useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Trophy, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { findWinCondition } from "@/lib/battle-arena/constants";
import { PresenceDot, type PresenceStatus } from "./PresenceDot";
import { CountryFlag } from "@/components/social/CountryFlag";
import { cn } from "@/lib/utils";

type Ranking = { user_id: string; rank: number; pnl: number; return_pct: number; r_multiple: number; win_rate: number; trades_count: number; max_drawdown: number; score: number; updated_at?: string };
type Profile = { id: string; username: string | null; display_name: string | null; avatar_url: string | null; country?: string | null };
type Presence = { user_id: string; status: PresenceStatus; last_seen_at: string };

export function LiveLeaderboard({
  rankings, profiles, presence, winCondition, openPositionsByUser,
  lastTradeByUser, compact,
}: {
  rankings: Ranking[];
  profiles: Profile[];
  presence: Presence[];
  winCondition: string;
  openPositionsByUser?: Record<string, number>;
  lastTradeByUser?: Record<string, string>;
  compact?: boolean;
}) {
  const wc = findWinCondition(winCondition);
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const presByUser = new Map(presence.map((p) => [p.user_id, p]));
  const prevRankRef = useRef<Map<string, number>>(new Map());
  const changes = new Map<string, number>();

  rankings.forEach((r) => {
    const prev = prevRankRef.current.get(r.user_id);
    if (prev !== undefined && prev !== r.rank) changes.set(r.user_id, prev - r.rank);
  });

  useEffect(() => {
    const next = new Map<string, number>();
    rankings.forEach((r) => next.set(r.user_id, r.rank));
    prevRankRef.current = next;
  }, [rankings]);

  return (
    <div className="rounded-2xl border border-border/60 bg-card/40">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">HIVE Standings</h3>
        </div>
        <span className="text-[11px] text-muted-foreground">Sorted by Return % (Primary)</span>
      </div>
      {rankings.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">No trades scored yet. Rankings update as trades close.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card/80 text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Competitor</th>
                <th className="px-2 py-2 text-right">Return %</th>
                <th className="px-2 py-2 text-right text-muted-foreground font-normal">PnL</th>
                {!compact && (
                  <>
                    <th className="px-2 py-2 text-right">R</th>
                    <th className="px-2 py-2 text-right">Win %</th>
                    <th className="px-2 py-2 text-right">Trades</th>
                    <th className="px-2 py-2 text-right">Open</th>
                    <th className="px-2 py-2 text-right">Max DD</th>
                    <th className="px-2 py-2 text-right">Last trade</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {rankings.map((r) => {
                const p = byId.get(r.user_id);
                const pres = presByUser.get(r.user_id);
                const change = changes.get(r.user_id) ?? 0;
                const openCount = openPositionsByUser?.[r.user_id] ?? 0;
                const last = lastTradeByUser?.[r.user_id];
                return (
                  <tr key={r.user_id} className={cn(
                    "border-t border-border/60 transition-colors",
                    change > 0 && "bg-success/5 animate-in fade-in",
                    change < 0 && "bg-danger/5",
                    r.rank === 1 && "bg-warning/5",
                  )}>
                    <td className="px-3 py-2 tabular-nums">
                      <div className="flex items-center gap-1 font-bold">
                        {r.rank === 1 && <Trophy className="h-3.5 w-3.5 text-warning" />}
                        <span>{r.rank}</span>
                        {change > 0 && <ArrowUp className="h-3 w-3 text-success" />}
                        {change < 0 && <ArrowDown className="h-3 w-3 text-danger" />}
                        {change === 0 && prevRankRef.current.has(r.user_id) && <Minus className="h-3 w-3 text-muted-foreground/40" />}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <Avatar className="h-7 w-7"><AvatarImage src={p?.avatar_url ?? undefined} /><AvatarFallback>{(p?.display_name ?? p?.username ?? "?").slice(0, 1)}</AvatarFallback></Avatar>
                          <span className="absolute -bottom-0.5 -right-0.5"><PresenceDot status={pres?.status ?? "disconnected"} /></span>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-medium">{p?.display_name ?? p?.username ?? "Competitor"}</span>
                            {p?.country && <CountryFlag country={p.country} className="h-3 w-4" />}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className={cn("px-2 py-2 text-right tabular-nums font-semibold", Number(r.return_pct) > 0 ? "text-success" : Number(r.return_pct) < 0 ? "text-danger" : "")} title={r.rank > rankings[rankings.indexOf(r)-1]?.rank ? "" : "Tied in Return %: Tie-breaker applied (Drawdown > Trades > Time)"}>
                      {Number(r.return_pct).toFixed(2)}%
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground text-[10px]">
                      {Number(r.pnl).toLocaleString(undefined, { style: "currency", currency: "USD" })}
                    </td>
                    {!compact && (
                      <>
                        <td className="px-2 py-2 text-right tabular-nums">{Number(r.r_multiple).toFixed(2)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{Number(r.win_rate).toFixed(1)}%</td>
                        <td className="px-2 py-2 text-right tabular-nums">{r.trades_count}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{openCount || "—"}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-danger/80">{Number(r.max_drawdown).toFixed(2)}%</td>
                        <td className="px-2 py-2 text-right text-[11px] text-muted-foreground">
                          {last ? new Date(last).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                        </td>
                      </>
                    )}
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

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Trophy, Sparkles, Coins } from "lucide-react";
import { ShareToCommunityButton } from "@/components/sharing/ShareToCommunityButton";
import { useAuth } from "@/hooks/use-auth";

type Result = { user_id: string; final_rank: number; pnl: number; r_multiple: number; win_rate: number; trades_count: number; xp_awarded: number; coins_awarded: number };
type Profile = { id: string; username: string | null; display_name: string | null; avatar_url: string | null };

export function BattleResultsView({ battle, results, profiles }: { battle: any; results: Result[]; profiles: Profile[] }) {
  const { user } = useAuth();
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const podium = results.filter((r) => r.final_rank <= 3).sort((a, b) => a.final_rank - b.final_rank);
  const rest = results.filter((r) => r.final_rank > 3);
  const winner = byId.get(battle.winner_user_id);
  const myResult = results.find((r) => r.user_id === user?.id);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-amber-500/10 via-primary/5 to-background p-6 text-center">
        <Trophy className="mx-auto h-8 w-8 text-amber-500" />
        <div className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">Winner</div>
        <div className="mt-1 text-2xl font-bold">{winner?.display_name ?? winner?.username ?? "—"}</div>
        {myResult ? (
          <div className="mt-4 flex justify-center">
            <ShareToCommunityButton
              sourceType="battle" sourceId={battle.id}
              label={myResult.final_rank === 1 ? "Share victory to Community" : "Share result to Community"}
              variant="default"
            />
          </div>
        ) : null}
      </div>

      {podium.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {podium.map((r) => {
            const p = byId.get(r.user_id);
            const colors = ["border-amber-500/40 bg-amber-500/5", "border-slate-400/40 bg-slate-400/5", "border-orange-600/40 bg-orange-600/5"];
            return (
              <div key={r.user_id} className={`rounded-2xl border p-4 text-center ${colors[r.final_rank - 1]}`}>
                <div className="text-3xl font-black tabular-nums">#{r.final_rank}</div>
                <Avatar className="mx-auto mt-2 h-12 w-12"><AvatarImage src={p?.avatar_url ?? undefined} /><AvatarFallback>{(p?.display_name ?? "?").slice(0, 1)}</AvatarFallback></Avatar>
                <div className="mt-2 font-semibold">{p?.display_name ?? p?.username ?? "Trader"}</div>
                <div className="mt-1 text-sm text-muted-foreground tabular-nums">${Number(r.pnl).toFixed(2)} · {Number(r.r_multiple).toFixed(2)}R</div>
                <div className="mt-2 flex items-center justify-center gap-2 text-[11px]">
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5"><Sparkles className="h-3 w-3" />{r.xp_awarded} XP</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5"><Coins className="h-3 w-3" />{r.coins_awarded}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {rest.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card/40">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">#</th>
                <th className="px-4 py-2 text-left">Trader</th>
                <th className="px-4 py-2 text-right">PnL</th>
                <th className="px-4 py-2 text-right">R</th>
                <th className="px-4 py-2 text-right">Win %</th>
                <th className="px-4 py-2 text-right">XP</th>
                <th className="px-4 py-2 text-right">Coins</th>
              </tr>
            </thead>
            <tbody>
              {rest.map((r) => {
                const p = byId.get(r.user_id);
                return (
                  <tr key={r.user_id} className="border-t border-border/60">
                    <td className="px-4 py-2 font-bold tabular-nums">{r.final_rank}</td>
                    <td className="px-4 py-2">{p?.display_name ?? p?.username ?? "Trader"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">${Number(r.pnl).toFixed(2)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{Number(r.r_multiple).toFixed(2)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{Number(r.win_rate).toFixed(1)}%</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.xp_awarded}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.coins_awarded}</td>
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

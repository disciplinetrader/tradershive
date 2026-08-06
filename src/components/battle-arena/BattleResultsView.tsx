import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Trophy, Sparkles, Coins, TrendingUp, TrendingDown, Swords, RotateCcw, Home } from "lucide-react";
import { ShareToCommunityButton } from "@/components/sharing/ShareToCommunityButton";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";

type Result = { 
  user_id: string; 
  final_rank: number; 
  pnl: number; 
  r_multiple: number; 
  win_rate: number; 
  trades_count: number; 
  xp_awarded: number; 
  coins_awarded: number;
  ranking_delta?: number; 
};
type Profile = { id: string; username: string | null; display_name: string | null; avatar_url: string | null };

export function BattleResultsView({ battle, results, profiles }: { battle: any; results: Result[]; profiles: Profile[] }) {
  const { user } = useAuth();
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const sortedResults = [...results].sort((a, b) => a.final_rank - b.final_rank);
  const podium = sortedResults.filter((r) => r.final_rank <= 3);
  const rest = sortedResults.filter((r) => r.final_rank > 3);
  const winner = byId.get(battle.winner_user_id);
  const myResult = results.find((r) => r.user_id === user?.id);

  return (
    <div className="mx-auto max-w-4xl space-y-12 py-10 animate-in fade-in duration-700">
      <div className="text-center space-y-4">
        <motion.div 
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", damping: 10 }}
          className="mx-auto grid h-20 w-20 place-items-center rounded-[28px] bg-warning/10 text-warning shadow-2xl shadow-warning/20 ring-1 ring-warning/20"
        >
          <Trophy className="h-10 w-10" />
        </motion.div>
        <div className="space-y-1">
          <h2 className="text-3xl font-black tracking-tight italic">ARENA FINALIZED</h2>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-muted-foreground">{battle.name}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
        {/* Silver - 2nd Place */}
        <PodiumSpot 
          result={podium.find(r => r.final_rank === 2)} 
          profile={byId.get(podium.find(r => r.final_rank === 2)?.user_id || "")}
          rank={2}
          className="order-2 md:order-1"
        />
        
        {/* Gold - 1st Place */}
        <PodiumSpot 
          result={podium.find(r => r.final_rank === 1)} 
          profile={byId.get(podium.find(r => r.final_rank === 1)?.user_id || "")}
          rank={1}
          className="order-1 md:order-2 md:-translate-y-8"
        />

        {/* Bronze - 3rd Place */}
        <PodiumSpot 
          result={podium.find(r => r.final_rank === 3)} 
          profile={byId.get(podium.find(r => r.final_rank === 3)?.user_id || "")}
          rank={3}
          className="order-3"
        />
      </div>

      {myResult && (
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="relative overflow-hidden rounded-[40px] border border-primary/30 bg-card/40 p-8 backdrop-blur-xl"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent" />
          <div className="relative flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="flex items-center gap-6">
              <div className="grid h-16 w-16 place-items-center rounded-[24px] bg-primary/10 text-primary">
                <Swords className="h-8 w-8" />
              </div>
              <div className="space-y-1">
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Your Standing</div>
                <div className="text-2xl font-black italic tracking-tighter">RANK #{myResult.final_rank}</div>
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "flex items-center gap-1 text-xs font-black italic",
                    (myResult.ranking_delta || 0) >= 0 ? "text-success" : "text-danger"
                  )}>
                    {(myResult.ranking_delta || 0) >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {Math.abs(myResult.ranking_delta || 0)} RP
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap justify-center gap-4">
              <div className="flex flex-col items-center gap-1 px-6 py-2 rounded-2xl bg-background/40 border border-border/40">
                <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">XP Earned</div>
                <div className="flex items-center gap-1.5 font-black text-primary italic">
                  <Sparkles className="h-3 w-3" /> +{myResult.xp_awarded}
                </div>
              </div>
              <div className="flex flex-col items-center gap-1 px-6 py-2 rounded-2xl bg-background/40 border border-border/40">
                <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Coins Won</div>
                <div className="flex items-center gap-1.5 font-black text-warning italic">
                  <Coins className="h-3 w-3" /> +{myResult.coins_awarded}
                </div>
              </div>
            </div>

            <ShareToCommunityButton
              sourceType="battle"
              sourceId={battle.id}
              label="Share Glory"
              variant="default"
              className="rounded-2xl font-black uppercase tracking-widest text-xs px-8 h-12"
            />
          </div>
        </motion.div>
      )}

      {rest.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground px-1">Honorable Mentions</h3>
          <div className="overflow-hidden rounded-[32px] border border-border/40 bg-card/20">
            <table className="w-full text-sm">
              <thead className="bg-background/40 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-6 py-4 text-left">#</th>
                  <th className="px-6 py-4 text-left">Competitor</th>
                  <th className="px-6 py-4 text-right">Return %</th>
                  <th className="px-6 py-4 text-right">RP Δ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {rest.map((r) => {
                  const p = byId.get(r.user_id);
                  return (
                    <tr key={r.user_id} className="group hover:bg-background/40 transition-colors">
                      <td className="px-6 py-4 font-black italic text-muted-foreground tabular-nums">{r.final_rank}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8 border border-border/40">
                            <AvatarImage src={p?.avatar_url ?? undefined} />
                            <AvatarFallback>{(p?.display_name ?? "?").slice(0, 1)}</AvatarFallback>
                          </Avatar>
                          <span className="font-bold tracking-tight">{p?.display_name ?? p?.username ?? "Competitor"}</span>
                        </div>
                      </td>
                      <td className={cn(
                        "px-6 py-4 text-right font-black tabular-nums italic",
                        r.pnl >= 0 ? "text-success" : "text-danger"
                      )}>
                        {r.pnl >= 0 ? "+" : ""}{Number(r.pnl).toFixed(2)}%
                      </td>
                      <td className="px-6 py-4 text-right">
                         <div className={cn(
                          "inline-flex items-center gap-1 text-[11px] font-black italic",
                          (r.ranking_delta || 0) >= 0 ? "text-success" : "text-danger"
                        )}>
                          {(r.ranking_delta || 0) >= 0 ? "+" : ""}{r.ranking_delta || 0}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-6 border-t border-border/20">
        <Button asChild variant="ghost" className="rounded-2xl font-black uppercase tracking-widest text-xs h-12 px-8">
          <Link to="/battle-arena">
            <Home className="mr-2 h-4 w-4" /> Back to Lobby
          </Link>
        </Button>
        <Button variant="outline" className="rounded-2xl font-black uppercase tracking-widest text-xs h-12 px-8 border-border/60">
          <RotateCcw className="mr-2 h-4 w-4" /> Rematch
        </Button>
      </div>
    </div>
  );
}

function PodiumSpot({ result, profile, rank, className }: { result?: Result; profile?: Profile; rank: number; className?: string }) {
  if (!result || !profile) return null;
  
  const colors = {
    1: "from-warning/20 to-warning/5 border-warning/40 text-warning",
    2: "from-slate-400/20 to-slate-400/5 border-slate-400/40 text-slate-400",
    3: "from-orange-600/20 to-orange-600/5 border-orange-600/40 text-orange-600",
  }[rank as 1 | 2 | 3];

  const heights = { 1: "h-64", 2: "h-52", 3: "h-44" };

  return (
    <motion.div 
      initial={{ y: 50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: rank * 0.1, duration: 0.6 }}
      className={cn("flex flex-col items-center gap-4", className)}
    >
      <div className="relative">
        <Avatar className={cn(
          "h-20 w-20 border-4 shadow-2xl",
          rank === 1 ? "border-warning h-24 w-24" : rank === 2 ? "border-slate-400" : "border-orange-600"
        )}>
          <AvatarImage src={profile.avatar_url ?? undefined} />
          <AvatarFallback className="text-xl font-black">{(profile.display_name ?? "?").slice(0, 1)}</AvatarFallback>
        </Avatar>
        <div className={cn(
          "absolute -bottom-2 -right-2 grid h-10 w-10 place-items-center rounded-2xl border-2 border-background font-black text-xl shadow-xl",
          rank === 1 ? "bg-warning text-warning-foreground" : rank === 2 ? "bg-slate-400 text-slate-900" : "bg-orange-600 text-orange-50"
        )}>
          {rank}
        </div>
      </div>

      <div className="text-center">
        <div className="font-black text-lg tracking-tight truncate max-w-[150px]">{profile.display_name ?? profile.username}</div>
        <div className={cn("text-xl font-black italic tracking-tighter tabular-nums", result.pnl >= 0 ? "text-success" : "text-danger")}>
          {result.pnl >= 0 ? "+" : ""}{Number(result.pnl).toFixed(2)}%
        </div>
      </div>

      <div className={cn(
        "relative w-full rounded-t-[32px] border-x border-t bg-gradient-to-b shadow-2xl",
        colors,
        heights[rank as 1 | 2 | 3]
      )}>
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-center p-6 text-center opacity-40">
           <Trophy className="h-12 w-12 mb-2" />
           <div className="text-[10px] font-black uppercase tracking-[0.2em]">{rank === 1 ? "CHAMPION" : rank === 2 ? "RUNNER UP" : "PODIUM"}</div>
        </div>
      </div>
    </motion.div>
  );
}

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(" ");
}

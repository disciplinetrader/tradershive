import { useLeaderboard } from "@/lib/battle-arena/hooks/use-ranking-queries";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Trophy, TrendingUp, Star } from "lucide-react";

export function LobbyRightRail() {
  const { user } = useAuth();
  const { data: leaderboard = [] } = useLeaderboard(10);

  return (
    <aside className="hidden w-80 flex-shrink-0 flex-col gap-8 xl:flex">
      {/* Global Leaderboard */}
      <section className="rounded-3xl border border-border/40 bg-card/30 p-5 backdrop-blur-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
            <Trophy className="h-4 w-4 text-warning" /> Leaderboard
          </h3>
          <button className="text-[10px] font-bold uppercase tracking-widest text-primary hover:underline">View Full</button>
        </div>

        <div className="space-y-2">
          {leaderboard.map((profile, i) => {
            const isMe = profile.id === user?.id;
            return (
              <div 
                key={profile.id}
                className={cn(
                  "flex items-center gap-3 rounded-2xl p-2.5 transition-colors",
                  isMe ? "bg-primary/10 border border-primary/20" : "hover:bg-muted/20"
                )}
              >
                <div className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-lg text-[10px] font-black",
                  i === 0 ? "bg-warning text-warning-foreground" : 
                  i === 1 ? "bg-slate-300 text-slate-900" :
                  i === 2 ? "bg-amber-600 text-amber-50" : "bg-muted text-muted-foreground"
                )}>
                  {i + 1}
                </div>
                <Avatar className="h-8 w-8 rounded-xl ring-1 ring-border">
                  <AvatarImage src={profile.avatar_url || ""} />
                  <AvatarFallback className="rounded-xl text-[10px]">{profile.display_name?.[0] || "?"}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-black tracking-tight">{profile.display_name || profile.username}</div>
                  <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">{profile.elo} RP</div>
                </div>
                <TrendingUp className="h-3 w-3 text-success opacity-50" />
              </div>
            );
          })}
        </div>
      </section>

      {/* Season Rewards */}
      <section className="rounded-3xl border border-border/40 bg-card/30 p-5 backdrop-blur-xl">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-black uppercase tracking-widest">
          <Star className="h-4 w-4 text-primary" /> Season Rewards
        </h3>
        <div className="space-y-3">
          <RewardItem rank="1st Place" reward="5,000 HIVE + Apex Badge" />
          <RewardItem rank="2nd Place" reward="2,500 HIVE + Sovereign Badge" />
          <RewardItem rank="3rd Place" reward="1,000 HIVE" />
          <RewardItem rank="Top 10" reward="500 HIVE" />
        </div>
      </section>
    </aside>
  );
}

function RewardItem({ rank, reward }: { rank: string; reward: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-border/20 bg-background/40 p-3">
      <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{rank}</div>
      <div className="text-xs font-black tracking-tight">{reward}</div>
    </div>
  );
}

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Crown, Star } from "lucide-react";
import { getRankFromElo } from "@/lib/battle-arena/constants";
import { cn } from "@/lib/utils";

type P = { user_id: string; status: string; joined_at: string; is_ready?: boolean };
type Profile = { id: string; username: string | null; display_name: string | null; avatar_url: string | null; elo?: number; country?: string | null };


export function ParticipantsList({ 
  participants, 
  profiles, 
  hostId,
  isLobby
}: { 
  participants: P[]; 
  profiles: Profile[]; 
  hostId: string;
  isLobby?: boolean;
}) {
  const byId = new Map(profiles.map((p) => [p.id, p]));
  
  return (
    <div className={cn(
      "rounded-3xl border border-border/60 bg-card/20 overflow-hidden shadow-xl shadow-background/10",
      isLobby && "flex flex-col h-full"
    )}>
      <div className="border-b border-border/60 px-6 py-4 flex items-center justify-between bg-background/20">
        <h3 className="text-sm font-black uppercase tracking-widest text-foreground">
          Competitors
        </h3>
        <span className="text-[10px] font-black bg-primary/10 text-primary px-2 py-0.5 rounded-lg border border-primary/20">
          {participants.length} TOTAL
        </span>
      </div>
      
      {participants.length === 0 ? (
        <div className="flex-1 grid place-items-center p-8 text-center">
          <div className="space-y-1">
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Empty Staging Room</div>
            <p className="text-[10px] text-muted-foreground/60 max-w-[150px] mx-auto">Waiting for competitors to join the arena...</p>
          </div>
        </div>
      ) : (
        <ul className={cn(
          "divide-y divide-border/60",
          isLobby && "flex-1 overflow-y-auto"
        )}>
          {participants.map((p) => {
            const pr = byId.get(p.user_id);
            const elo = pr?.elo || 1000;
            const rank = getRankFromElo(elo);
            
            return (
              <li key={p.user_id} className="group flex items-center justify-between px-6 py-3.5 transition-colors hover:bg-background/40">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Avatar className="h-10 w-10 border-2 border-border/40 group-hover:border-primary/40 transition-colors shadow-lg shadow-background/20">
                      <AvatarImage src={pr?.avatar_url ?? undefined} />
                      <AvatarFallback className="font-black text-xs">{(pr?.display_name ?? pr?.username ?? "?").slice(0, 1)}</AvatarFallback>
                    </Avatar>
                    {p.user_id === hostId && (
                      <div className="absolute -top-1 -right-1 bg-warning rounded-full p-0.5 border border-background shadow-lg shadow-warning/20">
                        <Crown className="h-2.5 w-2.5 text-warning-foreground" />
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-foreground group-hover:text-primary transition-colors">{pr?.display_name ?? pr?.username ?? "Competitor"}</span>
                      <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/40">{p.user_id === hostId ? "Host" : "Competitor"}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="flex items-center gap-1 text-[10px] font-bold" style={{ color: rank.color }}>
                        <Star className="h-3 w-3 fill-current" />
                        {elo}
                      </div>
                      <span className="text-muted-foreground/30">•</span>
                      <div className="text-[10px] text-muted-foreground/60 font-bold uppercase tracking-tight">
                        Joined {new Date(p.joined_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span className={cn(
                    "rounded-lg px-2 py-0.5 text-[9px] font-black uppercase tracking-widest border",
                    p.status === 'trading' ? "bg-success/5 text-success border-success/20 animate-pulse" : 
                    p.status === 'watching' ? "bg-primary/5 text-primary border-primary/20" :
                    "bg-muted/40 text-muted-foreground/60 border-border/40"
                  )}>
                    {p.status}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Crown, Star, ShieldCheck, Timer, Check, Users } from "lucide-react";
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
            const isHost = p.user_id === hostId;
            
            return (
              <li 
                key={p.user_id} 
                className={cn(
                  "group flex items-center justify-between px-6 py-3.5 transition-all duration-300",
                  p.is_ready ? "bg-success/5" : "hover:bg-background/40"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Avatar className={cn(
                      "h-10 w-10 border-2 transition-colors shadow-lg shadow-background/20",
                      p.is_ready ? "border-success" : "border-border/40 group-hover:border-primary/40"
                    )}>
                      <AvatarImage src={pr?.avatar_url ?? undefined} />
                      <AvatarFallback className="font-black text-xs">{(pr?.display_name ?? pr?.username ?? "?").slice(0, 1)}</AvatarFallback>
                    </Avatar>
                    {isHost && (
                      <div className="absolute -right-1 -top-1 rounded-full bg-primary p-0.5 text-white shadow-lg shadow-primary/40">
                        <Crown className="h-3 w-3" />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold tracking-tight">
                        {pr?.display_name || pr?.username || "Competitor"}
                      </span>
                      {p.is_ready && (
                        <div className="flex items-center gap-1 rounded-full bg-success/10 px-1.5 py-0.5 text-[8px] font-black uppercase text-success">
                          <Check className="h-2.5 w-2.5" /> Locked In
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                    <span className={cn("text-[10px] font-black uppercase tracking-tighter")}>
                      {rank.label}
                    </span>

                      <span className="text-[10px] text-muted-foreground/60">•</span>
                      <span className="text-[10px] font-bold text-muted-foreground/80">{elo} HR</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isLobby && (
                    <div className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-xl border transition-all duration-500",
                      p.is_ready 
                        ? "border-success/30 bg-success/10 text-success shadow-sm shadow-success/10" 
                        : "border-border/60 bg-muted/40 text-muted-foreground/40"
                    )}>
                      {p.is_ready ? <ShieldCheck className="h-4 w-4" /> : <Timer className="h-4 w-4" />}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {isLobby && participants.length > 0 && participants.length < 4 && (
        <div className="p-4 border-t border-border/60 bg-primary/5">
           <div className="flex flex-col items-center text-center">
             <div className="text-[10px] font-black uppercase tracking-widest text-primary/60 mb-1">Staging Area</div>
             <p className="text-[10px] text-muted-foreground leading-relaxed">
               Arena requires at least 2 competitors to begin countdown. Invite more allies to the HIVE.
             </p>
           </div>
        </div>
      )}
    </div>
  );
}

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Crown } from "lucide-react";

type P = { user_id: string; status: string; joined_at: string };
type Profile = { id: string; username: string | null; display_name: string | null; avatar_url: string | null };

export function ParticipantsList({ participants, profiles, hostId }: { participants: P[]; profiles: Profile[]; hostId: string }) {
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return (
    <div className="rounded-2xl border border-border/60 bg-card/40">
      <div className="border-b border-border/60 px-4 py-3 text-sm font-semibold">
        Participants <span className="ml-1 text-muted-foreground">({participants.length})</span>
      </div>
      {participants.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">No participants yet.</div>
      ) : (
        <ul className="divide-y divide-border/60">
          {participants.map((p) => {
            const pr = byId.get(p.user_id);
            return (
              <li key={p.user_id} className="flex items-center justify-between px-4 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <Avatar className="h-7 w-7"><AvatarImage src={pr?.avatar_url ?? undefined} /><AvatarFallback>{(pr?.display_name ?? pr?.username ?? "?").slice(0, 1)}</AvatarFallback></Avatar>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">{pr?.display_name ?? pr?.username ?? "Trader"}</span>
                      {p.user_id === hostId && <Crown className="h-3.5 w-3.5 text-warning" />}
                    </div>
                    <div className="text-[11px] text-muted-foreground">Joined {new Date(p.joined_at).toLocaleDateString()}</div>
                  </div>
                </div>
                <span className="rounded-full bg-background/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{p.status}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

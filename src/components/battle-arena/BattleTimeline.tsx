import { formatDistanceToNow } from "date-fns";
import { Flag, Play, Trophy, Crown, TrendingUp, TrendingDown, Zap } from "lucide-react";

type Event = { id: string; event_type: string; message: string; created_at: string; severity: string };

const KEY_EVENTS = new Set([
  "battle_created","battle_started","battle_ended","battle_cancelled",
  "new_leader","milestone","rank_up","rank_down",
]);

const ICONS: Record<string, any> = {
  battle_created: Flag,
  battle_started: Play,
  battle_ended: Trophy,
  battle_cancelled: Flag,
  new_leader: Crown,
  milestone: Zap,
  rank_up: TrendingUp,
  rank_down: TrendingDown,
};

export function BattleTimeline({ events }: { events: Event[] }) {
  const key = events.filter((e) => KEY_EVENTS.has(e.event_type)).slice(0, 12).reverse();
  return (
    <div className="rounded-2xl border border-border/60 bg-card/40">
      <div className="border-b border-border/60 px-4 py-3 text-sm font-semibold">Arena Chronology</div>
      {key.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">No milestones yet.</div>
      ) : (
        <ol className="relative space-y-3 p-4">
          <span className="absolute left-6 top-4 bottom-4 w-px bg-border/60" />
          {key.map((e) => {
            const Icon = ICONS[e.event_type] ?? Flag;
            return (
              <li key={e.id} className="relative flex items-start gap-3">
                <div className="relative z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border/60 bg-background text-primary">
                  <Icon className="h-3 w-3" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm">{e.message}</div>
                  <div className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}</div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

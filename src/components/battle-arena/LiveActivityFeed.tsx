import { useMemo } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";
import { Activity, LogIn, LogOut, TrendingUp, TrendingDown, Trophy, Crown, ShieldAlert, Zap, Flag, Play, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Event = {
  id: string; battle_id: string; user_id: string | null;
  event_type: string; severity: string; message: string;
  metadata: any; created_at: string;
};
type Profile = { id: string; username: string | null; display_name: string | null; avatar_url: string | null };

const ICONS: Record<string, { icon: any; tone: string }> = {
  trade_opened:       { icon: TrendingUp, tone: "text-blue-600" },
  trade_closed:       { icon: TrendingDown, tone: "text-success" },
  rank_up:            { icon: Trophy, tone: "text-warning" },
  rank_down:          { icon: TrendingDown, tone: "text-danger" },
  new_leader:         { icon: Crown, tone: "text-warning" },
  milestone:          { icon: Zap, tone: "text-purple-500" },
  rule_violation:     { icon: ShieldAlert, tone: "text-danger" },
  player_joined:      { icon: LogIn, tone: "text-blue-600" },
  player_left:        { icon: LogOut, tone: "text-slate-500" },
  player_disconnected:{ icon: LogOut, tone: "text-warning" },
  player_returned:    { icon: LogIn, tone: "text-success" },
  battle_started:     { icon: Play, tone: "text-success" },
  battle_ended:       { icon: Flag, tone: "text-purple-600" },
  battle_cancelled:   { icon: XCircle, tone: "text-danger" },
  battle_created:     { icon: Activity, tone: "text-blue-600" },
  system:             { icon: Activity, tone: "text-muted-foreground" },
};

export function LiveActivityFeed({ events, profiles, height = "h-[520px]" }: { events: Event[]; profiles: Profile[]; height?: string }) {
  const byId = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  return (
    <div className="rounded-2xl border border-border/60 bg-card/40">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold"><Activity className="h-4 w-4 text-primary" />Live activity</div>
        <span className="text-[11px] text-muted-foreground">{events.length} events</span>
      </div>
      <div className={cn("overflow-y-auto", height)}>
        {events.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Waiting for first event…</div>
        ) : (
          <ol className="divide-y divide-border/40">
            {events.map((e) => {
              const meta = ICONS[e.event_type] ?? ICONS.system;
              const Icon = meta.icon;
              const p = e.user_id ? byId.get(e.user_id) : null;
              return (
                <li key={e.id} className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-background/60">
                  <div className={cn("mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-background/60", meta.tone)}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {p && (
                        <Avatar className="h-4 w-4"><AvatarImage src={p.avatar_url ?? undefined} /><AvatarFallback className="text-[9px]">{(p.display_name ?? p.username ?? "?").slice(0, 1)}</AvatarFallback></Avatar>
                      )}
                      <span className="truncate text-sm">
                        {p && <span className="font-medium">{p.display_name ?? p.username ?? "Trader"}</span>}
                        {p ? " · " : ""}
                        <span className={e.severity === "error" ? "text-danger" : e.severity === "warning" ? "text-warning" : ""}>{e.message}</span>
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}</div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

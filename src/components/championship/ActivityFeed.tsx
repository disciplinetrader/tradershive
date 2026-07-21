import { useMemo } from "react";
import { AlertCircle, CheckCircle2, Info, TrendingUp, Zap, Trophy, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";

type Activity = {
  id: string;
  kind?: string | null;
  message: string;
  severity?: string | null;
  metadata?: any;
  created_at: string;
  user_id?: string | null;
};

const ICONS: Record<string, any> = {
  success: CheckCircle2,
  warning: AlertCircle,
  error: AlertCircle,
  info: Info,
  milestone: Trophy,
  announcement: Megaphone,
  trade: TrendingUp,
};

function iconFor(a: Activity) {
  return ICONS[a.kind ?? ""] ?? ICONS[a.severity ?? "info"] ?? Zap;
}

function dotClass(sev?: string | null) {
  switch (sev) {
    case "success":
      return "bg-success";
    case "warning":
      return "bg-warning";
    case "error":
      return "bg-danger";
    default:
      return "bg-primary";
  }
}

/** Real-time tournament activity feed. Data is refreshed by the parent via realtime + polling. */
export function ActivityFeed({
  activity,
  profiles,
  maxHeight = "24rem",
  emptyMessage = "No activity yet",
}: {
  activity: Activity[];
  profiles?: Array<{ id: string; display_name?: string | null; username?: string | null; avatar_url?: string | null }>;
  maxHeight?: string;
  emptyMessage?: string;
}) {
  const profileMap = useMemo(() => new Map(profiles?.map((p) => [p.id, p])), [profiles]);
  if (!activity?.length) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 bg-background/40 p-6 text-center text-xs text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }
  return (
    <ul className="space-y-2 overflow-y-auto pr-1" style={{ maxHeight }}>
      {activity.map((a) => {
        const Icon = iconFor(a);
        const p = a.user_id ? profileMap.get(a.user_id) : null;
        return (
          <li
            key={a.id}
            className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/40 p-2 text-xs"
          >
            <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", dotClass(a.severity))} />
            <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="text-foreground">
                {p ? <span className="font-medium">{p.display_name ?? p.username} </span> : null}
                {a.message}
              </div>
              <div className="text-[10px] text-muted-foreground">{new Date(a.created_at).toLocaleString()}</div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

import { useState } from "react";
import { Award, Bell, LineChart, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MOCK_NOTIFICATIONS, type DashboardNotification } from "@/lib/dashboard-mock";
import { cn } from "@/lib/utils";

const ICON: Record<DashboardNotification["type"], typeof Bell> = {
  challenge: Sparkles,
  trade: LineChart,
  achievement: Award,
  system: Bell,
};

export function NotificationsWidget() {
  const [items, setItems] = useState(MOCK_NOTIFICATIONS);
  const unread = items.filter((i) => !i.read).length;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
          {unread} unread
        </Badge>
        <Button size="sm" variant="ghost" onClick={() => setItems((xs) => xs.map((x) => ({ ...x, read: true })))}>
          Mark all read
        </Button>
      </div>
      <ul className="space-y-1.5">
        {items.map((n) => {
          const Icon = ICON[n.type];
          return (
            <li
              key={n.id}
              className={cn(
                "flex items-start gap-3 rounded-xl border border-transparent px-3 py-2 transition hover:border-border/60 hover:bg-surface/50",
                !n.read && "bg-primary/[0.04]",
              )}
            >
              <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{n.title}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{n.time}</span>
                </div>
                <p className="line-clamp-2 text-xs text-muted-foreground">{n.description}</p>
              </div>
              {!n.read ? (
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-label="Unread" />
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="mt-3 text-right">
        <Button size="sm" variant="outline">View all</Button>
      </div>
    </div>
  );
}

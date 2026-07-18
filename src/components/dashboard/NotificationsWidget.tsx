import { Award, Bell, LineChart, Sparkles } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { listMyNotifications, markAllNotificationsRead } from "@/lib/dashboard.functions";
import { cn } from "@/lib/utils";

const ICON: Record<string, typeof Bell> = {
  challenge: Sparkles,
  trade: LineChart,
  achievement: Award,
  system: Bell,
};

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function NotificationsWidget() {
  const qc = useQueryClient();
  const list = useServerFn(listMyNotifications);
  const markAll = useServerFn(markAllNotificationsRead);
  const { data, isLoading } = useQuery({
    queryKey: ["my_notifications"],
    queryFn: () => list(),
    staleTime: 30_000,
  });
  const mut = useMutation({
    mutationFn: () => markAll(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my_notifications"] }),
  });

  if (isLoading) return <Skeleton className="h-40 w-full rounded-2xl" />;
  const items = data ?? [];
  if (items.length === 0) {
    return <EmptyState icon={Bell} title="All caught up" description="No new notifications right now." />;
  }
  const unread = items.filter((i) => !i.read).length;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
          {unread} unread
        </Badge>
        <Button size="sm" variant="ghost" onClick={() => mut.mutate()} disabled={mut.isPending || unread === 0}>
          Mark all read
        </Button>
      </div>
      <ul className="space-y-1.5">
        {items.map((n) => {
          const Icon = ICON[n.type] ?? Bell;
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
                  <span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo(n.createdAt)}</span>
                </div>
                <p className="line-clamp-2 text-xs text-muted-foreground">{n.description}</p>
              </div>
              {!n.read ? <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-label="Unread" /> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

import { Bell, X, AlertTriangle, Info } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  listAdminNotifications,
  markAdminNotificationRead,
  dismissAdminNotification,
} from "@/lib/admin/console.functions";

export function NotificationBell() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAdminNotifications);
  const readFn = useServerFn(markAdminNotificationRead);
  const dismissFn = useServerFn(dismissAdminNotification);

  const q = useQuery({
    queryKey: ["admin-notifications"],
    queryFn: () => listFn({ data: { onlyUnread: false, limit: 20 } }),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const readMut = useMutation({
    mutationFn: (id: string) => readFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-notifications"] }),
  });
  const dismissMut = useMutation({
    mutationFn: (id: string) => dismissFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-notifications"] }),
  });

  const unread = q.data?.unreadCount ?? 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9"
          aria-label={`Admin notifications (${unread} unread)`}
        >
          <Bell className="h-4 w-4" />
          {unread > 0 ? (
            <span className="absolute right-1 top-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-danger px-1 text-[9px] font-semibold text-danger-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b border-border/60 p-3">
          <div className="text-sm font-semibold">Admin notifications</div>
          <div className="text-[11px] text-muted-foreground">{unread} unread</div>
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {q.isLoading ? (
            <div className="p-6 text-center text-xs text-muted-foreground">Loading…</div>
          ) : !q.data?.rows.length ? (
            <div className="p-6 text-center text-xs text-muted-foreground">You're all caught up.</div>
          ) : (
            q.data.rows.map((n: any) => {
              const isUnread = !(n.read_by ?? []).includes(""); // read state handled server-side
              const Icon = n.severity === "critical" || n.severity === "error" ? AlertTriangle : Info;
              return (
                <div
                  key={n.id}
                  className={cn(
                    "group border-b border-border/40 p-3 last:border-0 transition",
                    isUnread ? "bg-primary/[0.02]" : "",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <Icon
                      className={cn(
                        "mt-0.5 h-3.5 w-3.5 shrink-0",
                        n.severity === "critical" || n.severity === "error"
                          ? "text-danger"
                          : n.severity === "warning"
                            ? "text-warning"
                            : "text-primary",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{n.title}</div>
                      {n.message ? (
                        <div className="text-xs text-muted-foreground line-clamp-2">{n.message}</div>
                      ) : null}
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</span>
                        <span>•</span>
                        <span className="uppercase tracking-wider">{n.source}</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 opacity-0 transition group-hover:opacity-100">
                      <button
                        onClick={() => readMut.mutate(n.id)}
                        className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
                      >
                        Read
                      </button>
                      <button
                        onClick={() => dismissMut.mutate(n.id)}
                        className="grid h-5 w-5 place-items-center rounded text-muted-foreground hover:bg-danger/10 hover:text-danger"
                        aria-label="Dismiss"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Bell, Check, X } from "lucide-react";
import {
  listAdminNotifications,
  markAdminNotificationRead,
  dismissAdminNotification,
} from "@/lib/admin/console.functions";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/admin/StatusPill";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/notifications")({
  component: AdminNotifications,
});

function AdminNotifications() {
  const qc = useQueryClient();
  const [onlyUnread, setOnlyUnread] = useState(false);
  const listFn = useServerFn(listAdminNotifications);
  const readFn = useServerFn(markAdminNotificationRead);
  const dismissFn = useServerFn(dismissAdminNotification);

  const q = useQuery({
    queryKey: ["admin-notifications-full", onlyUnread],
    queryFn: () => listFn({ data: { onlyUnread, limit: 100 } }),
  });

  const readMut = useMutation({
    mutationFn: (id: string) => readFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-notifications-full"] }),
  });
  const dismissMut = useMutation({
    mutationFn: (id: string) => dismissFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-notifications-full"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Notifications</h2>
          <p className="text-xs text-muted-foreground">{q.data?.unreadCount ?? 0} unread</p>
        </div>
        <div className="flex gap-2">
          <Button variant={onlyUnread ? "default" : "outline"} size="sm" onClick={() => setOnlyUnread((v) => !v)}>
            {onlyUnread ? "Show all" : "Unread only"}
          </Button>
        </div>
      </div>

      <GlassCard className="divide-y divide-border/40 p-0">
        {q.isLoading ? (
          <div className="p-6 text-center text-xs text-muted-foreground">Loading…</div>
        ) : !q.data?.rows.length ? (
          <div className="p-6 text-center text-xs text-muted-foreground">Nothing here.</div>
        ) : (
          q.data.rows.map((n: any) => (
            <div key={n.id} className="flex items-start gap-3 p-3">
              <Bell className={cn("mt-0.5 h-4 w-4 shrink-0", n.severity === "critical" ? "text-danger" : "text-primary")} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{n.title}</span>
                  <StatusPill value={n.severity} />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-widest">{n.source}</span>
                </div>
                {n.message ? <p className="mt-0.5 text-xs text-muted-foreground">{n.message}</p> : null}
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                </div>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => readMut.mutate(n.id)}>
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => dismissMut.mutate(n.id)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))
        )}
      </GlassCard>
    </div>
  );
}

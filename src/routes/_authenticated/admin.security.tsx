import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { listSecurityEvents } from "@/lib/admin/console.functions";
import { GlassCard } from "@/components/ui/glass-card";
import { StatusPill } from "@/components/admin/StatusPill";
import { ShieldAlert } from "lucide-react";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/admin/security")({
  component: AdminSecurity,
});

function AdminSecurity() {
  const [severity, setSeverity] = useState("");
  const [term, setTerm] = useState("");
  const fn = useServerFn(listSecurityEvents);

  const q = useQuery({
    queryKey: ["admin-security", severity, term],
    queryFn: () => fn({ data: { severity: severity || undefined, term: term || undefined, limit: 200 } }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Security centre</h2>
          <p className="text-xs text-muted-foreground">Auth events, suspicious activity, and audit signals.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Search…" value={term} onChange={(e) => setTerm(e.target.value)} className="h-8 w-56 text-xs" />
        <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="h-8 rounded-md border border-border/60 bg-surface px-2 text-xs">
          <option value="">All severities</option>
          {["info", "warning", "high", "critical"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <GlassCard className="divide-y divide-border/40 p-0">
        {q.isLoading ? (
          <div className="p-6 text-center text-xs text-muted-foreground">Loading…</div>
        ) : !q.data?.length ? (
          <div className="p-6 text-center text-xs text-muted-foreground">No events recorded.</div>
        ) : (
          q.data.map((e: any) => (
            <div key={e.id} className="flex items-start gap-3 p-3">
              <ShieldAlert className="mt-0.5 h-4 w-4 text-danger shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{e.event_type}</span>
                  <StatusPill value={e.severity} />
                </div>
                {e.message ? <p className="mt-0.5 text-xs text-muted-foreground">{e.message}</p> : null}
                <div className="mt-1 flex gap-3 text-[10px] text-muted-foreground">
                  <span>{formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}</span>
                  {e.ip_address ? <span>IP {e.ip_address}</span> : null}
                  {e.user_id ? <span>User {String(e.user_id).slice(0, 8)}</span> : null}
                </div>
              </div>
            </div>
          ))
        )}
      </GlassCard>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { listSupportInbox, updateSupportItem } from "@/lib/admin/console.functions";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/admin/StatusPill";
import { cn } from "@/lib/utils";

type Kind = "tickets" | "bugs" | "features" | "contact" | "feedback";
const TABS: { kind: Kind; label: string }[] = [
  { kind: "tickets", label: "Tickets" },
  { kind: "bugs", label: "Bugs" },
  { kind: "features", label: "Feature requests" },
  { kind: "contact", label: "Contact" },
  { kind: "feedback", label: "Feedback" },
];

export const Route = createFileRoute("/_authenticated/admin/support")({
  component: AdminSupport,
});

function AdminSupport() {
  const qc = useQueryClient();
  const [kind, setKind] = useState<Kind>("tickets");
  const [status, setStatus] = useState<string>("");
  const [search, setSearch] = useState("");
  const listFn = useServerFn(listSupportInbox);
  const updateFn = useServerFn(updateSupportItem);

  const q = useQuery({
    queryKey: ["support-inbox", kind, status, search],
    queryFn: () =>
      listFn({ data: { type: kind, status: status || undefined, search: search || undefined, limit: 100 } }),
  });

  const mut = useMutation({
    mutationFn: (payload: { id: string; patch: Record<string, unknown> }) =>
      updateFn({ data: { type: kind, id: payload.id, patch: payload.patch } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["support-inbox"] }),
  });

  const rows: any[] = (q.data as any)?.[kind] ?? [];
  const statusOptions =
    kind === "tickets"
      ? ["open", "in_progress", "resolved", "closed"]
      : kind === "bugs"
        ? ["new", "triaged", "in_progress", "resolved", "closed", "duplicate"]
        : kind === "features"
          ? ["new", "considering", "planned", "shipped", "declined"]
          : ["new", "responded", "closed", "spam"];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Support centre</h2>
          <p className="text-xs text-muted-foreground">Unified inbox across all user report channels.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.kind}
            onClick={() => {
              setKind(t.kind);
              setStatus("");
            }}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition",
              kind === t.kind
                ? "border-primary bg-primary/10 text-primary"
                : "border-border/60 text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 w-56 text-xs" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-8 rounded-md border border-border/60 bg-surface px-2 text-xs">
          <option value="">All statuses</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <GlassCard className="divide-y divide-border/40 p-0">
        {q.isLoading ? (
          <div className="p-6 text-center text-xs text-muted-foreground">Loading…</div>
        ) : !rows.length ? (
          <div className="p-6 text-center text-xs text-muted-foreground">Inbox empty.</div>
        ) : (
          rows.map((row: any) => {
            const title = row.subject || row.title || row.feedback?.slice(0, 60) || "(no title)";
            return (
              <div key={row.id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{title}</span>
                      {row.status ? <StatusPill value={row.status} /> : null}
                      {row.priority || row.severity ? (
                        <StatusPill value={row.priority || row.severity} />
                      ) : null}
                    </div>
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <select
                      value={row.status ?? ""}
                      onChange={(e) => mut.mutate({ id: row.id, patch: { status: e.target.value } })}
                      className="h-7 rounded-md border border-border/60 bg-surface px-2 text-[11px]"
                    >
                      {statusOptions.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => mut.mutate({ id: row.id, patch: { status: kind === "tickets" ? "resolved" : "closed" } })}
                    >
                      Close
                    </Button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </GlassCard>
    </div>
  );
}

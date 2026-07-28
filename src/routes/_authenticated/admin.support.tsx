import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  listSupportInbox,
  updateSupportItem,
} from "@/lib/admin/console.functions";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/admin/StatusPill";
import { cn } from "@/lib/utils";

type Kind = "ticket" | "bug" | "feature" | "contact" | "feedback";

const TABS: { kind: Kind; label: string }[] = [
  { kind: "ticket", label: "Tickets" },
  { kind: "bug", label: "Bugs" },
  { kind: "feature", label: "Feature requests" },
  { kind: "contact", label: "Contact" },
  { kind: "feedback", label: "Feedback" },
];

export const Route = createFileRoute("/_authenticated/admin/support")({
  component: AdminSupport,
});

function AdminSupport() {
  const qc = useQueryClient();
  const [kind, setKind] = useState<Kind>("ticket");
  const [status, setStatus] = useState<string>("");
  const [term, setTerm] = useState("");
  const listFn = useServerFn(listSupportInbox);
  const updateFn = useServerFn(updateSupportItem);

  const q = useQuery({
    queryKey: ["support-inbox", kind, status, term],
    queryFn: () => listFn({ data: { type: kind, status: status || undefined, term: term || undefined, limit: 100 } }),
  });

  const mut = useMutation({
    mutationFn: (data: { id: string; patch: Record<string, unknown> }) =>
      updateFn({ data: { type: kind, id: data.id, patch: data.patch } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["support-inbox"] }),
  });

  const statusOptions =
    kind === "ticket"
      ? ["open", "in_progress", "resolved", "closed"]
      : kind === "bug"
        ? ["new", "triaged", "in_progress", "resolved", "closed", "duplicate"]
        : kind === "feature"
          ? ["new", "considering", "planned", "shipped", "declined"]
          : ["new", "responded", "closed", "spam"];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Support centre</h2>
          <p className="text-xs text-muted-foreground">Unified inbox for user reports and requests.</p>
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
        <Input
          placeholder="Search…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          className="h-8 w-48 text-xs"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-8 rounded-md border border-border/60 bg-surface px-2 text-xs"
        >
          <option value="">All statuses</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <GlassCard className="divide-y divide-border/40 p-0">
        {q.isLoading ? (
          <div className="p-6 text-center text-xs text-muted-foreground">Loading…</div>
        ) : !q.data?.rows.length ? (
          <div className="p-6 text-center text-xs text-muted-foreground">Inbox empty.</div>
        ) : (
          q.data.rows.map((row: any) => {
            const title = row.subject || row.title || row.message?.slice(0, 60) || row.rating_text || "(no title)";
            const body = row.body || row.description || row.message || row.details || "";
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
                    {body ? (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{body}</p>
                    ) : null}
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
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[11px]"
                      onClick={() =>
                        mut.mutate({
                          id: row.id,
                          patch: { status: kind === "ticket" ? "resolved" : "closed", resolved_at: new Date().toISOString() },
                        })
                      }
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

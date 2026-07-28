import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { StatusPill } from "@/components/admin/StatusPill";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KpiCard } from "@/components/admin/KpiCard";
import {
  adminListFeedback,
  adminUpdateFeedback,
  adminFeedbackKpis,
  listFeedbackNotes,
  addFeedbackNote,
  getFeedbackAttachmentUrl,
} from "@/lib/feedback.functions";

export const Route = createFileRoute("/_authenticated/admin/feedback")({
  head: () => ({
    meta: [
      { title: "Feedback — Admin" },
      { name: "description", content: "Triage bug reports and feature requests." },
    ],
  }),
  component: AdminFeedbackPage,
});

const BUG_STATUSES = ["open", "triaged", "in_progress", "testing", "resolved", "closed", "duplicate", "rejected"];
const FEATURE_STATUSES = ["open", "considering", "planned", "in_progress", "shipped", "declined"];
const PRIORITIES = ["low", "normal", "high", "urgent"];

function fmtHours(ms: number) {
  if (!ms) return "—";
  const h = Math.round(ms / (1000 * 60 * 60));
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

function AdminFeedbackPage() {
  const qc = useQueryClient();
  const [source, setSource] = useState<"bugs" | "features">("bugs");
  const [status, setStatus] = useState<string>("");
  const [priority, setPriority] = useState<string>("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any | null>(null);

  const listFn = useServerFn(adminListFeedback);
  const updateFn = useServerFn(adminUpdateFeedback);
  const kpiFn = useServerFn(adminFeedbackKpis);

  const kpiQ = useQuery({ queryKey: ["admin-feedback-kpis"], queryFn: () => kpiFn() });
  const listQ = useQuery({
    queryKey: ["admin-feedback", source, status, priority, search],
    queryFn: () =>
      listFn({
        data: {
          source,
          status: status || undefined,
          priority: priority || undefined,
          search: search || undefined,
          limit: 100,
        },
      }),
  });

  const updateMut = useMutation({
    mutationFn: (v: { id: string; patch: any }) => updateFn({ data: { source, id: v.id, ...v.patch } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-feedback"] });
      qc.invalidateQueries({ queryKey: ["admin-feedback-kpis"] });
      toast.success("Updated");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  const rows: any[] = (listQ.data as any[]) ?? [];
  const kpis: any = kpiQ.data ?? {};
  const statusOptions = source === "bugs" ? BUG_STATUSES : FEATURE_STATUSES;

  return (
    <div className="mx-auto max-w-[1500px] p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Feedback</h1>
        <p className="text-sm text-muted-foreground">Bug reports and feature requests from beta users.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Open bugs" value={String(kpis.open_bugs ?? 0)} />
        <KpiCard label="Resolved (all-time)" value={String(kpis.resolved_bugs ?? 0)} />
        <KpiCard label="Avg. resolution" value={fmtHours(kpis.avg_resolution_ms ?? 0)} />
        <KpiCard
          label="Satisfaction"
          value={kpis.satisfaction_count ? `${kpis.avg_satisfaction}★` : "—"}
          hint={kpis.satisfaction_count ? `${kpis.satisfaction_count} ratings (30d)` : "no ratings yet"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GlassCard className="p-4">
          <h3 className="text-sm font-medium mb-2">Top reported routes (30d)</h3>
          {(kpis.top_routes ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No bug reports in the last 30 days.</p>
          ) : (
            <ul className="text-sm space-y-1">
              {(kpis.top_routes ?? []).map((r: any) => (
                <li key={r.route} className="flex justify-between font-mono text-xs">
                  <span className="truncate">{r.route}</span>
                  <span className="text-muted-foreground">{r.count}</span>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
        <GlassCard className="p-4">
          <h3 className="text-sm font-medium mb-2">Most requested features</h3>
          {(kpis.top_features ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No feature requests yet.</p>
          ) : (
            <ul className="text-sm space-y-1">
              {(kpis.top_features ?? []).map((f: any) => (
                <li key={f.id} className="flex justify-between">
                  <span className="truncate">{f.title}</span>
                  <span className="text-muted-foreground">{f.vote_count} votes</span>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      </div>

      <GlassCard className="p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={source} onValueChange={(v) => { setSource(v as any); setStatus(""); }}>
            <TabsList>
              <TabsTrigger value="bugs">Bugs & messages</TabsTrigger>
              <TabsTrigger value="features">Feature requests</TabsTrigger>
            </TabsList>
          </Tabs>
          <Select value={status || "__all"} onValueChange={(v) => setStatus(v === "__all" ? "" : v)}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All statuses</SelectItem>
              {statusOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={priority || "__all"} onValueChange={(v) => setPriority(v === "__all" ? "" : v)}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All priorities</SelectItem>
              {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input
            className="max-w-xs"
            placeholder="Search title, description, or reference"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="rounded border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="p-2 font-medium">Ref</th>
                <th className="p-2 font-medium">Title</th>
                <th className="p-2 font-medium">Status</th>
                <th className="p-2 font-medium">Priority</th>
                <th className="p-2 font-medium">Category</th>
                <th className="p-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {listQ.isLoading ? (
                <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">No matches.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t border-border cursor-pointer hover:bg-muted/30"
                    onClick={() => setSelected(r)}
                  >
                    <td className="p-2 font-mono text-xs">{r.reference_code}</td>
                    <td className="p-2 truncate max-w-[420px]">{r.title}</td>
                    <td className="p-2"><StatusPill value={r.status} /></td>
                    <td className="p-2">
                      <Badge variant="outline" className="text-[10px] uppercase">{r.priority}</Badge>
                    </td>
                    <td className="p-2 text-xs">{r.category ?? "—"}</td>
                    <td className="p-2 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <FeedbackDetailDialog
        row={selected}
        source={source}
        onClose={() => setSelected(null)}
        onUpdate={(patch) => selected && updateMut.mutate({ id: selected.id, patch })}
      />
    </div>
  );
}

function FeedbackDetailDialog({
  row,
  source,
  onClose,
  onUpdate,
}: {
  row: any | null;
  source: "bugs" | "features";
  onClose: () => void;
  onUpdate: (patch: any) => void;
}) {
  const isOpen = !!row;
  const notesFn = useServerFn(listFeedbackNotes);
  const addNoteFn = useServerFn(addFeedbackNote);
  const getUrlFn = useServerFn(getFeedbackAttachmentUrl);
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [notes, setNotes] = useState<Array<{ id: string; body: string; created_at: string }>>([]);
  const parentType = source === "bugs" ? "bug" : "feature";

  useMemo(() => {
    if (!row) { setNotes([]); return; }
    void notesFn({ data: { parent_type: parentType, parent_id: row.id } }).then((r) => setNotes(r as any));
  }, [row?.id]);

  if (!row) return null;
  const statuses = source === "bugs" ? BUG_STATUSES : FEATURE_STATUSES;

  const openAttachment = async (path: string) => {
    try {
      const { url } = await getUrlFn({ data: { path } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cannot open attachment");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] p-0 flex flex-col">
        <DialogHeader className="p-5 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <code className="font-mono text-sm text-muted-foreground">{row.reference_code}</code>
            <span>{row.title}</span>
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1">
          <div className="p-5 space-y-5">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Status</label>
                <Select value={row.status} onValueChange={(v) => onUpdate({ status: v, resolve: v === "resolved" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {statuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Priority</label>
                <Select value={row.priority} onValueChange={(v) => onUpdate({ priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Category</label>
                <div className="text-sm mt-2">{row.category ?? "—"}</div>
              </div>
            </div>

            <Section title="Description">
              <p className="whitespace-pre-wrap text-sm">{row.description}</p>
            </Section>

            {source === "bugs" && (
              <>
                {row.expected_behavior && (
                  <Section title="Expected">
                    <p className="whitespace-pre-wrap text-sm">{row.expected_behavior}</p>
                  </Section>
                )}
                {row.actual_behavior && (
                  <Section title="Actual">
                    <p className="whitespace-pre-wrap text-sm">{row.actual_behavior}</p>
                  </Section>
                )}
                {Array.isArray(row.reproduction_steps) && row.reproduction_steps.length > 0 && (
                  <Section title="Steps to reproduce">
                    <ol className="list-decimal ml-5 space-y-1 text-sm">
                      {row.reproduction_steps.map((s: string, i: number) => <li key={i}>{s}</li>)}
                    </ol>
                  </Section>
                )}
              </>
            )}

            {source === "features" && row.why_valuable && (
              <Section title="Why it's valuable">
                <p className="whitespace-pre-wrap text-sm">{row.why_valuable}</p>
              </Section>
            )}

            {Array.isArray(row.attachments) && row.attachments.length > 0 && (
              <Section title="Attachments">
                <ul className="text-sm space-y-1">
                  {row.attachments.map((a: any) => (
                    <li key={a.path}>
                      <button
                        className="text-primary underline text-left"
                        onClick={() => openAttachment(a.path)}
                      >
                        {a.name} <span className="text-muted-foreground">({a.kind})</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {row.metadata && Object.keys(row.metadata).length > 0 && (
              <Section title="Environment">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono">
                  {Object.entries(row.metadata).map(([k, v]) => (
                    <div key={k} className="flex justify-between border-b border-border/50 py-0.5">
                      <span className="text-muted-foreground">{k}</span>
                      <span className="truncate max-w-[240px]">{String(v)}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            <Section title="Internal notes">
              <div className="space-y-2">
                <Textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add an internal note (visible to admins only)"
                />
                <Button
                  size="sm"
                  disabled={!note.trim()}
                  onClick={async () => {
                    try {
                      const created = await addNoteFn({
                        data: { parent_type: parentType, parent_id: row.id, body: note.trim() },
                      });
                      setNotes((prev) => [created as any, ...prev]);
                      setNote("");
                      qc.invalidateQueries({ queryKey: ["admin-feedback"] });
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Failed");
                    }
                  }}
                >
                  Add note
                </Button>
                <ul className="space-y-2 pt-2">
                  {notes.map((n) => (
                    <li key={n.id} className="rounded border border-border p-2 text-sm">
                      <p className="whitespace-pre-wrap">{n.body}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </Section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs uppercase text-muted-foreground mb-1">{title}</h3>
      {children}
    </div>
  );
}

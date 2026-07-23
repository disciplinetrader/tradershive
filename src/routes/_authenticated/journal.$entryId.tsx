import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowDownRight,
  ArrowUpRight,
  Camera,
  Check,
  Clock,
  ExternalLink,
  Gauge,
  Pencil,
  Sparkles,
  Target,
  Tag as TagIcon,
  Trash2,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  deleteEntry,
  fetchAttachments,
  fetchEntry,
  fetchTags,
  fetchAllEntryTagLinks,
  journalKeys,
  updateEntry,
  type EntryUpdate,
  type JournalEntry,
} from "@/lib/journal/api";
import { batchSignUrls, JOURNAL_IMAGES_BUCKET } from "@/lib/journal/storage";
import {
  formatCurrency,
  formatDate,
  formatDuration,
  formatNumber,
  pnlTone,
  shortId,
  tradeResult,
} from "@/lib/journal/format";
import {
  DEFAULT_SETUPS,
  GRADE_COLOR,
  SESSION_OPTIONS,
} from "@/lib/journal/constants";
import { cn } from "@/lib/utils";
import { routeBoundaries } from "@/lib/route-boundaries";

export const Route = createFileRoute("/_authenticated/journal/$entryId")({
  head: () => ({
    meta: [
      { title: "Journal Entry — TradersHIVE Arena" },
      { name: "description", content: "Full record of a single trade: execution, risk, psychology, and lessons." },
    ],
  }),
  component: JournalEntryPage,
  ...routeBoundaries({
    label: "Journal entry",
    boundary: "journal_entry_route",
    backHref: "/journal",
    backLabel: "Back to Journal",
  }),
});

const TRADE_TYPE_OPTIONS = [
  { value: "intraday", label: "Intraday" },
  { value: "swing", label: "Swing" },
  { value: "long_term", label: "Long term" },
];

type Draft = {
  session: string;
  setup: string;
  strategy: string;
  trade_type: string;
  entry_reason_text: string;
  notes_text: string;
};

function toDraft(e: JournalEntry): Draft {
  return {
    session: e.session ?? "",
    setup: e.setup ?? "",
    strategy: e.strategy ?? "",
    trade_type: ((e as unknown as { trade_type?: string | null }).trade_type ?? "") as string,
    entry_reason_text: e.entry_reason_text ?? "",
    notes_text: e.notes_text ?? "",
  };
}

function draftsEqual(a: Draft, b: Draft) {
  return (
    a.session === b.session &&
    a.setup === b.setup &&
    a.strategy === b.strategy &&
    a.trade_type === b.trade_type &&
    a.entry_reason_text === b.entry_reason_text &&
    a.notes_text === b.notes_text
  );
}

function JournalEntryPage() {
  const { entryId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => deleteEntry(entryId),
    onSuccess: () => {
      toast.success("Journal entry deleted");
      qc.invalidateQueries({ queryKey: journalKeys.list() });
      navigate({ to: "/journal" });
    },
    onError: (err) => toast.error((err as Error)?.message ?? "Delete failed"),
  });

  const entryQuery = useQuery({
    queryKey: journalKeys.entry(entryId),
    queryFn: () => fetchEntry(entryId),
  });
  const tagsQuery = useQuery({ queryKey: journalKeys.tags(), queryFn: fetchTags });
  const linksQuery = useQuery({
    queryKey: ["journal", "entryTagLinks"],
    queryFn: fetchAllEntryTagLinks,
  });
  const attachmentsQuery = useQuery({
    queryKey: ["journal", "attachments", entryId],
    queryFn: () => fetchAttachments(entryId),
    enabled: !!entryId,
  });

  const entry = entryQuery.data ?? null;
  const original = useMemo(() => (entry ? toDraft(entry) : null), [entry]);
  const dirty = !!(mode === "edit" && draft && original && !draftsEqual(draft, original));

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error("Nothing to save");
      const patch: EntryUpdate = {
        session: (draft.session || null) as EntryUpdate["session"],
        setup: (draft.setup || null) as EntryUpdate["setup"],
        strategy: draft.strategy.trim() || null,
        entry_reason_text: draft.entry_reason_text.trim() || null,
        notes_text: draft.notes_text.trim() || null,
        // trade_type is a project-added column; cast to satisfy generated types
        ...((draft.trade_type
          ? { trade_type: draft.trade_type }
          : { trade_type: null }) as unknown as EntryUpdate),
      };
      return updateEntry(entryId, patch);
    },
    onSuccess: () => {
      toast.success("Journal updated");
      qc.invalidateQueries({ queryKey: journalKeys.entry(entryId) });
      qc.invalidateQueries({ queryKey: journalKeys.list() });
      setMode("view");
    },
    onError: (err) => toast.error((err as Error)?.message ?? "Save failed"),
  });

  // Warn on browser unload with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const enterEdit = () => {
    if (!entry) return;
    setDraft(toDraft(entry));
    setMode("edit");
  };
  const requestCancel = () => {
    if (dirty) setDiscardOpen(true);
    else {
      setMode("view");
      setDraft(null);
    }
  };
  const discardChanges = () => {
    setDiscardOpen(false);
    setMode("view");
    setDraft(entry ? toDraft(entry) : null);
  };

  const entryTags = useMemo(() => {
    if (!entry) return [];
    const ids = new Set(
      (linksQuery.data ?? []).filter((l) => l.entry_id === entry.id).map((l) => l.tag_id),
    );
    return (tagsQuery.data ?? []).filter((t) => ids.has(t.id));
  }, [entry, linksQuery.data, tagsQuery.data]);

  const screenshotPaths = useMemo(() => entry?.screenshots ?? [], [entry]);
  const shotUrls = useQuery({
    queryKey: ["journal", "entry-shots", entryId, screenshotPaths.length],
    queryFn: () => batchSignUrls(JOURNAL_IMAGES_BUCKET, screenshotPaths),
    enabled: screenshotPaths.length > 0,
  });

  if (entryQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-14 w-full rounded-2xl" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 rounded-3xl lg:col-span-2" />
          <Skeleton className="h-64 rounded-3xl" />
        </div>
      </div>
    );
  }

  if (!entry) {
    return (
      <GlassCard className="p-8 text-center">
        <p className="text-sm text-muted-foreground">Entry not found.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/journal"><ArrowLeft className="mr-1.5 h-4 w-4" /> Back to Journal</Link>
        </Button>
      </GlassCard>
    );
  }

  const editing = mode === "edit" && draft;
  const tone = pnlTone(entry.pnl);
  const result = tradeResult(entry.pnl);
  const sessionLabel = SESSION_OPTIONS.find((s) => s.value === entry.session)?.label ?? entry.session ?? "—";
  const setupLabel = entry.setup ? (DEFAULT_SETUPS.find((s) => s.value === entry.setup)?.label ?? entry.setup.replace(/_/g, " ")) : "—";
  const tradeTypeRaw = (entry as unknown as { trade_type?: string | null }).trade_type ?? null;
  const tradeTypeLabel = tradeTypeRaw
    ? (TRADE_TYPE_OPTIONS.find((t) => t.value === tradeTypeRaw)?.label ?? String(tradeTypeRaw).replace(/_/g, " "))
    : "—";

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${entry.symbol ?? "Untitled"}${entry.is_favorite ? " ★" : ""}`}
        description={`${entry.market ?? ""} · #${shortId(entry.id)} · ${formatDate(entry.closed_at ?? entry.created_at)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (editing && dirty) setDiscardOpen(true);
                else navigate({ to: "/journal" });
              }}
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
            </Button>
            {editing ? (
              <>
                <Button variant="outline" size="sm" onClick={requestCancel} disabled={saveMutation.isPending}>
                  <X className="mr-1.5 h-4 w-4" /> Cancel
                </Button>
                <Button
                  size="sm"
                  className="gradient-primary text-primary-foreground"
                  disabled={!dirty || saveMutation.isPending}
                  onClick={() => saveMutation.mutate()}
                >
                  <Check className="mr-1.5 h-4 w-4" />
                  {saveMutation.isPending ? "Saving…" : "Save changes"}
                </Button>
              </>
            ) : (
              <Button size="sm" className="gradient-primary text-primary-foreground" onClick={enterEdit}>
                <Pencil className="mr-1.5 h-4 w-4" /> Edit journal
              </Button>
            )}
          </div>
        }
      />

      {editing ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary">
          Editing — changes save only when you click <span className="font-semibold">Save changes</span>.
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-4 lg:col-span-2">
          <GlassCard className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {entry.direction === "long" ? (
                    <span className="inline-flex items-center gap-1 text-success"><ArrowUpRight className="h-3.5 w-3.5" /> LONG</span>
                  ) : entry.direction === "short" ? (
                    <span className="inline-flex items-center gap-1 text-danger"><ArrowDownRight className="h-3.5 w-3.5" /> SHORT</span>
                  ) : null}
                  {entry.grade ? (
                    <Badge className={cn("border font-semibold", GRADE_COLOR[entry.grade])}>{entry.grade}</Badge>
                  ) : null}
                  <ResultBadge result={result} />
                </div>
                <p
                  className={cn(
                    "mt-2 text-3xl font-bold tabular-nums",
                    tone === "up" && "text-success",
                    tone === "down" && "text-danger",
                    tone === "flat" && "text-muted-foreground",
                  )}
                >
                  {entry.pnl != null ? formatCurrency(Number(entry.pnl)) : "—"}
                </p>
                {entry.rr != null ? (
                  <p className="text-xs text-muted-foreground">{formatNumber(Number(entry.rr), 2)}R realised</p>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Metric label="Entry" value={entry.entry_price != null ? formatNumber(Number(entry.entry_price), 5) : "—"} />
                <Metric label="Exit" value={entry.exit_price != null ? formatNumber(Number(entry.exit_price), 5) : "—"} />
                <Metric label="Stop" value={entry.stop_loss != null ? formatNumber(Number(entry.stop_loss), 5) : "—"} />
                <Metric label="Target" value={entry.take_profit != null ? formatNumber(Number(entry.take_profit), 5) : "—"} />
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-5">
            <SectionTitle icon={<Target className="h-4 w-4" />} title="Strategy & setup" />
            {editing ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-setup" className="text-[10px] uppercase tracking-widest text-muted-foreground">Setup</Label>
                  <Select value={draft!.setup || undefined} onValueChange={(v) => setDraft((d) => (d ? { ...d, setup: v } : d))}>
                    <SelectTrigger id="edit-setup"><SelectValue placeholder="Choose setup" /></SelectTrigger>
                    <SelectContent>
                      {DEFAULT_SETUPS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-strategy" className="text-[10px] uppercase tracking-widest text-muted-foreground">Strategy</Label>
                  <Input
                    id="edit-strategy"
                    maxLength={120}
                    value={draft!.strategy}
                    onChange={(e) => setDraft((d) => (d ? { ...d, strategy: e.target.value } : d))}
                    placeholder="e.g. London breakout"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-session" className="text-[10px] uppercase tracking-widest text-muted-foreground">Trading session</Label>
                  <Select value={draft!.session || undefined} onValueChange={(v) => setDraft((d) => (d ? { ...d, session: v } : d))}>
                    <SelectTrigger id="edit-session"><SelectValue placeholder="Choose session" /></SelectTrigger>
                    <SelectContent>
                      {SESSION_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-trade-type" className="text-[10px] uppercase tracking-widest text-muted-foreground">Trade duration</Label>
                  <Select value={draft!.trade_type || undefined} onValueChange={(v) => setDraft((d) => (d ? { ...d, trade_type: v } : d))}>
                    <SelectTrigger id="edit-trade-type"><SelectValue placeholder="Choose duration" /></SelectTrigger>
                    <SelectContent>
                      {TRADE_TYPE_OPTIONS.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <Field label="Setup" value={setupLabel} />
                <Field label="Strategy" value={entry.strategy ?? "—"} />
                <Field label="Session" value={sessionLabel} />
                <Field label="Confidence" value={entry.confidence != null ? `${entry.confidence}%` : "—"} />
                <Field label="Position size" value={entry.lot_size != null ? String(entry.lot_size) : "—"} />
                <Field label="Risk %" value={(entry as any).risk_pct != null ? `${formatNumber(Number((entry as any).risk_pct), 2)}%` : "—"} />
                <Field label="Trade duration" value={tradeTypeLabel} />
                <Field label="Hold time" value={formatDuration(entry.duration_seconds)} />
              </div>
            )}
            {!editing && entryTags.length ? (
              <>
                <Separator className="my-4" />
                <div className="flex flex-wrap items-center gap-1.5">
                  <TagIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  {entryTags.map((t) => (
                    <span
                      key={t.id}
                      className="rounded-full border px-2 py-0.5 text-[11px]"
                      style={{ borderColor: `${t.color}55`, color: t.color }}
                    >
                      {t.name}
                    </span>
                  ))}
                </div>
              </>
            ) : null}
          </GlassCard>

          <GlassCard className="p-5">
            <SectionTitle icon={<Sparkles className="h-4 w-4" />} title="Entry reason" />
            {editing ? (
              <Textarea
                rows={4}
                maxLength={4000}
                value={draft!.entry_reason_text}
                onChange={(e) => setDraft((d) => (d ? { ...d, entry_reason_text: e.target.value } : d))}
                placeholder="Why did you take this trade?"
              />
            ) : (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {entry.entry_reason_text?.trim() || "No entry reason recorded."}
              </p>
            )}
          </GlassCard>

          <GlassCard className="p-5">
            <SectionTitle icon={<Sparkles className="h-4 w-4" />} title="Trade review" />
            {editing ? (
              <Textarea
                rows={6}
                maxLength={8000}
                value={draft!.notes_text}
                onChange={(e) => setDraft((d) => (d ? { ...d, notes_text: e.target.value } : d))}
                placeholder="Lessons, execution notes, follow-ups…"
              />
            ) : (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {entry.notes_text?.trim() || "No notes captured."}
              </p>
            )}
          </GlassCard>

          {screenshotPaths.length ? (
            <GlassCard className="p-5">
              <SectionTitle icon={<Camera className="h-4 w-4" />} title={`Screenshots (${screenshotPaths.length})`} />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {screenshotPaths.map((p) => {
                  const url = shotUrls.data?.[p];
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => url && setLightbox(url)}
                      className="group relative block aspect-video overflow-hidden rounded-lg border border-border/60 bg-surface-2/30 cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {url ? (
                        <img src={url} alt="Screenshot" loading="lazy" decoding="async" className="h-full w-full object-cover transition group-hover:scale-105" />
                      ) : (
                        <div className="grid h-full w-full place-items-center text-[10px] text-muted-foreground">Loading…</div>
                      )}
                    </button>
                  );
                })}
              </div>
              {editing ? (
                <p className="mt-3 text-[11px] text-muted-foreground">
                  Manage screenshots from the full editor in the Journal list.
                </p>
              ) : null}
            </GlassCard>
          ) : null}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          <GlassCard className="p-5">
            <SectionTitle icon={<Clock className="h-4 w-4" />} title="Timeline" />
            <div className="space-y-2 text-sm">
              <TimelineRow label="Opened" value={entry.opened_at ? formatDate(entry.opened_at) : "—"} />
              <TimelineRow label="Closed" value={entry.closed_at ? formatDate(entry.closed_at) : "—"} />
              <TimelineRow label="Created" value={formatDate(entry.created_at)} />
              <TimelineRow label="Updated" value={formatDate(entry.updated_at)} />
            </div>
          </GlassCard>

          <GlassCard className="p-5">
            <SectionTitle icon={<Gauge className="h-4 w-4" />} title="Psychology" />
            <Field label="Emotions" value={(entry.emotions ?? []).join(", ") || "—"} multiline />
            <div className="mt-3" />
            <Field label="Mistakes" value={(entry.mistakes ?? []).join(", ") || "—"} multiline />
          </GlassCard>

          {attachmentsQuery.data?.length ? (
            <GlassCard className="p-5">
              <SectionTitle icon={<Camera className="h-4 w-4" />} title={`Attachments (${attachmentsQuery.data.length})`} />
              <ul className="space-y-1 text-xs text-muted-foreground">
                {attachmentsQuery.data.map((a) => (
                  <li key={a.id} className="truncate">{a.name ?? a.path}</li>
                ))}
              </ul>
            </GlassCard>
          ) : null}

          {!editing ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-danger hover:text-danger"
              disabled={deleteMutation.isPending}
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 className="mr-1.5 h-4 w-4" /> {deleteMutation.isPending ? "Deleting…" : "Delete entry"}
            </Button>
          ) : null}
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Journal Entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The linked trade record is preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                deleteMutation.mutate();
              }}
              className="bg-danger text-danger-foreground hover:bg-danger/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>You have unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>Do you want to discard them?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={discardChanges}
              className="bg-danger text-danger-foreground hover:bg-danger/90"
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-5xl border-border/60 bg-background/95 p-3">
          <div className="flex items-center justify-between pb-2">
            <p className="text-sm font-semibold">{entry.symbol ?? "Trade"} · Chart preview</p>
            {lightbox ? (
              <a
                href={lightbox}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Open in new tab
              </a>
            ) : null}
          </div>
          {lightbox ? (
            <img src={lightbox} alt="Screenshot" className="max-h-[80vh] w-full rounded-lg object-contain" />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
      <span className="grid h-6 w-6 place-items-center rounded-md bg-primary/10 text-primary">{icon}</span>
      {title}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-surface-2/40 px-3 py-2">
      <p className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate font-mono text-sm tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function Field({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-sm text-foreground", multiline && "whitespace-pre-wrap")}>{value}</p>
    </div>
  );
}

function TimelineRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-1.5 last:border-0 last:pb-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium text-foreground">{value}</span>
    </div>
  );
}

function ResultBadge({ result }: { result: ReturnType<typeof tradeResult> }) {
  if (result === "win") return <Badge className="border border-success/30 bg-success/10 text-success">Win</Badge>;
  if (result === "loss") return <Badge className="border border-danger/30 bg-danger/10 text-danger">Loss</Badge>;
  return <Badge className="border border-border bg-muted/40 text-muted-foreground">Break-even</Badge>;
}

// Ensure JournalEntry type import isn't tree-shaken away in odd bundling
export type _EntryType = JournalEntry;

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Camera,
  Check,
  Copy,
  Download,
  FileText,
  Globe,
  History as HistoryIcon,
  Image as ImageIcon,
  Loader2,
  Lock,
  Maximize2,
  Paperclip,
  Play,
  Plus,
  Sparkles,
  Star,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { ShareToCommunityButton } from "@/components/sharing/ShareToCommunityButton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { NotesEditor } from "./NotesEditor";
import {
  deleteAttachmentRecord,
  disableShare,
  enableShare,
  fetchAttachments,
  fetchHistory,
  journalKeys,
  recordAttachment,
  recordHistory,
  setEntryTags,
  updateEntry,
  upsertTag,
  upsertTaxonomy,
  type ChecklistItem,
  type JournalAttachment,
  type JournalEntry,
  type JournalTag,
  type JournalTaxonomy,
} from "@/lib/journal/api";
import {
  batchSignUrls,
  getSignedUrl,
  removeJournalObject,
  uploadJournalFile,
  uploadJournalImage,
  JOURNAL_IMAGES_BUCKET,
} from "@/lib/journal/storage";
import {
  DEFAULT_CHECKLIST,
  DEFAULT_EMOTIONS,
  DEFAULT_MISTAKES,
  DEFAULT_SETUPS,
  GRADE_OPTIONS,
  GRADE_COLOR,
  JOURNAL_FEATURES,
  MARKET_OPTIONS,
  SESSION_OPTIONS,
} from "@/lib/journal/constants";
import {
  formatCurrency,
  formatDateTime,
  formatDuration,
  formatNumber,
  shortId,
} from "@/lib/journal/format";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

type SessionEnum = Database["public"]["Enums"]["journal_session"];
type GradeEnum = Database["public"]["Enums"]["journal_grade"];

export function JournalDrawer({
  entry,
  open,
  onOpenChange,
  allTags,
  entryTagIds,
  taxonomy,
}: {
  entry: JournalEntry | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  allTags: JournalTag[];
  entryTagIds: string[];
  taxonomy: JournalTaxonomy[];
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [tab, setTab] = useState("overview");
  const [copiedShare, setCopiedShare] = useState(false);

  useEffect(() => { setTab("overview"); }, [entry?.id]);

  const updateMutation = useMutation({
    mutationFn: async (patch: Partial<JournalEntry>) => {
      if (!entry) throw new Error("No entry");
      const next = await updateEntry(entry.id, patch as never);
      if (user) await recordHistory({ entryId: entry.id, userId: user.id, action: "updated", snapshot: patch as never });
      return next;
    },
    onSuccess: (next) => {
      qc.setQueryData<JournalEntry[]>(journalKeys.list(), (prev) =>
        prev ? prev.map((e) => (e.id === next.id ? next : e)) : prev,
      );
      qc.invalidateQueries({ queryKey: journalKeys.history(next.id) });
    },
    onError: (err: unknown) => toast.error((err as Error).message || "Save failed"),
  });

  // Signed screenshot urls (kept keyed by storage path)
  const { data: screenshotUrls } = useQuery({
    queryKey: ["journal-screens", entry?.id, entry?.screenshots?.length],
    queryFn: async () => {
      if (!entry || !entry.screenshots?.length) return {};
      return batchSignUrls(JOURNAL_IMAGES_BUCKET, entry.screenshots);
    },
    enabled: !!entry,
  });

  if (!entry) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full max-w-3xl overflow-hidden p-0 sm:max-w-3xl"
      >
        <SheetHeader className="border-b border-border/60 px-6 pb-4 pt-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <SheetTitle className="truncate text-lg">
                  {entry.symbol ?? "Untitled trade"} · <span className="font-mono text-sm text-muted-foreground">#{shortId(entry.id)}</span>
                </SheetTitle>
                {entry.grade ? (
                  <Badge className={cn("border font-semibold", GRADE_COLOR[entry.grade])}>{entry.grade}</Badge>
                ) : null}
                <Badge variant="outline" className="capitalize">{entry.status}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatDateTime(entry.closed_at ?? entry.created_at)}
                {entry.duration_seconds ? ` · ${formatDuration(entry.duration_seconds)}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <p
                className={cn(
                  "text-right font-mono text-lg font-bold tabular-nums",
                  Number(entry.pnl ?? 0) > 0 && "text-success",
                  Number(entry.pnl ?? 0) < 0 && "text-danger",
                )}
              >
                {entry.pnl != null ? formatCurrency(Number(entry.pnl)) : "—"}
              </p>
              <Button
                size="icon"
                variant="ghost"
                className="h-9 w-9"
                aria-label="Toggle favorite"
                onClick={() => updateMutation.mutate({ is_favorite: !entry.is_favorite })}
              >
                <Star className={cn("h-4 w-4", entry.is_favorite && "fill-warning text-warning")} />
              </Button>
              <Select
                value={entry.status}
                onValueChange={(v) =>
                  updateMutation.mutate({ status: v as Database["public"]["Enums"]["journal_status"] })
                }
              >
                <SelectTrigger className="h-9 w-full sm:w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
              <ShareToCommunityButton sourceType="journal" sourceId={entry.id} iconOnly variant="ghost" size="sm" />
            </div>
          </div>
        </SheetHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex h-[calc(100vh-108px)] flex-col">
          <TabsList className="mx-6 mt-3 flex w-fit flex-wrap gap-1 bg-transparent p-0">
            {[
              { v: "overview", l: "Overview" },
              { v: "info", l: "Info" },
              { v: "notes", l: "Notes" },
              { v: "psychology", l: "Psychology" },
              { v: "media", l: "Media" },
              { v: "history", l: "History" },
              { v: "ai", l: "AI Coach" },
            ].map((t) => (
              <TabsTrigger key={t.v} value={t.v} className="rounded-full data-[state=active]:bg-primary/15 data-[state=active]:text-primary">
                {t.l}
              </TabsTrigger>
            ))}
          </TabsList>

          <ScrollArea className="mt-3 flex-1 px-6 pb-24">
            <TabsContent value="overview" className="space-y-4">
              <OverviewSection
                entry={entry}
                screenshotUrls={screenshotUrls ?? {}}
                allTags={allTags}
                entryTagIds={entryTagIds}
                onShareToggle={async () => {
                  try {
                    if (entry.is_public) {
                      await disableShare(entry.id);
                      updateMutation.reset();
                      qc.setQueryData<JournalEntry[]>(journalKeys.list(), (prev) =>
                        prev ? prev.map((e) => (e.id === entry.id ? { ...e, is_public: false, share_token: null } : e)) : prev,
                      );
                      toast.success("Share link disabled");
                    } else {
                      const { token } = await enableShare(entry.id);
                      qc.setQueryData<JournalEntry[]>(journalKeys.list(), (prev) =>
                        prev ? prev.map((e) => (e.id === entry.id ? { ...e, is_public: true, share_token: token } : e)) : prev,
                      );
                      const url = `${window.location.origin}/journal/share/${token}`;
                      await navigator.clipboard.writeText(url).catch(() => {});
                      setCopiedShare(true);
                      setTimeout(() => setCopiedShare(false), 1500);
                      toast.success("Public link copied to clipboard");
                    }
                  } catch (err) {
                    toast.error((err as Error).message);
                  }
                }}
                copied={copiedShare}
              />
            </TabsContent>

            <TabsContent value="info" className="space-y-4">
              <InfoSection entry={entry} onChange={(patch) => updateMutation.mutate(patch)} />
            </TabsContent>

            <TabsContent value="notes" className="space-y-3">
              <NotesEditor
                initialHtml={entry.notes_html}
                onSave={async ({ html, text, words }) => {
                  await updateMutation.mutateAsync({
                    notes_html: html,
                    notes_text: text,
                    word_count: words,
                  });
                }}
              />
            </TabsContent>

            <TabsContent value="psychology" className="space-y-4">
              <PsychologySection
                entry={entry}
                taxonomy={taxonomy}
                onChange={(patch) => updateMutation.mutate(patch)}
                onCreateTaxonomy={async (kind, label) => {
                  if (!user) return;
                  await upsertTaxonomy({ userId: user.id, kind, label });
                  qc.invalidateQueries({ queryKey: journalKeys.taxonomy() });
                }}
              />
            </TabsContent>

            <TabsContent value="media" className="space-y-4">
              <MediaSection
                entry={entry}
                screenshotUrls={screenshotUrls ?? {}}
                onChange={(patch) => updateMutation.mutate(patch)}
                onScreenshotsChange={(next) =>
                  updateMutation.mutate({ screenshots: next })
                }
              />
              <AttachmentsSection entry={entry} />
            </TabsContent>

            <TabsContent value="history" className="space-y-3">
              <HistorySection entry={entry} />
            </TabsContent>

            <TabsContent value="ai" className="space-y-3">
              <AISection />
            </TabsContent>
          </ScrollArea>

          <div className="flex items-center justify-between border-t border-border/60 bg-background/80 px-6 py-3 backdrop-blur">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TagPicker
                allTags={allTags}
                entryTagIds={entryTagIds}
                onCommit={async (next) => {
                  if (!user) return;
                  await setEntryTags(entry.id, user.id, next);
                  qc.invalidateQueries({ queryKey: journalKeys.entryTags(entry.id) });
                  qc.invalidateQueries({ queryKey: ["journal", "entryTagLinks"] });
                }}
                onCreate={async (name) => {
                  if (!user) return null;
                  const tag = await upsertTag({ userId: user.id, name });
                  qc.invalidateQueries({ queryKey: journalKeys.tags() });
                  return tag;
                }}
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

/* -------------------- Sections -------------------- */

function OverviewSection({
  entry,
  screenshotUrls,
  allTags,
  entryTagIds,
  onShareToggle,
  copied,
}: {
  entry: JournalEntry;
  screenshotUrls: Record<string, string>;
  allTags: JournalTag[];
  entryTagIds: string[];
  onShareToggle: () => Promise<void>;
  copied: boolean;
}) {
  const primary = entry.screenshots?.[0] ? screenshotUrls[entry.screenshots[0]] : null;
  const tagList = allTags.filter((t) => entryTagIds.includes(t.id));
  const shareUrl = entry.share_token ? `${typeof window !== "undefined" ? window.location.origin : ""}/journal/share/${entry.share_token}` : "";
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Direction" value={entry.direction ? entry.direction.toUpperCase() : "—"} />
        <Metric label="RR" value={entry.rr != null ? `${formatNumber(Number(entry.rr), 2)}R` : "—"} />
        <Metric label="Risk %" value={entry.risk_pct != null ? `${formatNumber(Number(entry.risk_pct), 2)}%` : "—"} />
        <Metric label="Setup" value={entry.setup ? entry.setup.replace(/_/g, " ") : "—"} />
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-muted/20">
        {primary ? (
          <img src={primary} alt={entry.symbol ?? "Trade"} loading="lazy" decoding="async" className="max-h-[420px] w-full object-contain" />
        ) : (
          <div className="grid h-56 w-full place-items-center text-sm text-muted-foreground">
            <div className="flex flex-col items-center gap-2">
              <Camera className="h-5 w-5" />
              No primary screenshot
            </div>
          </div>
        )}
      </div>

      {tagList.length ? (
        <div className="flex flex-wrap gap-1.5">
          {tagList.map((t) => (
            <span
              key={t.id}
              className="rounded-full border px-2 py-0.5 text-[11px]"
              style={{ borderColor: `${t.color}55`, color: t.color }}
            >
              {t.name}
            </span>
          ))}
        </div>
      ) : null}

      {entry.notes_text ? (
        <div className="rounded-2xl border border-border/60 bg-surface/30 p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Notes preview</p>
          <p className="mt-2 line-clamp-6 text-sm text-foreground/90">{entry.notes_text}</p>
        </div>
      ) : null}

      <div className="rounded-2xl border border-border/60 bg-surface/30 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Public share</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Sensitive account information (account name, balance) is hidden from shared views.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {entry.is_public ? (
              <Badge className="border border-success/40 bg-success/10 text-success">
                <Globe className="mr-1 h-3 w-3" /> Public
              </Badge>
            ) : (
              <Badge variant="outline"><Lock className="mr-1 h-3 w-3" /> Private</Badge>
            )}
            <Button size="sm" onClick={onShareToggle}>
              {entry.is_public ? "Disable link" : "Create link"}
            </Button>
          </div>
        </div>
        {entry.is_public && shareUrl ? (
          <div className="mt-3 flex items-center gap-2">
            <Input readOnly value={shareUrl} className="font-mono text-xs" />
            <Button
              size="icon"
              variant="outline"
              className="h-9 w-9 shrink-0"
              aria-label="Copy link"
              onClick={() => navigator.clipboard.writeText(shareUrl)}
            >
              {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function InfoSection({ entry, onChange }: { entry: JournalEntry; onChange: (patch: Partial<JournalEntry>) => void }) {
  const [local, setLocal] = useState(entry);
  useEffect(() => setLocal(entry), [entry.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (patch: Partial<JournalEntry>) => {
    setLocal((p) => ({ ...p, ...patch } as JournalEntry));
    onChange(patch);
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Market">
        <Select value={local.market ?? undefined} onValueChange={(v) => commit({ market: v })}>
          <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
          <SelectContent>
            {MARKET_OPTIONS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Pair">
        <Input value={local.symbol ?? ""} onChange={(e) => setLocal((p) => ({ ...p, symbol: e.target.value }))} onBlur={() => commit({ symbol: local.symbol })} />
      </Field>
      <Field label="Direction">
        <Select value={local.direction ?? undefined} onValueChange={(v) => commit({ direction: v })}>
          <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="long">Long</SelectItem>
            <SelectItem value="short">Short</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Session">
        <Select value={local.session ?? undefined} onValueChange={(v) => commit({ session: v as SessionEnum })}>
          <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
          <SelectContent>
            {SESSION_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <NumberField label="Entry" value={local.entry_price} onCommit={(v) => commit({ entry_price: v })} />
      <NumberField label="Exit" value={local.exit_price} onCommit={(v) => commit({ exit_price: v })} />
      <NumberField label="Stop Loss" value={local.stop_loss} onCommit={(v) => commit({ stop_loss: v })} />
      <NumberField label="Take Profit" value={local.take_profit} onCommit={(v) => commit({ take_profit: v })} />
      <NumberField label="Lot size" value={local.lot_size} onCommit={(v) => commit({ lot_size: v })} step="any" />
      <NumberField label="RR" value={local.rr} onCommit={(v) => commit({ rr: v })} step="0.01" />
      <NumberField label="Risk %" value={local.risk_pct} onCommit={(v) => commit({ risk_pct: v })} step="0.01" />
      <NumberField label="Reward %" value={local.reward_pct} onCommit={(v) => commit({ reward_pct: v })} step="0.01" />
      <NumberField label="P/L" value={local.pnl} onCommit={(v) => commit({ pnl: v })} step="0.01" />
      <NumberField label="Commission" value={local.commission} onCommit={(v) => commit({ commission: v })} step="0.01" />
      <NumberField label="Swap" value={local.swap} onCommit={(v) => commit({ swap: v })} step="0.01" />
      <Field label="Setup">
        <Select value={local.setup ?? undefined} onValueChange={(v) => commit({ setup: v })}>
          <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
          <SelectContent>
            {DEFAULT_SETUPS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Strategy">
        <Input value={local.strategy ?? ""} onChange={(e) => setLocal((p) => ({ ...p, strategy: e.target.value }))} onBlur={() => commit({ strategy: local.strategy })} />
      </Field>
      <DateField
        label="Opened at"
        value={local.opened_at}
        onCommit={(v) => commit({ opened_at: v })}
      />
      <DateField
        label="Closed at"
        value={local.closed_at}
        onCommit={(v) => commit({ closed_at: v, duration_seconds: computeDuration(local.opened_at, v) })}
      />
    </div>
  );
}

function computeDuration(open: string | null | undefined, close: string | null | undefined): number | null {
  if (!open || !close) return null;
  const s = Math.round((new Date(close).getTime() - new Date(open).getTime()) / 1000);
  return Number.isFinite(s) ? Math.max(0, s) : null;
}

function PsychologySection({
  entry,
  taxonomy,
  onChange,
  onCreateTaxonomy,
}: {
  entry: JournalEntry;
  taxonomy: JournalTaxonomy[];
  onChange: (patch: Partial<JournalEntry>) => void;
  onCreateTaxonomy: (kind: "setup" | "emotion" | "mistake", label: string) => Promise<void>;
}) {
  const [checklist, setChecklist] = useState<ChecklistItem[]>(() => normalizeChecklist(entry.checklist));
  useEffect(() => setChecklist(normalizeChecklist(entry.checklist)), [entry.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const customEmotions = useMemo(() => taxonomy.filter((t) => t.kind === "emotion"), [taxonomy]);
  const customMistakes = useMemo(() => taxonomy.filter((t) => t.kind === "mistake"), [taxonomy]);

  const emotionOpts = useMemo(
    () => [...DEFAULT_EMOTIONS, ...customEmotions.map((c) => ({ value: c.value, label: c.label, color: c.color ?? undefined }))],
    [customEmotions],
  );
  const mistakeOpts = useMemo(
    () => [...DEFAULT_MISTAKES, ...customMistakes.map((c) => ({ value: c.value, label: c.label }))],
    [customMistakes],
  );

  const toggleChecklist = (id: string) => {
    const next = checklist.map((c) => (c.id === id ? { ...c, checked: !c.checked } : c));
    setChecklist(next);
    onChange({ checklist: next as unknown as JournalEntry["checklist"] });
  };
  const addChecklistItem = (label: string) => {
    if (!label.trim()) return;
    const next = [...checklist, { id: crypto.randomUUID(), label: label.trim(), checked: false }];
    setChecklist(next);
    onChange({ checklist: next as unknown as JournalEntry["checklist"] });
  };
  const removeChecklistItem = (id: string) => {
    const next = checklist.filter((c) => c.id !== id);
    setChecklist(next);
    onChange({ checklist: next as unknown as JournalEntry["checklist"] });
  };

  const toggleFromArr = (arr: string[], value: string): string[] =>
    arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];

  return (
    <div className="space-y-6">
      <section>
        <SectionTitle>Grade</SectionTitle>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {GRADE_OPTIONS.map((g) => (
            <button
              key={g.value}
              type="button"
              onClick={() => onChange({ grade: g.value as GradeEnum })}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm font-semibold transition",
                entry.grade === g.value ? GRADE_COLOR[g.value] : "border-border text-muted-foreground hover:border-primary/40",
              )}
              aria-pressed={entry.grade === g.value}
            >
              {g.label}
            </button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-xs text-muted-foreground"
            onClick={() => onChange({ grade: null })}
          >
            Clear
          </Button>
        </div>
      </section>

      <section>
        <SectionTitle>Quality (0–5)</SectionTitle>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <QualitySlider label="Entry" value={entry.entry_quality ?? 0} onCommit={(v) => onChange({ entry_quality: v })} />
          <QualitySlider label="Exit" value={entry.exit_quality ?? 0} onCommit={(v) => onChange({ exit_quality: v })} />
          <QualitySlider label="Risk mgmt" value={entry.risk_mgmt ?? 0} onCommit={(v) => onChange({ risk_mgmt: v })} />
          <QualitySlider label="Patience" value={entry.patience ?? 0} onCommit={(v) => onChange({ patience: v })} />
          <QualitySlider label="Execution" value={entry.execution ?? 0} onCommit={(v) => onChange({ execution: v })} />
          <QualitySlider label="Discipline" value={entry.discipline ?? 0} onCommit={(v) => onChange({ discipline: v })} />
        </div>
      </section>

      <section>
        <SectionTitle>Pre-trade checklist</SectionTitle>
        <ul className="mt-3 space-y-2">
          {checklist.map((c) => (
            <li key={c.id} className="flex items-center gap-2 rounded-lg border border-border/60 bg-surface/30 px-3 py-2">
              <Checkbox checked={c.checked} onCheckedChange={() => toggleChecklist(c.id)} id={`chk-${c.id}`} />
              <label htmlFor={`chk-${c.id}`} className={cn("flex-1 text-sm", c.checked && "line-through text-muted-foreground")}>
                {c.label}
              </label>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-danger" onClick={() => removeChecklistItem(c.id)} aria-label="Remove">
                <X className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
        <AddInline placeholder="Add a checklist item…" onAdd={addChecklistItem} />
      </section>

      <section>
        <SectionTitle>Emotions</SectionTitle>
        <ChipMultiSelect
          options={emotionOpts}
          selected={entry.emotions ?? []}
          onToggle={(v) => onChange({ emotions: toggleFromArr(entry.emotions ?? [], v) })}
          onAdd={(label) => onCreateTaxonomy("emotion", label)}
          addPlaceholder="Add custom emotion…"
        />
      </section>

      <section>
        <SectionTitle>Mistakes</SectionTitle>
        <ChipMultiSelect
          options={mistakeOpts}
          selected={entry.mistakes ?? []}
          onToggle={(v) => onChange({ mistakes: toggleFromArr(entry.mistakes ?? [], v) })}
          onAdd={(label) => onCreateTaxonomy("mistake", label)}
          addPlaceholder="Add custom mistake…"
        />
      </section>
    </div>
  );
}

function MediaSection({
  entry,
  screenshotUrls,
  onScreenshotsChange,
  onChange,
}: {
  entry: JournalEntry;
  screenshotUrls: Record<string, string>;
  onScreenshotsChange: (paths: string[]) => void;
  onChange: (patch: Partial<JournalEntry>) => void;
}) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  void onChange;

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length || !user) return;
    setUploading(true);
    try {
      const paths: string[] = [...(entry.screenshots ?? [])];
      for (const f of Array.from(files)) {
        const { path } = await uploadJournalImage(user.id, entry.id, f);
        paths.push(path);
      }
      onScreenshotsChange(paths);
      toast.success("Screenshot uploaded");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removeScreenshot = async (path: string) => {
    onScreenshotsChange((entry.screenshots ?? []).filter((p) => p !== path));
    await removeJournalObject(JOURNAL_IMAGES_BUCKET, path).catch(() => {});
  };

  return (
    <div className="space-y-4">
      <SectionTitle>Trade screenshots</SectionTitle>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {(entry.screenshots ?? []).map((path) => (
          <div key={path} className="group relative aspect-video overflow-hidden rounded-xl border border-border/60 bg-muted/20">
            {screenshotUrls[path] ? (
              <img src={screenshotUrls[path]} alt="Screenshot" className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <Skeleton className="h-full w-full" />
            )}
            <div className="absolute inset-0 flex items-end justify-end gap-1 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 transition group-hover:opacity-100">
              <Button size="icon" variant="secondary" className="h-7 w-7" aria-label="View" onClick={() => setLightbox(screenshotUrls[path] ?? null)}>
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="destructive" className="h-7 w-7" aria-label="Delete" onClick={() => removeScreenshot(path)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
        <label className={cn(
          "flex aspect-video cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/70 bg-muted/10 p-3 text-xs text-muted-foreground transition hover:border-primary/50 hover:text-foreground",
          uploading && "pointer-events-none opacity-70",
        )}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          <span>{uploading ? "Uploading…" : "Upload"}</span>
          <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => handleUpload(e.target.files)} />
        </label>
      </div>

      <div className="rounded-2xl border border-border/60 bg-surface/20 p-4">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          <Play className="h-3.5 w-3.5" /> Trade replay
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Coming soon — connect a market data feed to scrub through the setup, entry, and exit tick-by-tick.
        </p>
      </div>

      {lightbox ? (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-label="Screenshot preview"
        >
          <img src={lightbox} alt="Screenshot" loading="lazy" decoding="async" className="max-h-[90vh] max-w-[92vw] rounded-xl object-contain shadow-2xl" />
        </div>
      ) : null}
    </div>
  );
}

function AttachmentsSection({ entry }: { entry: JournalEntry }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: attachments, isLoading } = useQuery({
    queryKey: journalKeys.attachments(entry.id),
    queryFn: () => fetchAttachments(entry.id),
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length || !user) return;
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        const up = await uploadJournalFile(user.id, entry.id, f);
        await recordAttachment({
          entry_id: entry.id,
          user_id: user.id,
          bucket: up.bucket,
          path: up.path,
          kind: up.kind,
          name: f.name,
          size_bytes: f.size,
          content_type: f.type || null,
        });
      }
      await qc.invalidateQueries({ queryKey: journalKeys.attachments(entry.id) });
      toast.success("File attached");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async (a: JournalAttachment) => {
    await removeJournalObject(a.bucket, a.path).catch(() => {});
    await deleteAttachmentRecord(a.id);
    qc.invalidateQueries({ queryKey: journalKeys.attachments(entry.id) });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionTitle>Attachments</SectionTitle>
        <label className={cn(
          "inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent",
          uploading && "pointer-events-none opacity-70",
        )}>
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
          <span>Attach</span>
          <input ref={inputRef} type="file" hidden multiple onChange={(e) => handleUpload(e.target.files)} />
        </label>
      </div>
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
      ) : !attachments || attachments.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
          Attach images, PDFs, or videos related to this trade.
        </p>
      ) : (
        <ul className="space-y-2">
          {attachments.map((a) => (
            <AttachmentRow key={a.id} a={a} onRemove={() => remove(a)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function AttachmentRow({ a, onRemove }: { a: JournalAttachment; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    getSignedUrl(a.bucket, a.path).then((u) => mounted && setUrl(u)).catch(() => {});
    return () => { mounted = false; };
  }, [a.bucket, a.path]);
  const Icon = a.kind === "image" ? ImageIcon : a.kind === "video" ? Video : FileText;
  return (
    <li className="flex items-center gap-3 rounded-lg border border-border/60 bg-surface/30 p-2">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{a.name ?? a.path.split("/").pop()}</p>
        <p className="text-[11px] text-muted-foreground">
          {a.kind} · {a.size_bytes ? `${Math.round(a.size_bytes / 1024)} KB` : ""}
        </p>
      </div>
      {url ? (
        <a href={url} download={a.name ?? undefined} target="_blank" rel="noreferrer" className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Download">
          <Download className="h-4 w-4" />
        </a>
      ) : null}
      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-danger" onClick={onRemove} aria-label="Remove attachment">
        <Trash2 className="h-4 w-4" />
      </Button>
    </li>
  );
}

function HistorySection({ entry }: { entry: JournalEntry }) {
  const { data, isLoading } = useQuery({
    queryKey: journalKeys.history(entry.id),
    queryFn: () => fetchHistory(entry.id),
  });
  if (isLoading) return <Skeleton className="h-32 w-full rounded-xl" />;
  if (!data?.length) return <p className="rounded-xl border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">No history yet — every edit will be tracked here.</p>;
  return (
    <ol className="relative space-y-3 border-l border-border/60 pl-6">
      {data.map((h) => (
        <li key={h.id} className="relative">
          <span className="absolute -left-[26px] top-1.5 grid h-3 w-3 place-items-center rounded-full bg-primary" />
          <p className="text-xs font-semibold text-foreground">{h.action}</p>
          <p className="text-[11px] text-muted-foreground">{formatDateTime(h.created_at)}</p>
          {h.snapshot ? (
            <pre className="mt-1 max-h-32 overflow-auto rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground">{JSON.stringify(h.snapshot, null, 2)}</pre>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function AISection() {
  const items = [
    { key: "aiReview", title: "AI Trade Review", desc: "Automated post-trade breakdown of your setup, entry, exit and management." },
    { key: "aiPsychology", title: "AI Psychology", desc: "Sentiment and behavior analysis based on your journal notes and emotions." },
    { key: "aiMistakeDetection", title: "AI Mistake Detection", desc: "Detects deviations from your trading plan and recurring mistakes." },
    { key: "aiPerformanceCoach", title: "AI Performance Coach", desc: "Weekly review of your edge, drawdowns and habits." },
    { key: "aiSuggestions", title: "AI Suggestions", desc: "Personalized suggestions on setups, risk, and journaling gaps." },
  ] as const;
  return (
    <div className="space-y-3">
      {items.map((i) => {
        const enabled = (JOURNAL_FEATURES as Record<string, boolean>)[i.key];
        return (
          <div key={i.key} className="rounded-2xl border border-border/60 bg-surface/30 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-primary" /> {i.title}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{i.desc}</p>
              </div>
              <Badge variant="outline" className="shrink-0">{enabled ? "Enabled" : "Coming soon"}</Badge>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* -------------------- Helpers -------------------- */

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-surface/30 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{children}</h3>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function NumberField({
  label,
  value,
  onCommit,
  step,
}: {
  label: string;
  value: number | null | undefined;
  onCommit: (v: number | null) => void;
  step?: string;
}) {
  const [v, setV] = useState<string>(value != null ? String(value) : "");
  useEffect(() => setV(value != null ? String(value) : ""), [value]);
  return (
    <Field label={label}>
      <Input
        type="number"
        inputMode="decimal"
        step={step ?? "any"}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => onCommit(v === "" ? null : Number(v))}
      />
    </Field>
  );
}

function DateField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string | null | undefined;
  onCommit: (v: string | null) => void;
}) {
  const [v, setV] = useState<string>(() => (value ? toInputValue(value) : ""));
  useEffect(() => setV(value ? toInputValue(value) : ""), [value]);
  return (
    <Field label={label}>
      <Input
        type="datetime-local"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => onCommit(v ? new Date(v).toISOString() : null)}
      />
    </Field>
  );
}

function toInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function QualitySlider({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <div className="rounded-lg border border-border/60 bg-surface/30 p-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
        <span className="font-mono text-sm font-semibold text-foreground">{v}/5</span>
      </div>
      <Slider
        value={[v]}
        min={0}
        max={5}
        step={1}
        onValueChange={(x) => setV(x[0])}
        onValueCommit={(x) => onCommit(x[0])}
        className="mt-2"
      />
    </div>
  );
}

function ChipMultiSelect({
  options,
  selected,
  onToggle,
  onAdd,
  addPlaceholder,
}: {
  options: { value: string; label: string; color?: string }[];
  selected: string[];
  onToggle: (v: string) => void;
  onAdd: (label: string) => Promise<void>;
  addPlaceholder: string;
}) {
  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const active = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onToggle(o.value)}
              aria-pressed={active}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs transition",
                active
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
              style={active ? undefined : o.color ? { borderColor: `${o.color}55`, color: o.color } : undefined}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      <AddInline placeholder={addPlaceholder} onAdd={async (v) => { await onAdd(v); }} />
    </div>
  );
}

function AddInline({ placeholder, onAdd }: { placeholder: string; onAdd: (v: string) => void | Promise<void> }) {
  const [v, setV] = useState("");
  return (
    <div className="flex gap-2">
      <Input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} className="h-8 text-xs" />
      <Button
        size="sm"
        variant="outline"
        className="h-8"
        onClick={async () => {
          if (!v.trim()) return;
          await onAdd(v.trim());
          setV("");
        }}
      >
        <Plus className="mr-1 h-3.5 w-3.5" /> Add
      </Button>
    </div>
  );
}

function TagPicker({
  allTags,
  entryTagIds,
  onCommit,
  onCreate,
}: {
  allTags: JournalTag[];
  entryTagIds: string[];
  onCommit: (ids: string[]) => Promise<void>;
  onCreate: (name: string) => Promise<JournalTag | null>;
}) {
  const [selected, setSelected] = useState<string[]>(entryTagIds);
  const [dirty, setDirty] = useState(false);
  const [name, setName] = useState("");
  useEffect(() => { setSelected(entryTagIds); setDirty(false); }, [entryTagIds]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      setDirty(true);
      return next;
    });
  };
  const commit = async () => {
    await onCommit(selected);
    setDirty(false);
  };
  const create = async () => {
    if (!name.trim()) return;
    const t = await onCreate(name);
    setName("");
    if (t) {
      setSelected((prev) => (prev.includes(t.id) ? prev : [...prev, t.id]));
      setDirty(true);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Tags</span>
      {allTags.map((t) => {
        const active = selected.includes(t.id);
        return (
          <button
            key={t.id}
            onClick={() => toggle(t.id)}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] transition",
              active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground",
            )}
            style={active ? undefined : { borderColor: `${t.color}55`, color: t.color }}
          >
            {t.name}
          </button>
        );
      })}
      <div className="flex items-center gap-1">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New tag" className="h-7 w-24 text-xs" />
        <Button size="sm" variant="outline" className="h-7" onClick={create}>Add</Button>
      </div>
      {dirty ? (
        <Button size="sm" className="h-7" onClick={commit}>Save tags</Button>
      ) : null}
    </div>
  );
}

function normalizeChecklist(raw: JournalEntry["checklist"]): ChecklistItem[] {
  if (!raw || !Array.isArray(raw) || raw.length === 0) {
    return DEFAULT_CHECKLIST.map((c) => ({ id: c.id, label: c.label, checked: false }));
  }
  return (raw as unknown as ChecklistItem[]).map((c) => ({
    id: c.id ?? crypto.randomUUID(),
    label: c.label ?? "",
    checked: !!c.checked,
  }));
}

// Silence "unused" for imports intentionally re-exported by MediaSection scope.
void supabase;
void Separator;
void Textarea;
void Switch;

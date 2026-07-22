import { useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowDownRight,
  ArrowUpRight,
  Camera,
  Clock,
  Gauge,
  Heart,
  Play,
  Sparkles,
  Target,
  Tag as TagIcon,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  fetchAttachments,
  fetchEntry,
  fetchTags,
  fetchAllEntryTagLinks,
  journalKeys,
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
import { GRADE_COLOR, SESSION_OPTIONS } from "@/lib/journal/constants";
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

function JournalEntryPage() {
  const { entryId } = Route.useParams();
  const navigate = useNavigate();

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

  const tone = pnlTone(entry.pnl);
  const result = tradeResult(entry.pnl);
  const sessionLabel = SESSION_OPTIONS.find((s) => s.value === entry.session)?.label ?? entry.session ?? "—";

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${entry.symbol ?? "Untitled"}${entry.is_favorite ? " ★" : ""}`}
        description={`${entry.market ?? ""} · #${shortId(entry.id)} · ${formatDate(entry.closed_at ?? entry.created_at)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/journal"><ArrowLeft className="mr-1.5 h-4 w-4" /> Back</Link>
            </Button>
          </div>
        }
      />

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
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <Field label="Setup" value={entry.setup?.replace(/_/g, " ") ?? "—"} />
              <Field label="Strategy" value={entry.strategy ?? "—"} />
              <Field label="Session" value={sessionLabel} />
              <Field label="Confidence" value={entry.confidence != null ? `${entry.confidence}%` : "—"} />
              <Field label="Position size" value={entry.lot_size != null ? String(entry.lot_size) : "—"} />
              <Field label="Duration" value={formatDuration(entry.duration_seconds)} />
            </div>
            {entryTags.length ? (
              <>
                <Separator className="my-4" />
                <div className="flex flex-wrap gap-1.5">
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
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {entry.entry_reason_text?.trim() || "No entry reason recorded."}
            </p>
          </GlassCard>

          <GlassCard className="p-5">
            <SectionTitle icon={<Sparkles className="h-4 w-4" />} title="Post-trade notes" />
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {entry.notes_text?.trim() || "No notes captured."}
            </p>
          </GlassCard>

          {screenshotPaths.length ? (
            <GlassCard className="p-5">
              <SectionTitle icon={<Camera className="h-4 w-4" />} title={`Screenshots (${screenshotPaths.length})`} />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {screenshotPaths.map((p) => {
                  const url = shotUrls.data?.[p];
                  return (
                    <a
                      key={p}
                      href={url ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="group relative block aspect-video overflow-hidden rounded-lg border border-border/60 bg-surface-2/30"
                    >
                      {url ? (
                        <img src={url} alt="Screenshot" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
                      ) : (
                        <div className="grid h-full w-full place-items-center text-[10px] text-muted-foreground">Loading…</div>
                      )}
                    </a>
                  );
                })}
              </div>
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

          {null}

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

          <Button
            variant="outline"
            size="sm"
            className="w-full text-danger hover:text-danger"
            onClick={() => {
              if (window.confirm("Delete this journal entry? This action cannot be undone.")) {
                navigate({ to: "/journal" });
              }
            }}
          >
            <Trash2 className="mr-1.5 h-4 w-4" /> Delete entry (from list)
          </Button>
        </div>
      </div>
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

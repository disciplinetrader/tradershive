/**
 * TRADE STORY — /journal/$entryId
 *
 * One continuous narrative: header → chart evidence → execution timeline →
 * two-column review. Everything is derived from the single trade query plus
 * the journal list already in cache; nothing here invents data.
 */
import { lazy, Suspense, useCallback, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useAuth } from "@/hooks/use-auth";
import {
  deleteEntry,
  fetchAttachments,
  fetchEntries,
  fetchEntry,
  fetchHistory,
  fetchTags,
  groupTagsByKind,
  fetchTaxonomy,
  fetchAllEntryTagLinks,
  journalKeys,
  updateEntry,
  type JournalEntry,
} from "@/lib/journal/api";
import { batchSignUrls, JOURNAL_IMAGES_BUCKET } from "@/lib/journal/storage";
import {
  buildMistakes,
  buildTimeline,
  improvementPlan,
  planVsReality,
  playbookMatch,
  readNarrative,
  similarTrades,
  storyMetrics,
  type TimelineEvent,
} from "@/lib/journal/story";
import { hiveScore } from "@/lib/journal/metrics";
import { StorySection } from "@/components/journal/story/primitives";
import { StoryHeader } from "@/components/journal/story/StoryHeader";
import { TradeStoryChart } from "@/components/journal/story/TradeStoryChart";
import { ExecutionTimeline } from "@/components/journal/story/ExecutionTimeline";
import { PerformanceSummary } from "@/components/journal/story/PerformanceSummary";
import { PlanVsReality } from "@/components/journal/story/PlanVsReality";
import { MediaStrip } from "@/components/journal/story/MediaStrip";
import { NarrativeNotes } from "@/components/journal/story/NarrativeNotes";
import { PlaybookMatch } from "@/components/journal/story/PlaybookMatch";
import { MistakesPanel } from "@/components/journal/story/MistakesPanel";
import { PsychologyPanel } from "@/components/journal/story/PsychologyPanel";
import { SimilarTrades } from "@/components/journal/story/SimilarTrades";
import { ImprovementPlan } from "@/components/journal/story/ImprovementPlan";
import { ReplayActions, useReplayContext } from "@/components/journal/story/ReplayActions";
import { ExcursionPanel } from "@/components/journal/story/ExcursionPanel";
import type { Candle } from "@/lib/market-data/types";
import { routeBoundaries } from "@/lib/route-boundaries";
import { openTradeEditor } from "@/components/journal/editor/store";
import { useTradeEditorShortcut } from "@/components/journal/editor/useTradeEditorShortcut";

const AiReview = lazy(() =>
  import("@/components/journal/story/AiReview").then((m) => ({ default: m.AiReview })),
);

export const Route = createFileRoute("/_authenticated/journal/$entryId")({
  head: () => ({
    meta: [
      { title: "Trade Story — TradersHIVE Journal" },
      {
        name: "description",
        content: "The full story of one trade: plan versus reality, execution evidence, mistakes, psychology and the next improvement.",
      },
    ],
  }),
  component: TradeStoryPage,
  ...routeBoundaries({
    label: "Trade story",
    boundary: "journal_entry_route",
    backHref: "/journal/trades",
    backLabel: "Back to Trades",
  }),
});

function TradeStoryPage() {
  const { entryId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();

  const [candles, setCandles] = useState<Candle[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const uploadRef = useRef<(() => void) | null>(null);
  const notesFocusRef = useRef<(() => void) | null>(null);
  const similarRef = useRef<HTMLDivElement | null>(null);

  // "E" opens the unified editor for the trade being read.
  useTradeEditorShortcut(entryId);

  const entryQuery = useQuery({ queryKey: journalKeys.entry(entryId), queryFn: () => fetchEntry(entryId) });
  const listQuery = useQuery({ queryKey: journalKeys.list(), queryFn: fetchEntries });
  const attachmentsQuery = useQuery({
    queryKey: ["journal", "attachments", entryId],
    queryFn: () => fetchAttachments(entryId),
  });
  const historyQuery = useQuery({
    queryKey: ["journal", "history", entryId],
    queryFn: () => fetchHistory(entryId),
  });
  const tagsQuery = useQuery({ queryKey: journalKeys.tags(), queryFn: fetchTags });
  const taxonomyQuery = useQuery({ queryKey: ["journal", "taxonomy"], queryFn: fetchTaxonomy });
  const linksQuery = useQuery({ queryKey: ["journal", "entryTagLinks"], queryFn: fetchAllEntryTagLinks });

  const entry = entryQuery.data ?? null;
  const all = listQuery.data ?? [];

  const shotPaths = entry?.screenshots ?? [];
  const shotUrlsQuery = useQuery({
    queryKey: ["journal", "entry-shots", entryId, shotPaths.join("|")],
    queryFn: () => batchSignUrls(JOURNAL_IMAGES_BUCKET, shotPaths),
    enabled: shotPaths.length > 0,
  });
  const shotUrls = shotUrlsQuery.data ?? {};

  const metrics = useMemo(() => (entry ? storyMetrics(entry, candles) : null), [entry, candles]);
  const timeline = useMemo(
    () => (entry ? buildTimeline(entry, attachmentsQuery.data ?? [], historyQuery.data ?? []) : []),
    [entry, attachmentsQuery.data, historyQuery.data],
  );
  const plan = useMemo(() => (entry && metrics ? planVsReality(entry, metrics) : null), [entry, metrics]);
  const mistakes = useMemo(() => (entry && metrics ? buildMistakes(entry, all, metrics) : []), [entry, all, metrics]);
  const playbook = useMemo(() => (entry && metrics ? playbookMatch(entry, metrics) : null), [entry, metrics]);
  const similar = useMemo(() => (entry ? similarTrades(entry, all) : []), [entry, all]);
  const actions = useMemo(
    () => (entry && metrics ? improvementPlan(entry, metrics, mistakes) : []),
    [entry, metrics, mistakes],
  );

  // Hive contribution = score with this trade minus score without it.
  const hiveDelta = useMemo(() => {
    if (!entry || all.length < 2) return null;
    const withIt = hiveScore(all).total;
    const without = hiveScore(all.filter((e) => e.id !== entry.id)).total;

    return Math.round((withIt - without) * 10) / 10;
  }, [entry, all]);

  const { prevId, nextId } = useMemo(() => {
    const ordered = [...all].sort(
      (a, b) => new Date(b.opened_at ?? b.created_at).getTime() - new Date(a.opened_at ?? a.created_at).getTime(),
    );
    const i = ordered.findIndex((e) => e.id === entryId);
    return { prevId: i > 0 ? ordered[i - 1].id : null, nextId: i >= 0 && i < ordered.length - 1 ? ordered[i + 1].id : null };
  }, [all, entryId]);

  const appendNote = useCallback(
    async (text: string) => {
      if (!entry) return;
      const nar = readNarrative(entry);
      const free = [nar.free ?? "", text].filter(Boolean).join("\n");
      await updateEntry(entry.id, {
        narrative: { ...nar, free } as never,
        notes_text: free,
      });
      qc.invalidateQueries({ queryKey: journalKeys.entry(entry.id) });
    },
    [entry, qc],
  );

  const del = useMutation({
    mutationFn: () => deleteEntry(entryId),
    onSuccess: () => {
      toast.success("Journal entry deleted");
      qc.invalidateQueries({ queryKey: journalKeys.list() });
      navigate({ to: "/journal/trades" });
    },
    onError: (e) => toast.error((e as Error)?.message ?? "Delete failed"),
  });

  const goReplay = useReplayContext(entry ?? ({ id: entryId } as JournalEntry));

  if (entryQuery.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-11 w-full rounded-lg" />
        <Skeleton className="h-[420px] w-full rounded-lg" />
        <div className="grid gap-3 lg:grid-cols-3">
          <Skeleton className="h-64 rounded-lg lg:col-span-2" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!entry || !metrics || !plan || !playbook) {
    return (
      <div className="rounded-lg border border-border/60 p-8 text-center">
        <p className="text-sm text-muted-foreground">This trade no longer exists.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/journal/trades"><ArrowLeft className="mr-1.5 h-4 w-4" /> Back to Trades</Link>
        </Button>
      </div>
    );
  }

  const entryTagIds = (linksQuery.data ?? []).filter((l) => l.entry_id === entry.id).map((l) => l.tag_id);
  // Grouped, not flat: tag identity is (kind, value), so "Breakout" can be both
  // a setup and a custom tag. Two identical chips side by side would be unreadable.
  const entryTagGroups = groupTagsByKind(
    (tagsQuery.data ?? []).filter((t) => entryTagIds.includes(t.id)),
  );

  return (
    <div className="space-y-3 pb-10">
      <StoryHeader
        entry={entry}
        hiveDelta={hiveDelta}
        prevId={prevId}
        nextId={nextId}
        onEdit={() => openTradeEditor(entryId, "full")}
        onAddNote={() => notesFocusRef.current?.()}
        onAddScreenshot={() => uploadRef.current?.()}
        onReplay={goReplay}
        onDelete={() => setConfirmDelete(true)}
      />

      <TradeStoryChart entry={entry} onCandles={setCandles} focusTime={selectedEvent?.at ? new Date(selectedEvent.at).getTime() / 1000 : null} />

      {entryTagGroups.length ? (
        <StorySection id="tags" title="Tags" subtitle="How this trade is classified">
          <div className="space-y-3">
            {entryTagGroups.map((group) => (
              <div key={group.kind}>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {group.label}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {group.tags.map((t) => (
                    <span
                      key={t.id}
                      className="rounded-full border px-2.5 py-1 text-xs"
                      style={{ borderColor: `${t.color}55`, color: t.color }}
                    >
                      {t.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </StorySection>
      ) : null}

      <StorySection
        id="excursion"
        title="How far it moved"
        subtitle="What the trade looked like at its worst and its best, from real candles"
      >
        <ExcursionPanel entry={entry} />
      </StorySection>

      <StorySection id="timeline" title="Execution timeline" subtitle="Click an event to focus the chart at that moment">
        <ExecutionTimeline
          events={timeline}
          selectedId={selectedEvent?.id ?? null}
          onSelect={setSelectedEvent}
          shotUrls={shotUrls}
        />
      </StorySection>

      <div className="grid gap-3 lg:grid-cols-3">
        {/* Primary column — the explanation */}
        <div className="space-y-3 lg:col-span-2">
          <StorySection id="plan" title="Plan vs reality">
            <PlanVsReality rows={plan.rows} adherence={plan.adherence} />
          </StorySection>

          <StorySection id="media" title="Screenshots" subtitle="Paste, drop or upload — this is your evidence">
            <MediaStrip entry={entry} userId={user?.id ?? null} urls={shotUrls} uploadRef={uploadRef} />
          </StorySection>

          <StorySection id="notes" title="Narrative notes" subtitle="Autosaves as you type">
            <NarrativeNotes entry={entry} focusRef={notesFocusRef} />
          </StorySection>

          <StorySection id="ai" title="AI review" subtitle="Grounded in this trade's recorded data">
            <Suspense fallback={<Skeleton className="h-40 w-full rounded" />}>
              <AiReview
                entry={entry}
                metrics={metrics}
                mistakes={mistakes}
                adherence={plan.adherence}
                onAddToNotes={(t) => void appendNote(t)}
              />
            </Suspense>
          </StorySection>

          <StorySection id="improve" title="Improvement plan">
            <ImprovementPlan actions={actions} onAddToNotes={(t) => void appendNote(t)} onPractise={goReplay} />
          </StorySection>

          <StorySection id="replay" title="Practice">
            <ReplayActions
              entry={entry}
              onSimilar={() => similarRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
            />
          </StorySection>
        </div>

        {/* Secondary column — the numbers */}
        <div className="space-y-3">
          <StorySection id="perf" title="Performance">
            <PerformanceSummary m={metrics} hasCandles={candles.length > 0} />
          </StorySection>

          <StorySection id="playbook" title="Playbook match">
            <PlaybookMatch entry={entry} rules={playbook.rules} pct={playbook.pct} quality={playbook.quality} />
          </StorySection>

          <StorySection id="mistakes" title="Mistakes & rule violations">
            <MistakesPanel items={mistakes} entry={entry} />
          </StorySection>

          <StorySection id="psych" title="Psychology">
            <PsychologyPanel entry={entry} />
          </StorySection>

          <div ref={similarRef}>
            <StorySection id="similar" title="Similar trades" subtitle="Rule-based matching">
              <SimilarTrades items={similar} />
            </StorySection>
          </div>
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this trade story?</AlertDialogTitle>
            <AlertDialogDescription>
              Notes, screenshots and analysis for this entry are removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => del.mutate()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

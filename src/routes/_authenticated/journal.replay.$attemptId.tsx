/**
 * JOURNAL X — PHASE 4 · Original vs Replay comparison.
 *
 * Route: /journal/replay/$attemptId
 *
 * Everything on this page is derived at read time from the original journal
 * entry plus the replay trades of the attempt's session. The stored
 * `breakdown` on the attempt row is a cache for list views (Trade Story,
 * analytics) — it is never the source of truth here, so an edited original
 * trade re-derives correctly instead of showing stale numbers.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StorySection, MissingData } from "@/components/journal/story/primitives";
import {
  ComparisonHeader,
  EvaluationPanel,
  ExecutionComparison,
  ImprovementDeltaTable,
  MistakeComparison,
  NextActionCard,
  PlanAdherenceComparison,
  ProcessVsOutcomeCard,
  PsychologyComparison,
  ReflectionCard,
} from "@/components/journal/replay/ComparisonSections";
import { IntentDialog, usePracticeLauncher } from "@/components/journal/replay/PracticeLauncher";
import {
  attemptKeys,
  fetchReplaySession,
  fetchReplayTrades,
  getAttempt,
  listAttempts,
  markBestAttempt,
  saveEvaluation,
  saveReflection,
} from "@/lib/journal/replay-attempts";
import {
  buildEvaluation,
  compareMistakes,
  improvementDelta,
  intentAdherence,
  nextPracticeAction,
  outcomeRows,
  processScore,
  processVsOutcome,
  psychologyRows,
  readinessVerdict,
  sideFromEntry,
  sideFromReplay,
  type AttemptIntent,
  type AttemptReflection,
  type AttemptSummary,
  type AttemptTelemetry,
} from "@/lib/journal/replay-compare";
import { fetchEntry, journalKeys } from "@/lib/journal/api";
import { planVsReality, storyMetrics } from "@/lib/journal/story";

const ComparisonChart = lazy(() =>
  import("@/components/journal/replay/ComparisonChart").then((m) => ({ default: m.ComparisonChart })),
);

export const Route = createFileRoute("/_authenticated/journal/replay/$attemptId")({
  head: () => ({
    meta: [
      { title: "Replay Comparison — TradersHIVE Journal" },
      { name: "description", content: "Compare an original trade with a replay practice attempt and measure process improvement." },
      { property: "og:title", content: "Replay Comparison — TradersHIVE Journal" },
      { property: "og:description", content: "Measure whether a replay attempt improved your process, not just your P/L." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ComparisonPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-sm text-muted-foreground">
      This comparison could not be loaded. {error.message}
    </div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm text-muted-foreground">Attempt not found.</div>,
});

function ComparisonPage() {
  const { attemptId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [dismissed, setDismissed] = useState(false);

  const attemptQ = useQuery({ queryKey: attemptKeys.one(attemptId), queryFn: () => getAttempt(attemptId) });
  const attempt = attemptQ.data ?? null;
  const entryId = attempt?.original_entry_id ?? null;
  const sessionId = attempt?.session_id ?? null;

  const entryQ = useQuery({
    queryKey: journalKeys.entry(entryId ?? ""),
    queryFn: () => fetchEntry(entryId!),
    enabled: !!entryId,
  });
  const tradesQ = useQuery({
    queryKey: ["replay-trades", sessionId],
    queryFn: () => fetchReplayTrades(sessionId!),
    enabled: !!sessionId,
  });
  const sessionQ = useQuery({
    queryKey: ["replay-session", sessionId],
    queryFn: () => fetchReplaySession(sessionId!),
    enabled: !!sessionId,
  });
  const siblingsQ = useQuery({
    queryKey: attemptKeys.forEntry(entryId ?? ""),
    queryFn: () => listAttempts(entryId!),
    enabled: !!entryId,
  });

  const launcher = usePracticeLauncher(entryQ.data);

  /* ---------------- local reflection with debounced persistence ---------- */
  const [reflection, setReflection] = useState<AttemptReflection>({});
  const [savingReflection, setSaving] = useState(false);
  useEffect(() => {
    if (attempt?.reflection) setReflection(attempt.reflection as AttemptReflection);
  }, [attempt?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const onReflection = useCallback(
    (next: AttemptReflection) => {
      setReflection(next);
      setSaving(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        try {
          await saveReflection(attemptId, next);
          qc.invalidateQueries({ queryKey: attemptKeys.one(attemptId) });
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setSaving(false);
        }
      }, 700);
    },
    [attemptId, qc],
  );

  const best = useMutation({
    mutationFn: () => markBestAttempt(entryId!, attemptId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: attemptKeys.forEntry(entryId ?? "") });
      qc.invalidateQueries({ queryKey: attemptKeys.one(attemptId) });
      toast.success("Marked as the best attempt for this trade.");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  /* ---------------- derivation (memoised; recomputes only on source change) */
  const model = useMemo(() => {
    const entry = entryQ.data;
    if (!entry || !attempt) return null;

    const metrics = storyMetrics(entry, []);
    const plan = planVsReality(entry, metrics);
    const original = sideFromEntry(entry, metrics, plan.adherence);

    const intent = (attempt.intent ?? {}) as AttemptIntent;
    const telemetry = (attempt.telemetry ?? {}) as AttemptTelemetry;
    const replay = sideFromReplay(tradesQ.data ?? [], intent, reflection, telemetry);

    const adherence = intentAdherence(intent, replay);
    replay.adherence = adherence.score;

    const rows = improvementDelta(original, replay);
    const po = processVsOutcome(rows, original, replay);
    const mistakes = compareMistakes(original, replay, reflection);
    const psych = psychologyRows(original, replay);

    const siblings: AttemptSummary[] = (siblingsQ.data ?? [])
      .filter((a) => a.status === "completed")
      .map((a) => {
        const b = (a.breakdown ?? {}) as { mistakes?: { correctedCount?: number; repeatedCount?: number } };
        return {
          processDelta: a.id === attemptId ? po.processDelta : a.process_delta == null ? null : Number(a.process_delta),
          correctedCount: a.id === attemptId ? mistakes.correctedCount : b.mistakes?.correctedCount ?? 0,
          repeatedCount: a.id === attemptId ? mistakes.repeatedCount : b.mistakes?.repeatedCount ?? 0,
        };
      });

    const readiness = readinessVerdict(siblings.length ? siblings : [{ processDelta: po.processDelta, correctedCount: mistakes.correctedCount, repeatedCount: mistakes.repeatedCount }]);
    const action = nextPracticeAction(rows, mistakes, po);
    const evaluation = buildEvaluation({ rows, po, mistakes, readiness, next: action, original, replay });

    return {
      entry,
      original,
      replay,
      rows,
      po,
      mistakes,
      psych,
      readiness,
      action,
      evaluation,
      originalPlanRows: plan.rows,
      replayPlanRows: adherence.rows,
      outcome: outcomeRows(original, replay),
      processOriginal: processScore(rows, "original"),
      totalAttempts: siblingsQ.data?.length ?? 1,
    };
  }, [entryQ.data, attempt, tradesQ.data, siblingsQ.data, reflection, attemptId]);

  // Persist the generated evaluation once, so the panel is stable and cheap
  // on later visits. It is only rewritten when the source data changes.
  useEffect(() => {
    if (!model || !attempt) return;
    const stored = attempt.ai_review as { signature?: string } | null;
    const signature = `${model.po.processDelta}|${model.mistakes.correctedCount}|${model.mistakes.repeatedCount}|${model.readiness.verdict}`;
    if (stored?.signature === signature) return;
    void saveEvaluation(attemptId, { signature, blocks: model.evaluation.blocks, generated_at: new Date().toISOString() });
  }, [model, attempt, attemptId]);

  if (attemptQ.isLoading || (entryId && entryQ.isLoading)) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-[320px] w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!attempt) {
    return (
      <div className="p-6">
        <MissingData label="This replay attempt no longer exists. It may have been unlinked from the trade." />
      </div>
    );
  }

  if (!model) {
    return (
      <div className="p-6">
        <MissingData
          label="The original trade for this attempt is unavailable — it may have been deleted. The replay session itself is untouched."
          action={
            <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => navigate({ to: "/journal" })}>
              Back to journal
            </Button>
          }
        />
      </div>
    );
  }

  const symbol = model.entry.symbol ?? "—";
  const noReplayTrades = !(tradesQ.data ?? []).length;

  return (
    <div className="space-y-3 p-3 lg:p-4">
      <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground">
        <Link to="/journal/$entryId" params={{ entryId: model.entry.id }}>
          <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Trade story
        </Link>
      </Button>

      <ComparisonHeader
        entryId={model.entry.id}
        symbol={symbol}
        attemptNumber={attempt.attempt_number}
        totalAttempts={model.totalAttempts}
        mode={attempt.mode}
        completedAt={attempt.completed_at}
        po={model.po}
        readiness={model.readiness}
        isBest={!!attempt.is_best}
        onMarkBest={() => best.mutate()}
      />

      {attempt.status !== "completed" && (
        <div className="rounded-[3px] border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] text-amber-300/90">
          This attempt is {attempt.status.replace(/_/g, " ")}. Numbers below reflect whatever was recorded so far.
        </div>
      )}
      {noReplayTrades && (
        <div className="rounded-[3px] border border-border/60 bg-muted/10 p-2 text-[11px] text-muted-foreground">
          No trades were executed in this replay attempt, so execution and outcome comparisons are not measurable. Plan intent and
          reflection are still shown.
        </div>
      )}

      <StorySection title="Charts" subtitle="One engine, switchable sides — original, replay, or both overlaid.">
        <Suspense fallback={<Skeleton className="h-[320px] w-full" />}>
          <ComparisonChart symbol={symbol} market={model.entry.market} original={model.original} replay={model.replay} />
        </Suspense>
      </StorySection>

      <StorySection title="Improvement delta" subtitle="Every dimension shows its own inputs. Nothing is a black box.">
        <ImprovementDeltaTable rows={model.rows} />
      </StorySection>

      <StorySection title="Process vs outcome" subtitle="Process first. The financial result is reported separately.">
        <ProcessVsOutcomeCard po={model.po} outcome={model.outcome} />
      </StorySection>

      <div className="grid gap-3 xl:grid-cols-2">
        <StorySection title="Execution comparison">
          <ExecutionComparison a={model.original} b={model.replay} />
        </StorySection>
        <StorySection title="Plan adherence" subtitle="Original plan vs actual, replay intent vs actual.">
          <PlanAdherenceComparison
            originalRows={model.originalPlanRows.map((r) => ({
              area: r.area,
              planned: r.planned,
              actual: r.actual,
              verdict: r.verdict,
              why: r.why,
            }))}
            replayRows={model.replayPlanRows}
          />
        </StorySection>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <StorySection title="Mistakes" subtitle="Each verdict cites the evidence it used.">
          <MistakeComparison rows={model.mistakes.rows} introduced={model.mistakes.introduced} />
        </StorySection>
        <StorySection title="Psychology" subtitle="Self-reported, associative — not causal.">
          <PsychologyComparison rows={model.psych} />
        </StorySection>
      </div>

      <StorySection title="Reflection" subtitle="Write this before reading the evaluation below.">
        <ReflectionCard value={reflection} onChange={onReflection} saving={savingReflection} />
      </StorySection>

      <StorySection title="Evaluation" subtitle="Derived from the comparison above; no data is invented.">
        <EvaluationPanel
          blocks={model.evaluation.blocks}
          missing={model.evaluation.missing}
          onFeedback={(v) => {
            void saveEvaluation(attemptId, {
              ...(attempt.ai_review as object | null),
              feedback: v,
              feedback_at: new Date().toISOString(),
            });
            toast.success("Thanks — feedback recorded.");
          }}
        />
      </StorySection>

      <StorySection title="Next practice action">
        <NextActionCard
          action={model.action}
          readiness={model.readiness}
          dismissed={dismissed}
          onDismiss={() => setDismissed(true)}
          onStart={() => launcher.open(model.action.mode, model.action.mistake)}
          onHomework={() => {
            void saveEvaluation(attemptId, {
              ...(attempt.ai_review as object | null),
              homework: model.action,
              homework_at: new Date().toISOString(),
            });
            toast.success("Added to your homework list.");
          }}
        />
      </StorySection>

      {launcher.pending ? (
        <IntentDialog
          entry={model.entry}
          pending={launcher.pending}
          busy={launcher.isPending}
          onClose={launcher.close}
          onStart={launcher.start}
        />
      ) : null}
    </div>
  );
}

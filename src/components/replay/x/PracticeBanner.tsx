/**
 * JOURNAL X — PHASE 4 · practice banner inside Replay Studio.
 *
 * Shown only when the current replay session was started as a practice
 * attempt against a journal trade. It stays a single hairline strip so it
 * never competes with the chart, and it owns the completion step:
 * collect telemetry → derive metrics → store → open the comparison.
 */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Target, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  abandonAttempt,
  attemptKeys,
  collectTelemetry,
  completeAttempt,
  fetchReplayTrades,
  getAttemptBySession,
} from "@/lib/journal/replay-attempts";
import { fetchEntry } from "@/lib/journal/api";
import { mistakeLabel, planVsReality, storyMetrics } from "@/lib/journal/story";
import {
  compareMistakes,
  improvementDelta,
  intentAdherence,
  outcomeRows,
  processScore,
  processVsOutcome,
  readinessVerdict,
  sideFromEntry,
  sideFromReplay,
  type AttemptSummary,
} from "@/lib/journal/replay-compare";
import { cn } from "@/lib/utils";

const diff = (a: number | null, b: number | null) => (a == null || b == null ? null : b - a);

export function PracticeBanner({ sessionId }: { sessionId: string | null | undefined }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const { data: attempt } = useQuery({
    queryKey: attemptKeys.bySession(sessionId ?? ""),
    queryFn: () => getAttemptBySession(sessionId!),
    enabled: !!sessionId,
    staleTime: 60_000,
  });

  if (!attempt || attempt.status === "completed") return null;

  const blind = attempt.mode === "blind";
  const mistakeFocus = (attempt as { mistake_focus?: string | null }).mistake_focus ?? null;
  const focus = mistakeFocus ? mistakeLabel(mistakeFocus) : null;

  const finish = async () => {
    setBusy(true);
    try {
      const [entry, trades, telemetry] = await Promise.all([
        attempt.original_entry_id ? fetchEntry(attempt.original_entry_id) : Promise.resolve(null),
        fetchReplayTrades(attempt.session_id!),
        collectTelemetry(attempt.session_id!),
      ]);
      if (!entry) throw new Error("The original trade for this attempt is no longer available.");

      const metrics = storyMetrics(entry, []);
      const plan = planVsReality(entry, metrics);
      const original = sideFromEntry(entry, metrics, plan.adherence);
      const intent = attempt.intentObj;
      const replay = sideFromReplay(trades, intent, attempt.reflectionObj, telemetry);
      replay.adherence = intentAdherence(intent, replay).score;

      const rows = improvementDelta(original, replay);
      const po = processVsOutcome(rows, original, replay);
      const mistakes = compareMistakes(original, replay, attempt.reflectionObj);
      const summary: AttemptSummary = {
        processDelta: po.processDelta,
        correctedCount: mistakes.correctedCount,
        repeatedCount: mistakes.repeatedCount,
      };
      const readiness = readinessVerdict([summary]);

      await completeAttempt(attempt.id, {
        telemetry,
        process_delta: po.processDelta,
        outcome_delta: po.outcomeDelta,
        verdict: readiness.verdict,
        replay_trade_id: trades[trades.length - 1]?.id ?? null,
        entry_diff: diff(original.entryPrice, replay.entryPrice),
        exit_diff: diff(original.exitPrice, replay.exitPrice),
        rr_diff: diff(original.realizedR, replay.realizedR),
        timing_diff_seconds: diff(original.holdSeconds, replay.holdSeconds),
        result_diff: diff(original.pnl, replay.pnl),
        breakdown: {
          rows,
          outcome: outcomeRows(original, replay),
          processOriginal: processScore(rows, "original"),
          processReplay: processScore(rows, "replay"),
          mistakes: { correctedCount: mistakes.correctedCount, repeatedCount: mistakes.repeatedCount },
        },
      });

      navigate({ to: "/journal/replay/$attemptId", params: { attemptId: attempt.id } });
    } catch (e) {
      toast.error((e as Error).message || "Could not complete the attempt.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2 border-b border-white/5 bg-white/[0.02] px-2 py-1 text-[11px]">
      <Target className="h-3.5 w-3.5 text-primary" />
      <span className="font-medium">Practice attempt {attempt.attempt_number}</span>
      <span className="text-muted-foreground">
        {blind ? "Blind — original direction and outcome hidden" : attempt.mode.replace(/_/g, " ")}
        {focus ? ` · focus: ${focus}` : ""}
      </span>
      <div className="flex-1" />
      <Button size="sm" className="h-6 px-2 text-[11px]" onClick={finish} disabled={busy}>
        {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
        Finish &amp; compare
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className={cn("h-6 px-1.5 text-[11px] text-muted-foreground")}
        disabled={busy}
        onClick={async () => {
          await abandonAttempt(attempt.id).catch(() => undefined);
          toast.message("Attempt marked as abandoned. The session stays in your library.");
        }}
        aria-label="Abandon attempt"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/**
 * Phase 2 · item 3 — the in-session prop-firm watcher.
 *
 * Evaluates the session against its ruleset on every cursor move and ends it
 * the moment a rule breaks. All the maths lives in
 * `@/lib/replay/prop-challenge`, which in turn defers to the one canonical
 * evaluator; this hook owns only the two things a pure function cannot:
 *
 *   · the PEAK, which includes floating equity and therefore cannot be
 *     recovered from the trade tape after the fact, so it is carried here;
 *   · the one-shot, because a breach must end the session exactly once even
 *     though the evaluation keeps returning "failed" on every later tick.
 *
 * The clock is market time throughout. Nothing here reads `Date.now()`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  describeBreach,
  evaluateReplayChallenge,
  type ReplayChallengeEvaluation,
} from "@/lib/replay/prop-challenge";
import { useReplayStudio } from "./context";

export interface ChallengeBreach {
  field: string;
  detail: string;
  observed: number;
  limit: number;
  /** MARKET time the breach was detected at. */
  atMarketTime: number;
  equity: number;
  peakEquity: number;
}

export interface ChallengeMonitor {
  active: boolean;
  evaluation: ReplayChallengeEvaluation | null;
  /** Set once, and stays set — the session is over. */
  breach: ChallengeBreach | null;
  /** True until the trader dismisses the breach moment. */
  showBreach: boolean;
  acknowledge: () => void;
}

export function useChallengeMonitor(): ChallengeMonitor {
  const { challengeRules, startingBalance, trades, openPnl, view, finish } = useReplayStudio();
  const marketTime = view?.transport.marketTime ?? null;
  const lifecycle = view?.transport.lifecycle ?? null;

  const peakRef = useRef<number | null>(null);
  const [breach, setBreach] = useState<ChallengeBreach | null>(null);
  const [showBreach, setShowBreach] = useState(false);
  const endedRef = useRef(false);

  /**
   * Was the session already over when this mount began?
   *
   * Reopening a failed challenge must not throw the modal over the chart
   * again — the breach is history by then, and the trader is there to read the
   * tape. The envelope still renders its final state; only the moment is
   * suppressed. Captured on the first tick that reports a lifecycle at all,
   * because `view` is null while the engine boots.
   */
  const wasCompleteAtMount = useRef<boolean | null>(null);
  if (wasCompleteAtMount.current === null && lifecycle != null) {
    wasCompleteAtMount.current = lifecycle === "completed";
  }

  const active = challengeRules != null && startingBalance != null && marketTime != null;

  const evaluation = useMemo(() => {
    if (!active) return null;
    const result = evaluateReplayChallenge({
      rules: challengeRules!,
      startingBalance: startingBalance!,
      trades,
      openPnl,
      marketTime: marketTime!,
      peakEquity: peakRef.current,
    });
    // Monotonic by construction inside the evaluator; mirrored here so the
    // next tick starts from it.
    peakRef.current = result.peakEquity;
    return result;
  }, [active, challengeRules, startingBalance, trades, openPnl, marketTime]);

  useEffect(() => {
    if (!evaluation?.breached || endedRef.current) return;
    if (wasCompleteAtMount.current) {
      // Already finished before we got here: record that there is nothing to
      // fire, and leave the chart alone.
      endedRef.current = true;
      return;
    }
    const described = describeBreach(evaluation.progress);
    if (!described) return;

    // One shot. Later ticks keep reporting "failed"; the session only ends,
    // and the moment only fires, once.
    endedRef.current = true;
    setBreach({
      ...described,
      atMarketTime: marketTime ?? 0,
      equity: evaluation.equity,
      peakEquity: evaluation.peakEquity,
    });
    setShowBreach(true);
    finish();
  }, [evaluation, marketTime, finish]);

  const acknowledge = useCallback(() => setShowBreach(false), []);

  return { active, evaluation, breach, showBreach, acknowledge };
}

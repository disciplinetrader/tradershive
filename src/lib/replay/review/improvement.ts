/**
 * Phase 8D · Improvement Intelligence aggregation (pure).
 *
 * Turns the raw review feed (scores + comparison attempts + drills) into the
 * few statements a trader can act on. Evidence strength is delegated to
 * `evidenceLevel` — the same rule the Journal uses — so a two-session streak
 * is never presented as a proven skill.
 */

import { consistencyOf, evidenceLevel, mean, type Evidence } from "@/lib/journal/improvement";

export interface ScoreRow {
  id: string;
  session_id: string;
  score: number;
  discipline: number;
  risk: number;
  execution: number;
  patience: number;
  consistency: number;
  journal_completion: number;
  score_version?: number | null;
  created_at: string;
}

export interface ComparisonRow {
  id: string;
  session_id: string | null;
  attempt_number: number;
  mode: string;
  process_delta: number | null;
  outcome_delta: number | null;
  verdict: string | null;
  status: string;
  created_at: string;
}

export const SCORE_DIMENSIONS = [
  { key: "discipline", label: "Discipline" },
  { key: "risk", label: "Risk" },
  { key: "execution", label: "Execution" },
  { key: "patience", label: "Patience" },
  { key: "consistency", label: "Consistency" },
  { key: "journal_completion", label: "Journaling" },
] as const;

export type DimensionKey = (typeof SCORE_DIMENSIONS)[number]["key"];

export interface DimensionTrend {
  key: DimensionKey;
  label: string;
  recent: number | null;
  baseline: number | null;
  delta: number | null;
  evidence: Evidence;
}

export interface ImprovementView {
  /** Oldest → newest, ready to plot. */
  trend: { time: number; score: number }[];
  averageScore: number | null;
  recentScore: number | null;
  dimensions: DimensionTrend[];
  strengths: DimensionTrend[];
  weaknesses: DimensionTrend[];
  processDelta: number | null;
  outcomeDelta: number | null;
  attemptsMeasured: number;
  verdicts: { corrected: number; partial: number; repeated: number; untested: number };
  openDrills: number;
  /** Named honestly when a number is not measurable yet. */
  unknowns: string[];
}

const HALF = (n: number) => Math.max(1, Math.floor(n / 2));

export function buildImprovementView(input: {
  scores: readonly ScoreRow[];
  comparisons: readonly ComparisonRow[];
  openDrills?: number;
}): ImprovementView {
  const scores = [...input.scores].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
  const trend = scores.map((s) => ({ time: +new Date(s.created_at), score: Number(s.score) }));

  const unknowns: string[] = [];
  if (scores.length === 0) unknowns.push("No sessions scored yet — score a completed replay to start the trend.");

  const split = HALF(scores.length);
  const baselineRows = scores.slice(0, split);
  const recentRows = scores.length > 1 ? scores.slice(split) : scores;

  const dimensions: DimensionTrend[] = SCORE_DIMENSIONS.map(({ key, label }) => {
    const recentVals = recentRows.map((r) => Number(r[key]));
    const baseVals = baselineRows.map((r) => Number(r[key]));
    const recent = mean(recentVals);
    const baseline = scores.length > 1 ? mean(baseVals) : null;
    const lastAt = scores.length ? +new Date(scores[scores.length - 1].created_at) : null;
    return {
      key,
      label,
      recent,
      baseline,
      delta: recent != null && baseline != null ? recent - baseline : null,
      evidence: evidenceLevel({
        sample: scores.length,
        consistency: consistencyOf(scores.map((r) => Number(r[key]))),
        recencyDays: lastAt ? Math.round((Date.now() - lastAt) / 86_400_000) : null,
        completeness: 1,
      }),
    };
  });

  const ranked = [...dimensions].filter((d) => d.recent != null).sort((a, b) => (b.recent ?? 0) - (a.recent ?? 0));

  const measured = input.comparisons.filter((c) => c.status === "completed");
  const verdicts = { corrected: 0, partial: 0, repeated: 0, untested: 0 };
  for (const c of measured) {
    if (c.verdict === "corrected") verdicts.corrected += 1;
    else if (c.verdict === "partial") verdicts.partial += 1;
    else if (c.verdict === "repeated") verdicts.repeated += 1;
    else verdicts.untested += 1;
  }
  if (measured.length === 0) unknowns.push("No original-versus-replay comparison recorded yet.");

  return {
    trend,
    averageScore: mean(scores.map((s) => Number(s.score))),
    recentScore: scores.length ? Number(scores[scores.length - 1].score) : null,
    dimensions,
    strengths: ranked.slice(0, 2),
    weaknesses: ranked.slice(-2).reverse(),
    processDelta: mean(measured.map((c) => c.process_delta)),
    outcomeDelta: mean(measured.map((c) => c.outcome_delta)),
    attemptsMeasured: measured.length,
    verdicts,
    openDrills: input.openDrills ?? 0,
    unknowns,
  };
}

/**
 * JOURNAL X — PHASE 5 · Improvement Intelligence.
 *
 * Pure aggregation over the Phase 4 comparison rows. Nothing here fetches,
 * nothing here writes and nothing here invents a number: every value is
 * derived from data a comparison already produced (`breakdown.rows`,
 * `process_delta`, mistake verdicts, reflection) or from the journal entries
 * those comparisons point at.
 *
 * Two rules are enforced everywhere:
 *   1. A missing dimension is `null`, never 0. Means are taken over
 *      measurable values only — identical to Phase 4.
 *   2. Every derived insight carries its sample size and an evidence level,
 *      so a single lucky attempt can never read as mastery.
 */

import type { JournalEntry } from "@/lib/journal/api";
import type { Attempt } from "@/lib/journal/replay-attempts";
import { countsTowardAnalytics } from "@/lib/journal/metrics";
import {
  DIMENSIONS,
  type DeltaRow,
  type DimensionKey,
  type MistakeVerdict,
  type PracticeMode,
} from "@/lib/journal/replay-compare";
import { mistakeLabel, sessionLabel, setupLabel } from "@/lib/journal/story";

/* ------------------------------------------------------------------ */
/* Confidence / sample size                                            */
/* ------------------------------------------------------------------ */

export type Confidence = "insufficient" | "early" | "moderate" | "strong";

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  insufficient: "Insufficient evidence",
  early: "Early signal",
  moderate: "Moderate evidence",
  strong: "Strong evidence",
};

export const CONFIDENCE_SHORT: Record<Confidence, string> = {
  insufficient: "insufficient",
  early: "early",
  moderate: "moderate",
  strong: "strong",
};

export type Evidence = {
  level: Confidence;
  sample: number;
  why: string;
};

const DAY = 86_400_000;

/**
 * Evidence strength from four transparent inputs:
 *   • sample      — measurable attempts behind the number
 *   • consistency — 0..1, share of attempts pointing the same direction
 *   • recencyDays — days since the most recent measurable attempt
 *   • completeness— 0..1, share of the attempts that carried the dimension
 */
export function evidenceLevel(input: {
  sample: number;
  consistency?: number | null;
  recencyDays?: number | null;
  completeness?: number | null;
}): Evidence {
  const { sample } = input;
  const consistency = input.consistency ?? null;
  const recencyDays = input.recencyDays ?? null;
  const completeness = input.completeness ?? 1;

  if (sample <= 1) {
    return {
      level: "insufficient",
      sample,
      why: sample === 0 ? "No measurable attempts yet." : "Only one measurable attempt — a single result is not a trend.",
    };
  }
  if (sample < 3) {
    return { level: "early", sample, why: `${sample} measurable attempts — treat as a first signal, not a conclusion.` };
  }

  const stale = recencyDays != null && recencyDays > 45;
  const shaky = consistency != null && consistency < 0.6;
  const thin = completeness < 0.6;

  if (sample >= 8 && !stale && !shaky && !thin) {
    return { level: "strong", sample, why: `${sample} measurable attempts, consistent direction and recent practice.` };
  }
  if (sample >= 5 && !thin) {
    return {
      level: "moderate",
      sample,
      why: stale
        ? `${sample} measurable attempts, but the most recent is ${recencyDays} days old.`
        : shaky
          ? `${sample} measurable attempts with mixed direction.`
          : `${sample} measurable attempts.`,
    };
  }
  return {
    level: "early",
    sample,
    why: thin
      ? `${sample} attempts, but the data was incomplete on some of them.`
      : `${sample} measurable attempts — early signal only.`,
  };
}

/* ------------------------------------------------------------------ */
/* Small math helpers                                                  */
/* ------------------------------------------------------------------ */

const nums = (v: (number | null | undefined)[]): number[] => v.filter((x): x is number => typeof x === "number" && Number.isFinite(x));

export function mean(values: (number | null | undefined)[]): number | null {
  const v = nums(values);
  if (!v.length) return null;
  return v.reduce((s, x) => s + x, 0) / v.length;
}

export function meanRound(values: (number | null | undefined)[], digits = 0): number | null {
  const m = mean(values);
  if (m == null) return null;
  const p = 10 ** digits;
  return Math.round(m * p) / p;
}

/** Share of values agreeing with the sign of the mean. 1 = perfectly consistent. */
export function consistencyOf(values: (number | null | undefined)[]): number | null {
  const v = nums(values);
  if (v.length < 2) return null;
  const m = v.reduce((s, x) => s + x, 0) / v.length;
  if (m === 0) return 0.5;
  const agree = v.filter((x) => (x >= 0) === (m >= 0)).length;
  return agree / v.length;
}

const daysSince = (iso: string | null | undefined): number | null =>
  iso ? Math.max(0, Math.round((Date.now() - +new Date(iso)) / DAY)) : null;

/* ------------------------------------------------------------------ */
/* Attempt facts — the single normalized unit of Phase 5               */
/* ------------------------------------------------------------------ */

export type MistakeOutcome = { value: string; label: string; verdict: MistakeVerdict };

export type AttemptFacts = {
  id: string;
  entryId: string | null;
  attemptNumber: number;
  mode: PracticeMode | string;
  status: string;
  isBest: boolean;
  mistakeFocus: string | null;
  createdAt: string;
  completedAt: string | null;
  at: number;
  /** Per-dimension original/replay/delta, only where both sides were measurable. */
  dims: Partial<Record<DimensionKey, { original: number | null; replay: number | null; delta: number | null }>>;
  processOriginal: number | null;
  processReplay: number | null;
  processDelta: number | null;
  outcomeDelta: number | null;
  mistakes: MistakeOutcome[];
  introduced: MistakeOutcome[];
  hasReflection: boolean;
  /** Context copied from the original journal entry (never duplicated storage — read-time join). */
  setup: string | null;
  session: string | null;
  symbol: string | null;
  strategyId: string | null;
  entryOpenedAt: string | null;
};

type Breakdown = {
  rows?: DeltaRow[];
  mistakeRows?: { value: string; verdict: MistakeVerdict }[];
  introduced?: { value: string; verdict?: MistakeVerdict }[];
  processOriginal?: number | null;
  processReplay?: number | null;
  mistakes?: { correctedCount?: number; repeatedCount?: number };
};

const asBreakdown = (v: unknown): Breakdown => (v && typeof v === "object" && !Array.isArray(v) ? (v as Breakdown) : {});

/**
 * Normalizes a completed attempt into facts. Attempts that never completed are
 * kept (consistency needs them) but expose no dimensions.
 */
export function buildFacts(attempts: Attempt[], entries: Map<string, JournalEntry>): AttemptFacts[] {
  return attempts
    .map((a) => {
      const b = asBreakdown(a.breakdown);
      const entry = a.original_entry_id ? entries.get(a.original_entry_id) ?? null : null;
      const dims: AttemptFacts["dims"] = {};
      for (const row of b.rows ?? []) {
        if (!row?.key) continue;
        dims[row.key] = { original: row.original ?? null, replay: row.replay ?? null, delta: row.delta ?? null };
      }

      // Mistake verdicts: prefer the cached rows, fall back to the reflection
      // answer for attempts completed before the cache carried them.
      let mistakes: MistakeOutcome[] = (b.mistakeRows ?? []).map((m) => ({
        value: m.value,
        label: mistakeLabel(m.value),
        verdict: m.verdict,
      }));
      if (!mistakes.length && entry?.mistakes?.length) {
        const answer = a.reflectionObj?.original_mistake_avoided;
        const verdict: MistakeVerdict =
          answer === "yes" ? "corrected" : answer === "partly" ? "partial" : answer === "no" ? "repeated" : answer === "not_tested" ? "not_tested" : "insufficient";
        const replayTagged = new Set(a.reflectionObj?.mistakes ?? []);
        mistakes = entry.mistakes.map((value) => ({
          value,
          label: mistakeLabel(value),
          verdict: replayTagged.has(value) ? "repeated" : a.status === "completed" ? verdict : "insufficient",
        }));
      }

      const introduced: MistakeOutcome[] = (b.introduced ?? []).map((m) => ({
        value: m.value,
        label: mistakeLabel(m.value),
        verdict: "repeated",
      }));

      const reflection = a.reflectionObj ?? {};
      return {
        id: a.id,
        entryId: a.original_entry_id,
        attemptNumber: a.attempt_number ?? 1,
        mode: (a.mode as PracticeMode) ?? "standard",
        status: a.status ?? "in_progress",
        isBest: !!a.is_best,
        mistakeFocus: (a as { mistake_focus?: string | null }).mistake_focus ?? null,
        createdAt: a.created_at,
        completedAt: a.completed_at,
        at: +new Date(a.completed_at ?? a.created_at),
        dims,
        processOriginal: b.processOriginal ?? null,
        processReplay: b.processReplay ?? null,
        processDelta: a.process_delta == null ? null : Number(a.process_delta),
        outcomeDelta: a.outcome_delta == null ? null : Number(a.outcome_delta),
        mistakes,
        introduced,
        hasReflection: Object.values(reflection).some((v) => (Array.isArray(v) ? v.length > 0 : v != null && v !== "")),
        setup: entry?.setup ?? null,
        session: entry?.session ?? null,
        symbol: entry?.symbol ?? null,
        strategyId: entry?.strategy_id ?? null,
        entryOpenedAt: entry?.opened_at ?? entry?.created_at ?? null,
      } satisfies AttemptFacts;
    })
    .sort((x, y) => x.at - y.at);
}

export const completedFacts = (facts: AttemptFacts[]) => facts.filter((f) => f.status === "completed");

/* ------------------------------------------------------------------ */
/* 3 · Nine-dimension skill profile                                    */
/* ------------------------------------------------------------------ */

export type SkillRow = {
  key: DimensionKey;
  label: string;
  how: string;
  current: number | null;
  previous: number | null;
  delta: number | null;
  sample: number;
  evidence: Evidence;
  bestEvidence: string | null;
  drill: string;
  direction: "improving" | "declining" | "flat" | "unknown";
};

const DRILLS: Record<DimensionKey, string> = {
  plan_adherence: "Retry the plan exactly as written — no discretionary changes mid-trade.",
  risk_discipline: "Replay with a fixed stop and a fixed 1% risk before any entry is allowed.",
  entry_quality: "Blind replay — wait for the confirmation candle before entering.",
  exit_quality: "Practise holding until either the target or the invalidation is hit.",
  position_sizing: "Size every replay entry from the stop distance, not from conviction.",
  rule_compliance: "Run the checklist drill: every box ticked before the entry click.",
  management_quality: "One stop placement, one move to break-even, nothing else.",
  psychology_discipline: "Log the emotion before each entry, then replay the same setup calmly.",
  journaling_completeness: "Complete the reflection on the next three attempts before starting a new one.",
};

/**
 * Rolling profile. `window` attempts form the current period, the `window`
 * before that form the comparison period. Missing dimensions are excluded
 * from both means rather than counted as zero.
 */
export function skillProfile(facts: AttemptFacts[], window = 8): SkillRow[] {
  const done = completedFacts(facts);
  return DIMENSIONS.map((d) => {
    const measured = done.filter((f) => f.dims[d.key]?.replay != null);
    const recent = measured.slice(-window);
    const prior = measured.slice(Math.max(0, measured.length - window * 2), Math.max(0, measured.length - window));

    const current = meanRound(recent.map((f) => f.dims[d.key]?.replay ?? null));
    const previous = prior.length ? meanRound(prior.map((f) => f.dims[d.key]?.replay ?? null)) : null;
    const delta = current != null && previous != null ? Math.round(current - previous) : null;

    const deltas = measured.map((f) => f.dims[d.key]?.delta ?? null);
    const evidence = evidenceLevel({
      sample: measured.length,
      consistency: consistencyOf(deltas),
      recencyDays: daysSince(measured[measured.length - 1]?.completedAt ?? null),
      completeness: done.length ? measured.length / done.length : 0,
    });

    const last = measured[measured.length - 1];
    const lastDelta = last?.dims[d.key]?.delta ?? null;
    const bestEvidence = last
      ? `Attempt ${last.attemptNumber}${last.setup ? ` · ${setupLabel(last.setup)}` : ""}: ${last.dims[d.key]?.original ?? "—"} → ${last.dims[d.key]?.replay ?? "—"}${lastDelta == null ? "" : ` (${lastDelta > 0 ? "+" : ""}${lastDelta})`}`
      : null;

    const direction: SkillRow["direction"] =
      evidence.level === "insufficient" || delta == null ? "unknown" : delta >= 4 ? "improving" : delta <= -4 ? "declining" : "flat";

    return {
      key: d.key,
      label: d.label,
      how: d.how,
      current,
      previous,
      delta,
      sample: measured.length,
      evidence,
      bestEvidence,
      drill: DRILLS[d.key],
      direction,
    };
  });
}

export const SKILL_DRILL = DRILLS;

/* ------------------------------------------------------------------ */
/* 4 · Mistake recurrence                                              */
/* ------------------------------------------------------------------ */

export type MistakeSource = "user" | "rule" | "ai";

/** Mistakes proved or disproved by executed replay evidence rather than self-report. */
const RULE_DETECTED = new Set(["no_stop_loss", "moved_stop_loss", "over_leveraged", "poor_risk_mgmt", "overtrading"]);

export type MistakeRecurrenceRow = {
  value: string;
  label: string;
  source: MistakeSource;
  confirmed: boolean;
  originalCount: number;
  tests: number;
  corrected: number;
  repeated: number;
  partial: number;
  notTested: number;
  recurrenceRate: number | null;
  trend: "improving" | "worsening" | "flat" | "unknown";
  setups: string[];
  /** Mean process-score gap between trades carrying this mistake and the rest. */
  processCost: number | null;
  lastSeen: string | null;
  evidence: Evidence;
};

/** AI-detected mistakes stay unconfirmed until the trader tags them. */
function aiSuggested(entries: JournalEntry[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of entries) {
    const raw = e.ai_mistake_detection as unknown;
    const list = Array.isArray(raw)
      ? raw
      : raw && typeof raw === "object" && Array.isArray((raw as { mistakes?: unknown[] }).mistakes)
        ? (raw as { mistakes: unknown[] }).mistakes
        : [];
    for (const item of list) {
      const value = typeof item === "string" ? item : (item as { value?: string; id?: string })?.value ?? (item as { id?: string })?.id;
      if (!value) continue;
      if ((e.mistakes ?? []).includes(value)) continue; // already user-confirmed
      out.set(value, (out.get(value) ?? 0) + 1);
    }
  }
  return out;
}

export function mistakeRecurrence(facts: AttemptFacts[], entries: JournalEntry[]): MistakeRecurrenceRow[] {
  const live = entries.filter(countsTowardAnalytics);
  const done = completedFacts(facts);

  // Process-cost baseline: mean of the original-side process score per entry.
  const processByEntry = new Map<string, number>();
  for (const f of done) if (f.entryId && f.processOriginal != null) processByEntry.set(f.entryId, f.processOriginal);
  const overall = mean([...processByEntry.values()]);

  const values = new Set<string>();
  for (const e of live) for (const v of e.mistakes ?? []) values.add(v);
  for (const f of done) for (const m of f.mistakes) values.add(m.value);
  for (const f of done) for (const m of f.introduced) values.add(m.value);
  const ai = aiSuggested(live);
  for (const v of ai.keys()) values.add(v);

  const rows: MistakeRecurrenceRow[] = [];
  for (const value of values) {
    const carrying = live.filter((e) => (e.mistakes ?? []).includes(value));
    const confirmed = carrying.length > 0;
    const tested = done.filter((f) => f.mistakes.some((m) => m.value === value));
    const verdicts = tested.map((f) => f.mistakes.find((m) => m.value === value)!.verdict);

    const corrected = verdicts.filter((v) => v === "corrected").length;
    const repeated = verdicts.filter((v) => v === "repeated").length;
    const partial = verdicts.filter((v) => v === "partial").length;
    const notTested = verdicts.filter((v) => v === "not_tested" || v === "insufficient").length;
    const decided = corrected + repeated + partial;

    // Trend: the three most recent decided verdicts against everything before.
    const decidedFacts = tested.filter((f) => {
      const v = f.mistakes.find((m) => m.value === value)!.verdict;
      return v === "corrected" || v === "repeated" || v === "partial";
    });
    const score = (f: AttemptFacts) => {
      const v = f.mistakes.find((m) => m.value === value)!.verdict;
      return v === "corrected" ? 1 : v === "partial" ? 0.5 : 0;
    };
    const recent = decidedFacts.slice(-3);
    const earlier = decidedFacts.slice(0, Math.max(0, decidedFacts.length - 3));
    const recentScore = mean(recent.map(score));
    const earlierScore = mean(earlier.map(score));
    const trend: MistakeRecurrenceRow["trend"] =
      recentScore == null || earlierScore == null || decidedFacts.length < 3
        ? "unknown"
        : recentScore - earlierScore > 0.15
          ? "improving"
          : recentScore - earlierScore < -0.15
            ? "worsening"
            : "flat";

    const withScores = carrying.map((e) => processByEntry.get(e.id) ?? null);
    const withMean = mean(withScores);
    const processCost = withMean != null && overall != null ? Math.round(withMean - overall) : null;

    const setups = [...new Set(carrying.map((e) => e.setup).filter((s): s is string => !!s))].slice(0, 3);
    const lastSeen =
      carrying
        .map((e) => e.opened_at ?? e.created_at)
        .filter(Boolean)
        .sort()
        .pop() ?? null;

    rows.push({
      value,
      label: mistakeLabel(value),
      source: confirmed ? (RULE_DETECTED.has(value) ? "rule" : "user") : "ai",
      confirmed,
      originalCount: carrying.length,
      tests: tested.length,
      corrected,
      repeated,
      partial,
      notTested,
      recurrenceRate: decided ? (repeated + partial * 0.5) / decided : null,
      trend,
      setups,
      processCost,
      lastSeen,
      evidence: evidenceLevel({
        sample: decided,
        consistency: consistencyOf(decidedFacts.map((f) => (score(f) >= 0.5 ? 1 : -1))),
        recencyDays: daysSince(tested[tested.length - 1]?.completedAt ?? null),
        completeness: tested.length ? decided / tested.length : 0,
      }),
    });
  }

  return rows.sort((a, b) => b.originalCount * 2 + b.repeated - (a.originalCount * 2 + a.repeated));
}

/* ------------------------------------------------------------------ */
/* 5 · Drill effectiveness                                             */
/* ------------------------------------------------------------------ */

export type DrillVerdict = "effective" | "promising" | "no_change" | "inconsistent" | "insufficient";

export const DRILL_VERDICT_LABEL: Record<DrillVerdict, string> = {
  effective: "Effective",
  promising: "Promising",
  no_change: "No measurable change",
  inconsistent: "Inconsistent",
  insufficient: "Insufficient evidence",
};

export type DrillRow = {
  key: string;
  label: string;
  mode: PracticeMode | string;
  targetMistake: string | null;
  attempts: number;
  avgProcessDelta: number | null;
  corrected: number;
  repeated: number;
  introduced: number;
  consistency: number | null;
  outcomeIndependent: boolean;
  verdict: DrillVerdict;
  why: string;
  evidence: Evidence;
  lastRun: string | null;
};

/** A drill is one (replay mode × target mistake) pairing. */
export function drillEffectiveness(facts: AttemptFacts[]): DrillRow[] {
  const done = completedFacts(facts);
  const groups = new Map<string, AttemptFacts[]>();
  for (const f of done) {
    const target = f.mistakeFocus ?? f.mistakes[0]?.value ?? null;
    const key = `${f.mode}::${target ?? "general"}`;
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }

  const rows: DrillRow[] = [];
  for (const [key, group] of groups) {
    const [mode, target] = key.split("::");
    const targetMistake = target === "general" ? null : target;
    const deltas = group.map((f) => f.processDelta);
    const avg = meanRound(deltas, 1);
    const consistency = consistencyOf(deltas);

    const relevant = (f: AttemptFacts) => (targetMistake ? f.mistakes.filter((m) => m.value === targetMistake) : f.mistakes);
    const corrected = group.reduce((s, f) => s + relevant(f).filter((m) => m.verdict === "corrected").length, 0);
    const repeated = group.reduce((s, f) => s + relevant(f).filter((m) => m.verdict === "repeated").length, 0);
    const introduced = group.reduce((s, f) => s + f.introduced.length, 0);

    // Outcome independence: process improved without leaning on a better P/L.
    const outcomeIndependent = group.some((f) => (f.processDelta ?? 0) > 0 && (f.outcomeDelta ?? 0) <= 0);

    const evidence = evidenceLevel({
      sample: group.length,
      consistency,
      recencyDays: daysSince(group[group.length - 1]?.completedAt ?? null),
      completeness: group.filter((f) => f.processDelta != null).length / group.length,
    });

    let verdict: DrillVerdict;
    let why: string;
    if (group.length < 2 || avg == null) {
      verdict = "insufficient";
      why = group.length < 2 ? "One attempt cannot show whether a drill works. Run it again." : "No measurable process delta was captured.";
    } else if (consistency != null && consistency < 0.6) {
      verdict = "inconsistent";
      why = `Process delta swings between attempts (${Math.round(consistency * 100)}% agree on direction).`;
    } else if (avg >= 6 && corrected > repeated && introduced === 0 && group.length >= 3) {
      verdict = "effective";
      why = `Average process delta ${avg > 0 ? "+" : ""}${avg} across ${group.length} attempts, ${corrected} correction${corrected === 1 ? "" : "s"} and no new mistakes.`;
    } else if (avg >= 3 || corrected > repeated) {
      verdict = "promising";
      why = `Average process delta ${avg > 0 ? "+" : ""}${avg} over ${group.length} attempts — moving the right way, needs more reps.`;
    } else {
      verdict = "no_change";
      why = `Average process delta ${avg > 0 ? "+" : ""}${avg} over ${group.length} attempts — this drill is not shifting the score.`;
    }

    rows.push({
      key,
      label: `${modeLabel(mode)}${targetMistake ? ` · ${mistakeLabel(targetMistake)}` : ""}`,
      mode,
      targetMistake,
      attempts: group.length,
      avgProcessDelta: avg,
      corrected,
      repeated,
      introduced,
      consistency,
      outcomeIndependent,
      verdict,
      why,
      evidence,
      lastRun: group[group.length - 1]?.completedAt ?? null,
    });
  }

  const rank: Record<DrillVerdict, number> = { effective: 0, promising: 1, inconsistent: 2, no_change: 3, insufficient: 4 };
  return rows.sort((a, b) => rank[a.verdict] - rank[b.verdict] || b.attempts - a.attempts);
}

export function modeLabel(mode: string): string {
  return mode === "retry_plan" ? "Retry plan" : mode === "mistake_drill" ? "Mistake drill" : mode === "blind" ? "Blind replay" : "Standard replay";
}

/* ------------------------------------------------------------------ */
/* Generic grouped improvement (setup / session / symbol / playbook)   */
/* ------------------------------------------------------------------ */

export type GroupRow = {
  key: string;
  label: string;
  attempts: number;
  avgProcessDelta: number | null;
  planDelta: number | null;
  riskDelta: number | null;
  bestAttemptRate: number | null;
  evidence: Evidence;
};

export function groupImprovement(
  facts: AttemptFacts[],
  pick: (f: AttemptFacts) => string | null,
  label: (key: string) => string,
): GroupRow[] {
  const done = completedFacts(facts);
  const groups = new Map<string, AttemptFacts[]>();
  for (const f of done) {
    const k = pick(f);
    if (!k) continue;
    groups.set(k, [...(groups.get(k) ?? []), f]);
  }
  return [...groups.entries()]
    .map(([key, group]) => {
      const deltas = group.map((f) => f.processDelta);
      return {
        key,
        label: label(key),
        attempts: group.length,
        avgProcessDelta: meanRound(deltas, 1),
        planDelta: meanRound(group.map((f) => f.dims.plan_adherence?.delta ?? null), 1),
        riskDelta: meanRound(group.map((f) => f.dims.risk_discipline?.delta ?? null), 1),
        bestAttemptRate: group.length ? group.filter((f) => f.isBest).length / group.length : null,
        evidence: evidenceLevel({
          sample: group.length,
          consistency: consistencyOf(deltas),
          recencyDays: daysSince(group[group.length - 1]?.completedAt ?? null),
        }),
      };
    })
    .sort((a, b) => b.attempts - a.attempts);
}

/* ------------------------------------------------------------------ */
/* 6 · Setup improvement                                               */
/* ------------------------------------------------------------------ */

export type SetupFlag = "results_good_process_weak" | "results_weak_process_improving" | "no_transfer" | null;

export type SetupRow = GroupRow & {
  originalTrades: number;
  winRate: number | null;
  processScore: number | null;
  commonMistake: string | null;
  correctedMistake: string | null;
  bestDrill: string | null;
  flag: SetupFlag;
  flagNote: string | null;
};

export function setupImprovement(facts: AttemptFacts[], entries: JournalEntry[], transfer: TransferRow[]): SetupRow[] {
  const live = entries.filter(countsTowardAnalytics);
  const base = groupImprovement(facts, (f) => f.setup, setupLabel);
  const done = completedFacts(facts);
  const drills = drillEffectiveness(facts);

  return base.map((g) => {
    const trades = live.filter((e) => e.setup === g.key);
    const closed = trades.filter((e) => e.pnl != null);
    const winRate = closed.length ? closed.filter((e) => Number(e.pnl) > 0).length / closed.length : null;
    const group = done.filter((f) => f.setup === g.key);
    const processScore = meanRound(group.map((f) => f.processOriginal));

    const counts = new Map<string, number>();
    for (const e of trades) for (const m of e.mistakes ?? []) counts.set(m, (counts.get(m) ?? 0) + 1);
    const commonMistake = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    const correctedCounts = new Map<string, number>();
    for (const f of group) for (const m of f.mistakes) if (m.verdict === "corrected") correctedCounts.set(m.value, (correctedCounts.get(m.value) ?? 0) + 1);
    const correctedMistake = [...correctedCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    const setupDrill = drills.find((d) => group.some((f) => `${f.mode}::${f.mistakeFocus ?? f.mistakes[0]?.value ?? "general"}` === d.key) && (d.verdict === "effective" || d.verdict === "promising"));

    let flag: SetupFlag = null;
    let flagNote: string | null = null;
    const noTransfer = transfer.find((t) => t.setup === g.key && t.verdict === "none");
    if (winRate != null && winRate >= 0.55 && processScore != null && processScore < 60 && closed.length >= 3) {
      flag = "results_good_process_weak";
      flagNote = `Results look healthy (${Math.round(winRate * 100)}% win rate, n=${closed.length}) while the process score sits at ${processScore}. The edge here may not be repeatable.`;
    } else if (winRate != null && winRate < 0.45 && (g.avgProcessDelta ?? 0) > 3 && g.attempts >= 2) {
      flag = "results_weak_process_improving";
      flagNote = `Live results are weak but practice process is improving (${g.avgProcessDelta! > 0 ? "+" : ""}${g.avgProcessDelta} avg delta over ${g.attempts} attempts). Keep the reps going before judging the setup.`;
    } else if (noTransfer) {
      flag = "no_transfer";
      flagNote = noTransfer.note;
    }

    return {
      ...g,
      originalTrades: trades.length,
      winRate,
      processScore,
      commonMistake,
      correctedMistake,
      bestDrill: setupDrill?.label ?? null,
      flag,
      flagNote,
    };
  });
}

/* ------------------------------------------------------------------ */
/* 7 · Live-to-replay transfer                                         */
/* ------------------------------------------------------------------ */

export type TransferVerdict = "observed" | "none" | "insufficient";

export type TransferRow = {
  key: string;
  setup: string | null;
  mistake: string;
  label: string;
  practisedAt: string;
  comparableBefore: number;
  comparableAfter: number;
  rateBefore: number | null;
  rateAfter: number | null;
  processBefore: number | null;
  processAfter: number | null;
  verdict: TransferVerdict;
  note: string;
  evidence: Evidence;
};

const TRANSFER_WINDOW_DAYS = 60;

/**
 * Rule-based matching only — same setup, same mistake category, and a defined
 * window after the drill. Correlation is reported, never causation.
 */
export function transferAnalysis(facts: AttemptFacts[], entries: JournalEntry[], windowDays = TRANSFER_WINDOW_DAYS): TransferRow[] {
  const live = entries
    .filter(countsTowardAnalytics)
    .map((e) => ({ e, at: +new Date(e.opened_at ?? e.created_at) }))
    .sort((a, b) => a.at - b.at);
  const done = completedFacts(facts);

  const drills = new Map<string, AttemptFacts[]>();
  for (const f of done) {
    const target = f.mistakeFocus ?? f.mistakes[0]?.value ?? null;
    if (!target) continue;
    const key = `${f.setup ?? "any"}::${target}`;
    drills.set(key, [...(drills.get(key) ?? []), f]);
  }

  const rows: TransferRow[] = [];
  for (const [key, group] of drills) {
    const last = group[group.length - 1];
    const target = key.split("::")[1];
    const at = last.at;
    const matches = live.filter(({ e }) => (last.setup ? e.setup === last.setup : true));
    const before = matches.filter((m) => m.at < at).slice(-8);
    const after = matches.filter((m) => m.at > at && m.at <= at + windowDays * DAY);

    const rate = (list: typeof before) => (list.length ? list.filter(({ e }) => (e.mistakes ?? []).includes(target)).length / list.length : null);
    const rateBefore = rate(before);
    const rateAfter = rate(after);

    const scoreOf = (list: typeof before) =>
      meanRound(
        list.map(({ e }) => {
          const checklist = Array.isArray(e.checklist) ? (e.checklist as { checked?: boolean }[]) : [];
          if (checklist.length) return Math.round((checklist.filter((c) => c.checked).length / checklist.length) * 100);
          return Math.max(0, 100 - (e.mistakes?.length ?? 0) * 20);
        }),
      );

    let verdict: TransferVerdict;
    let note: string;
    if (after.length < 2 || rateBefore == null || rateAfter == null) {
      verdict = "insufficient";
      note = after.length
        ? `Only ${after.length} comparable trade${after.length === 1 ? "" : "s"} logged since this drill — not enough to say anything yet.`
        : "No comparable live trade logged since this drill yet.";
    } else if (rateAfter < rateBefore - 0.15) {
      verdict = "observed";
      note = `Improvement observed after practice: ${mistakeLabel(target)} appeared in ${Math.round(rateBefore * 100)}% of comparable trades before the drill and ${Math.round(rateAfter * 100)}% after (n=${after.length}). This is a correlation, not proof.`;
    } else {
      verdict = "none";
      note = `No transfer detected yet: ${mistakeLabel(target)} still appears in ${Math.round(rateAfter * 100)}% of comparable trades since the drill (n=${after.length}).`;
    }

    rows.push({
      key,
      setup: last.setup,
      mistake: target,
      label: `${last.setup ? setupLabel(last.setup) : "Any setup"} · ${mistakeLabel(target)}`,
      practisedAt: last.completedAt ?? last.createdAt,
      comparableBefore: before.length,
      comparableAfter: after.length,
      rateBefore,
      rateAfter,
      processBefore: scoreOf(before),
      processAfter: scoreOf(after),
      verdict,
      note,
      evidence: evidenceLevel({ sample: after.length, recencyDays: daysSince(last.completedAt) }),
    });
  }

  return rows.sort((a, b) => +new Date(b.practisedAt) - +new Date(a.practisedAt));
}

/* ------------------------------------------------------------------ */
/* 8 · Practice consistency                                            */
/* ------------------------------------------------------------------ */

export type WeekBucket = { week: string; attempts: number; completed: number };

export type Consistency = {
  perWeek: WeekBucket[];
  attemptsPerWeek: number | null;
  completed: number;
  abandoned: number;
  inProgress: number;
  completionRate: number | null;
  repeatedDrills: number;
  medianDaysMistakeToPractice: number | null;
  medianDaysBetweenAttempts: number | null;
  reflectionRate: number | null;
  nextActionRate: number | null;
};

const median = (v: number[]): number | null => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

function weekKey(ms: number): string {
  const d = new Date(ms);
  const day = (d.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return monday.toISOString().slice(0, 10);
}

export function practiceConsistency(
  facts: AttemptFacts[],
  homework: { status: string }[] = [],
  weeks = 8,
): Consistency {
  const now = Date.now();
  const perWeek: WeekBucket[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const key = weekKey(now - i * 7 * DAY);
    const inWeek = facts.filter((f) => weekKey(f.at) === key);
    perWeek.push({ week: key, attempts: inWeek.length, completed: inWeek.filter((f) => f.status === "completed").length });
  }

  const completed = facts.filter((f) => f.status === "completed").length;
  const abandoned = facts.filter((f) => f.status === "abandoned").length;
  const inProgress = facts.filter((f) => f.status === "in_progress").length;

  const byEntry = new Map<string, number>();
  for (const f of facts) if (f.entryId) byEntry.set(f.entryId, (byEntry.get(f.entryId) ?? 0) + 1);
  const repeatedDrills = [...byEntry.values()].filter((n) => n > 1).length;

  const lag = facts
    .filter((f) => f.entryOpenedAt)
    .map((f) => Math.round((f.at - +new Date(f.entryOpenedAt!)) / DAY))
    .filter((d) => d >= 0);

  const gaps: number[] = [];
  const sorted = [...facts].sort((a, b) => a.at - b.at);
  for (let i = 1; i < sorted.length; i++) gaps.push(Math.round((sorted[i].at - sorted[i - 1].at) / DAY));

  const done = facts.filter((f) => f.status === "completed");
  const accepted = homework.filter((h) => h.status !== "suggested" && h.status !== "dismissed");

  return {
    perWeek,
    attemptsPerWeek: perWeek.length ? Math.round((perWeek.reduce((s, w) => s + w.attempts, 0) / perWeek.length) * 10) / 10 : null,
    completed,
    abandoned,
    inProgress,
    completionRate: facts.length ? completed / facts.length : null,
    repeatedDrills,
    medianDaysMistakeToPractice: median(lag),
    medianDaysBetweenAttempts: median(gaps),
    reflectionRate: done.length ? done.filter((f) => f.hasReflection).length / done.length : null,
    nextActionRate: accepted.length ? accepted.filter((h) => h.status === "completed").length / accepted.length : null,
  };
}

/* ------------------------------------------------------------------ */
/* 9 · Next-best drill engine                                          */
/* ------------------------------------------------------------------ */

export type DrillRecommendation = {
  id: string;
  score: number;
  skill: DimensionKey | null;
  skillLabel: string;
  entryId: string | null;
  entryLabel: string | null;
  setup: string | null;
  mode: PracticeMode;
  mistake: string | null;
  mistakeLabel: string | null;
  title: string;
  reason: string;
  evidence: string[];
  target: string;
  confidence: Confidence;
};

const MODE_FOR_SKILL: Partial<Record<DimensionKey, PracticeMode>> = {
  plan_adherence: "retry_plan",
  risk_discipline: "retry_plan",
  entry_quality: "blind",
  exit_quality: "standard",
  position_sizing: "retry_plan",
  rule_compliance: "retry_plan",
  management_quality: "standard",
  psychology_discipline: "blind",
  journaling_completeness: "standard",
};

const TARGET_FOR_SKILL: Partial<Record<DimensionKey, string>> = {
  plan_adherence: "Plan adherence ≥ 80 on the next attempt.",
  risk_discipline: "A defined stop and risk ≤ 1% before entry.",
  entry_quality: "Entry efficiency above your current rolling score.",
  exit_quality: "Hold to target or invalidation — exit efficiency ≥ 70.",
  position_sizing: "Position size derived from stop distance, risk ≤ 1%.",
  rule_compliance: "Every checklist item ticked before the entry.",
  management_quality: "At most one stop adjustment for the whole trade.",
  psychology_discipline: "No negative emotion tags on the attempt.",
  journaling_completeness: "Reflection completed within the same session.",
};

/**
 * Deterministic ranking. Score is a transparent weighted sum:
 *
 *   frequency×12 + processCost + recurrence×25 + recency + relevance
 *   − mastery evidence − prior drill success
 */
export function nextBestDrills(input: {
  facts: AttemptFacts[];
  entries: JournalEntry[];
  mistakes: MistakeRecurrenceRow[];
  skills: SkillRow[];
  drills: DrillRow[];
  limit?: number;
}): DrillRecommendation[] {
  const { facts, entries, mistakes, skills, drills } = input;
  const live = entries.filter(countsTowardAnalytics);
  const out: DrillRecommendation[] = [];

  const skillFor = (mistakeValue: string): DimensionKey => {
    if (["no_stop_loss", "over_leveraged", "poor_risk_mgmt"].includes(mistakeValue)) return "risk_discipline";
    if (["moved_stop_loss", "early_exit", "no_exit_plan"].includes(mistakeValue)) return "management_quality";
    if (["chasing", "fomo_entry", "early_entry"].includes(mistakeValue)) return "entry_quality";
    if (["late_exit", "greed", "cut_winner"].includes(mistakeValue)) return "exit_quality";
    if (["revenge_trade", "overtrading", "emotional"].includes(mistakeValue)) return "psychology_discipline";
    return "plan_adherence";
  };

  for (const m of mistakes) {
    if (!m.confirmed) continue; // AI-suggested mistakes never auto-become drills
    const candidates = live
      .filter((e) => (e.mistakes ?? []).includes(m.value))
      .sort((a, b) => +new Date(b.opened_at ?? b.created_at) - +new Date(a.opened_at ?? a.created_at));
    const trade = candidates[0] ?? null;
    if (!trade) continue;

    const skill = skillFor(m.value);
    const skillRow = skills.find((s) => s.key === skill) ?? null;
    const priorDrill = drills.find((d) => d.targetMistake === m.value);

    const frequency = m.originalCount * 12;
    const cost = m.processCost != null && m.processCost < 0 ? Math.min(30, Math.abs(m.processCost)) : 0;
    const recurrence = (m.recurrenceRate ?? 0.5) * 25;
    const recencyDays = daysSince(m.lastSeen);
    const recency = recencyDays == null ? 0 : recencyDays <= 7 ? 20 : recencyDays <= 30 ? 10 : 0;
    const relevance = Math.min(15, candidates.length * 3);
    const mastery = m.evidence.level === "strong" && (m.recurrenceRate ?? 1) < 0.25 ? 45 : m.corrected >= 2 && m.repeated === 0 ? 25 : 0;
    const drillPenalty = priorDrill?.verdict === "effective" ? 25 : priorDrill?.verdict === "no_change" ? -10 : 0;
    const score = Math.round(frequency + cost + recurrence + recency + relevance - mastery - drillPenalty);

    const evidence: string[] = [
      `${m.originalCount} logged trade${m.originalCount === 1 ? "" : "s"} carry this mistake.`,
      m.tests ? `${m.corrected} corrected / ${m.repeated} repeated across ${m.tests} replay test${m.tests === 1 ? "" : "s"}.` : "Never tested in a replay attempt.",
    ];
    if (m.processCost != null && m.processCost < 0) evidence.push(`Trades with this mistake score ${Math.abs(m.processCost)} points lower on process.`);
    if (skillRow?.current != null) evidence.push(`${skillRow.label} rolling score ${skillRow.current} (n=${skillRow.sample}).`);
    if (priorDrill) evidence.push(`Previous drill verdict: ${DRILL_VERDICT_LABEL[priorDrill.verdict].toLowerCase()}.`);

    const mode = m.tests === 0 ? "mistake_drill" : MODE_FOR_SKILL[skill] ?? "retry_plan";

    out.push({
      id: `mistake:${m.value}`,
      score,
      skill,
      skillLabel: skills.find((s) => s.key === skill)?.label ?? "Process",
      entryId: trade.id,
      entryLabel: `${trade.symbol ?? "Trade"}${trade.setup ? ` · ${setupLabel(trade.setup)}` : ""}`,
      setup: trade.setup,
      mode,
      mistake: m.value,
      mistakeLabel: m.label,
      title: drillTitle(mode, m.value),
      reason:
        m.tests === 0
          ? `${m.label} appears in ${m.originalCount} trade${m.originalCount === 1 ? "" : "s"} and has never been tested in a replay.`
          : `${m.label} still recurs in ${Math.round((m.recurrenceRate ?? 0) * 100)}% of decided replay tests.`,
      evidence,
      target: TARGET_FOR_SKILL[skill] ?? "Beat your current rolling process score.",
      confidence: m.evidence.level,
    });
  }

  // A declining or untested skill with no mistake attached still deserves a drill.
  for (const s of skills) {
    if (s.direction !== "declining" && !(s.sample === 0 && completedFacts(facts).length >= 2)) continue;
    if (out.some((r) => r.skill === s.key)) continue;
    const trade = live.find((e) => e.setup) ?? live[0] ?? null;
    out.push({
      id: `skill:${s.key}`,
      score: s.direction === "declining" ? 40 : 18,
      skill: s.key,
      skillLabel: s.label,
      entryId: trade?.id ?? null,
      entryLabel: trade ? `${trade.symbol ?? "Trade"}${trade.setup ? ` · ${setupLabel(trade.setup)}` : ""}` : null,
      setup: trade?.setup ?? null,
      mode: MODE_FOR_SKILL[s.key] ?? "standard",
      mistake: null,
      mistakeLabel: null,
      title: SKILL_DRILL[s.key],
      reason:
        s.direction === "declining"
          ? `${s.label} dropped ${Math.abs(s.delta ?? 0)} points versus the previous period (n=${s.sample}).`
          : `${s.label} has never been measurable in a replay attempt.`,
      evidence: [s.evidence.why, s.bestEvidence ?? "No measured attempt for this dimension yet."],
      target: TARGET_FOR_SKILL[s.key] ?? "Make this dimension measurable on the next attempt.",
      confidence: s.evidence.level,
    });
  }

  return out.sort((a, b) => b.score - a.score).slice(0, input.limit ?? 4);
}

function drillTitle(mode: PracticeMode | string, mistake: string): string {
  const label = mistakeLabel(mistake).toLowerCase();
  if (mode === "blind") return `Replay this trade blind and wait for confirmation before entering (${label}).`;
  if (mode === "retry_plan") return `Retry this setup with fixed risk and the original plan (${label}).`;
  if (mode === "mistake_drill") return `Run a focused drill on ${label}.`;
  return `Replay this trade and hold until target or invalidation (${label}).`;
}

/* ------------------------------------------------------------------ */
/* 12 · Playbook / rule intelligence preparation                       */
/* ------------------------------------------------------------------ */

export type RuleRow = {
  label: string;
  broken: number;
  corrected: number;
  repeated: number;
  adherence: number | null;
  setups: string[];
};

/**
 * Interim rule aggregation from the checklist stored on each entry. A proper
 * per-rule expectancy model needs its own schema — see README for Phase 6.
 */
export function ruleIntelligence(entries: JournalEntry[], facts: AttemptFacts[]): RuleRow[] {
  const live = entries.filter(countsTowardAnalytics);
  const map = new Map<string, { broken: number; total: number; setups: Set<string> }>();
  for (const e of live) {
    const checklist = Array.isArray(e.checklist) ? (e.checklist as { label?: string; checked?: boolean }[]) : [];
    for (const item of checklist) {
      if (!item?.label) continue;
      const row = map.get(item.label) ?? { broken: 0, total: 0, setups: new Set<string>() };
      row.total += 1;
      if (!item.checked) row.broken += 1;
      if (e.setup) row.setups.add(e.setup);
      map.set(item.label, row);
    }
  }

  const done = completedFacts(facts);
  const corrected = done.filter((f) => (f.dims.rule_compliance?.delta ?? 0) > 0).length;
  const repeated = done.filter((f) => (f.dims.rule_compliance?.delta ?? 0) < 0).length;

  return [...map.entries()]
    .map(([label, r]) => ({
      label,
      broken: r.broken,
      corrected,
      repeated,
      adherence: r.total ? Math.round(((r.total - r.broken) / r.total) * 100) : null,
      setups: [...r.setups].slice(0, 3).map(setupLabel),
    }))
    .filter((r) => r.broken > 0)
    .sort((a, b) => b.broken - a.broken)
    .slice(0, 8);
}

/* ------------------------------------------------------------------ */
/* 1 · Journal overview roll-up                                        */
/* ------------------------------------------------------------------ */

export type OverviewSummary = {
  attempts: number;
  completed: number;
  avgProcessDelta: number | null;
  improving: SkillRow[];
  declining: SkillRow[];
  mostCorrected: MistakeRecurrenceRow | null;
  mostRepeated: MistakeRecurrenceRow | null;
  currentDrill: DrillRow | null;
  attemptsPerWeek: number | null;
  evidence: Evidence;
  recommendation: DrillRecommendation | null;
  series: { at: number; delta: number }[];
};

export type Rollup = {
  facts: AttemptFacts[];
  skills: SkillRow[];
  mistakes: MistakeRecurrenceRow[];
  drills: DrillRow[];
  transfer: TransferRow[];
  setups: SetupRow[];
  sessions: GroupRow[];
  symbols: GroupRow[];
  playbooks: GroupRow[];
  byMistake: GroupRow[];
  consistency: Consistency;
  rules: RuleRow[];
  recommendations: DrillRecommendation[];
  overview: OverviewSummary;
};

/** One computation for every Phase 5 surface — never recomputed differently per page. */
export function buildRollup(input: {
  attempts: Attempt[];
  entries: JournalEntry[];
  homework?: { status: string }[];
  playbookName?: (id: string) => string;
}): Rollup {
  const entryMap = new Map(input.entries.map((e) => [e.id, e]));
  const facts = buildFacts(input.attempts, entryMap);
  const skills = skillProfile(facts);
  const mistakes = mistakeRecurrence(facts, input.entries);
  const drills = drillEffectiveness(facts);
  const transfer = transferAnalysis(facts, input.entries);
  const setups = setupImprovement(facts, input.entries, transfer);
  const sessions = groupImprovement(facts, (f) => f.session, sessionLabel);
  const symbols = groupImprovement(facts, (f) => f.symbol, (k) => k);
  const playbooks = groupImprovement(facts, (f) => f.strategyId, (k) => input.playbookName?.(k) ?? "Playbook");
  const byMistake = groupImprovement(facts, (f) => f.mistakeFocus ?? f.mistakes[0]?.value ?? null, mistakeLabel);
  const consistency = practiceConsistency(facts, input.homework ?? []);
  const rules = ruleIntelligence(input.entries, facts);
  const recommendations = nextBestDrills({ facts, entries: input.entries, mistakes, skills, drills });

  const done = completedFacts(facts);
  const deltas = done.map((f) => f.processDelta);
  const measurable = skills.filter((s) => s.evidence.level !== "insufficient");

  const overview: OverviewSummary = {
    attempts: facts.length,
    completed: done.length,
    avgProcessDelta: meanRound(deltas, 1),
    improving: measurable.filter((s) => s.direction === "improving").sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0)),
    declining: measurable.filter((s) => s.direction === "declining").sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0)),
    mostCorrected: [...mistakes].filter((m) => m.corrected > 0).sort((a, b) => b.corrected - a.corrected)[0] ?? null,
    mostRepeated: [...mistakes].filter((m) => m.repeated > 0).sort((a, b) => b.repeated - a.repeated)[0] ?? null,
    currentDrill: drills.find((d) => d.verdict !== "insufficient") ?? drills[0] ?? null,
    attemptsPerWeek: consistency.attemptsPerWeek,
    evidence: evidenceLevel({
      sample: done.length,
      consistency: consistencyOf(deltas),
      recencyDays: daysSince(done[done.length - 1]?.completedAt ?? null),
    }),
    recommendation: recommendations[0] ?? null,
    series: done.filter((f) => f.processDelta != null).map((f) => ({ at: f.at, delta: f.processDelta! })),
  };

  return { facts, skills, mistakes, drills, transfer, setups, sessions, symbols, playbooks, byMistake, consistency, rules, recommendations, overview };
}

/* ------------------------------------------------------------------ */
/* Formatting helpers shared by the Phase 5 UI                         */
/* ------------------------------------------------------------------ */

export const pct = (v: number | null | undefined, digits = 0): string => (v == null ? "—" : `${(v * 100).toFixed(digits)}%`);

export const signed = (v: number | null | undefined, digits = 0): string =>
  v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(digits)}`;

export const deltaTone = (v: number | null | undefined, threshold = 2): "up" | "down" | "flat" =>
  v == null ? "flat" : v >= threshold ? "up" : v <= -threshold ? "down" : "flat";

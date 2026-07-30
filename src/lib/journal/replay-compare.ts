/**
 * JOURNAL X — PHASE 4
 * Replay Compare + Improvement Delta.
 *
 * Pure, dependency-light comparison model. Every number here is derived from
 * data that already exists (the journal entry, the replay trades, the intent
 * card and the reflection). When an input is missing the derived value is
 * `null` and the UI renders "not measurable" instead of a fabricated score.
 *
 * Nothing in this file talks to the network — it is safe to memoize.
 */

import type { JournalEntry } from "@/lib/journal/api";
import type { StoryMetrics } from "@/lib/journal/story";
import { mistakeLabel } from "@/lib/journal/story";
import { DEFAULT_MISTAKES } from "@/lib/journal/constants";

/* ------------------------------------------------------------------ */
/* Shared types                                                        */
/* ------------------------------------------------------------------ */

export const PRACTICE_MODES = [
  {
    value: "standard",
    label: "Standard replay",
    blurb: "Normal historical candles up to the original entry window.",
  },
  {
    value: "retry_plan",
    label: "Retry original plan",
    blurb: "Your original plan is preloaded — the result stays hidden.",
  },
  {
    value: "blind",
    label: "Blind replay",
    blurb: "Direction, entry, exit, P/L and annotations are all hidden.",
  },
  {
    value: "mistake_drill",
    label: "Mistake drill",
    blurb: "Focused on correcting one recorded mistake.",
  },
] as const;

export type PracticeMode = (typeof PRACTICE_MODES)[number]["value"];

export type AttemptIntent = {
  setup?: string;
  entry_condition?: string;
  invalidation?: string;
  stop_plan?: string;
  target_plan?: string;
  risk_pct?: number | null;
  management_plan?: string;
  confidence?: number | null;
  rule_focus?: string;
  mistake_to_avoid?: string;
};

export type AttemptReflection = {
  felt_different?: string;
  done_better?: string;
  still_wrong?: string;
  original_mistake_avoided?: "yes" | "partly" | "no" | "not_tested";
  confidence_after?: number | null;
  mistakes?: string[];
  emotions?: string[];
};

export type AttemptTelemetry = {
  entries?: number;
  exits?: number;
  stop_changes?: number;
  target_changes?: number;
  partials?: number;
  break_even?: number;
  pauses?: number;
  rewinds?: number;
  speed_changes?: number;
  first_decision_ms?: number | null;
  events?: number;
};

/** A normalized execution snapshot — the unit both sides of the compare use. */
export type Side = {
  kind: "original" | "replay";
  label: string;
  direction: string | null;
  entryPrice: number | null;
  exitPrice: number | null;
  stop: number | null;
  target: number | null;
  lotSize: number | null;
  riskPct: number | null;
  plannedRR: number | null;
  realizedR: number | null;
  pnl: number | null;
  mfe: number | null;
  mae: number | null;
  holdSeconds: number | null;
  entryEfficiency: number | null;
  exitEfficiency: number | null;
  sizingQuality: number | null;
  adherence: number | null;
  openedAt: string | null;
  closedAt: string | null;
  mistakes: string[];
  emotions: string[];
  confidence: number | null;
  stopChanges: number | null;
  partials: number | null;
  breakEven: boolean | null;
  ruleTotal: number | null;
  ruleFollowed: number | null;
  journalFilled: number;
  journalTotal: number;
  multiLeg: boolean;
  open: boolean;
};

const n = (v: unknown): number | null => {
  const x = typeof v === "string" ? Number(v) : (v as number);
  return typeof x === "number" && Number.isFinite(x) ? x : null;
};

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

/* ------------------------------------------------------------------ */
/* Side builders                                                       */
/* ------------------------------------------------------------------ */

const JOURNAL_FIELDS: (keyof JournalEntry)[] = [
  "setup",
  "stop_loss",
  "take_profit",
  "risk_pct",
  "notes_text",
  "entry_reason_text",
  "emotions",
  "mistakes",
  "grade",
];

function journalCompleteness(entry: JournalEntry): { filled: number; total: number } {
  let filled = 0;
  for (const f of JOURNAL_FIELDS) {
    const v = entry[f];
    if (Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && `${v}`.trim() !== "") filled += 1;
  }
  return { filled, total: JOURNAL_FIELDS.length };
}

/** Builds the original side from the journal entry + already-derived story metrics. */
export function sideFromEntry(entry: JournalEntry, m: StoryMetrics, adherence: number | null): Side {
  const checklist = Array.isArray(entry.checklist) ? (entry.checklist as { checked?: boolean }[]) : [];
  const jc = journalCompleteness(entry);
  const movedStop = (entry.mistakes ?? []).includes("moved_stop_loss");
  return {
    kind: "original",
    label: "Original",
    direction: entry.direction ?? null,
    entryPrice: n(entry.entry_price),
    exitPrice: n(entry.exit_price),
    stop: n(entry.stop_loss),
    target: n(entry.take_profit),
    lotSize: n(entry.lot_size),
    riskPct: m.riskPct,
    plannedRR: m.plannedRR,
    realizedR: m.r,
    pnl: m.netPnl,
    mfe: m.mfe,
    mae: m.mae,
    holdSeconds: m.holdSeconds,
    entryEfficiency: m.entryEfficiency,
    exitEfficiency: m.exitEfficiency,
    sizingQuality: m.sizingQuality,
    adherence,
    openedAt: entry.opened_at ?? null,
    closedAt: entry.closed_at ?? null,
    mistakes: entry.mistakes ?? [],
    emotions: entry.emotions ?? [],
    confidence: n(entry.confidence),
    // The original trade has no event stream — only the self-reported mistake.
    stopChanges: movedStop ? 1 : null,
    partials: null,
    breakEven: null,
    ruleTotal: checklist.length || null,
    ruleFollowed: checklist.length ? checklist.filter((c) => c?.checked).length : null,
    journalFilled: jc.filled,
    journalTotal: jc.total,
    multiLeg: false,
    open: !entry.closed_at,
  };
}

export type ReplayTradeLike = {
  id: string;
  direction: string | null;
  entry_price: number | string | null;
  exit_price: number | string | null;
  stop_loss: number | string | null;
  take_profit: number | string | null;
  lot_size: number | string | null;
  risk_pct: number | string | null;
  rr_planned: number | string | null;
  rr_realized: number | string | null;
  pnl: number | string | null;
  opened_at: string;
  closed_at: string | null;
  status: string;
  notes?: string | null;
};

/**
 * Builds the replay side from the trades placed during the attempt. Multiple
 * trades collapse into one aggregate leg (first entry, last exit, summed P/L)
 * and the side is flagged `multiLeg` so the UI can say so.
 */
export function sideFromReplay(
  trades: ReplayTradeLike[],
  intent: AttemptIntent,
  reflection: AttemptReflection,
  telemetry: AttemptTelemetry,
): Side {
  const sorted = [...trades].sort((a, b) => +new Date(a.opened_at) - +new Date(b.opened_at));
  const first = sorted[0];
  const closed = sorted.filter((t) => t.closed_at);
  const last = closed[closed.length - 1];
  const anyOpen = sorted.some((t) => t.status !== "closed");

  const pnl = sorted.length ? sorted.reduce((s, t) => s + (n(t.pnl) ?? 0), 0) : null;
  const rs = sorted.map((t) => n(t.rr_realized)).filter((x): x is number => x != null);
  const realizedR = rs.length ? rs.reduce((s, x) => s + x, 0) : null;
  const riskVals = sorted.map((t) => n(t.risk_pct)).filter((x): x is number => x != null);
  const riskPct = riskVals.length ? riskVals.reduce((s, x) => s + x, 0) : (intent.risk_pct ?? null);

  const entryPrice = first ? n(first.entry_price) : null;
  const exitPrice = last ? n(last.exit_price) : null;
  const stop = first ? n(first.stop_loss) : null;
  const target = first ? n(first.take_profit) : null;
  const riskDistance = entryPrice != null && stop != null ? Math.abs(entryPrice - stop) : null;
  const rewardDistance = entryPrice != null && target != null ? Math.abs(target - entryPrice) : null;

  const holdSeconds =
    first && last?.closed_at ? Math.round((+new Date(last.closed_at) - +new Date(first.opened_at)) / 1000) : null;

  const jFields = [
    reflection.felt_different,
    reflection.done_better,
    reflection.still_wrong,
    intent.setup,
    intent.entry_condition,
    intent.invalidation,
    intent.stop_plan,
    intent.target_plan,
    intent.management_plan,
  ];

  return {
    kind: "replay",
    label: "Replay",
    direction: first?.direction ?? null,
    entryPrice,
    exitPrice,
    stop,
    target,
    lotSize: first ? n(first.lot_size) : null,
    riskPct,
    plannedRR: riskDistance && rewardDistance ? rewardDistance / riskDistance : first ? n(first.rr_planned) : null,
    realizedR,
    pnl,
    // MFE/MAE for the replay leg are only available when candles were captured.
    mfe: null,
    mae: null,
    holdSeconds,
    entryEfficiency: null,
    exitEfficiency: null,
    sizingQuality: sizingScore(riskPct),
    adherence: null, // filled in by intentAdherence() below
    openedAt: first?.opened_at ?? null,
    closedAt: last?.closed_at ?? null,
    mistakes: reflection.mistakes ?? [],
    emotions: reflection.emotions ?? [],
    confidence: reflection.confidence_after ?? intent.confidence ?? null,
    stopChanges: telemetry.stop_changes ?? null,
    partials: telemetry.partials ?? null,
    breakEven: telemetry.break_even != null ? telemetry.break_even > 0 : null,
    ruleTotal: null,
    ruleFollowed: null,
    journalFilled: jFields.filter((v) => (v ?? "").toString().trim() !== "").length,
    journalTotal: jFields.length,
    multiLeg: sorted.length > 1,
    open: anyOpen || !sorted.length,
  };
}

function sizingScore(riskPct: number | null): number | null {
  if (riskPct == null || riskPct <= 0) return null;
  if (riskPct <= 1) return 100;
  if (riskPct <= 2) return 80;
  if (riskPct <= 4) return 45;
  return 15;
}

/* ------------------------------------------------------------------ */
/* Plan adherence for the replay side (intent vs actual)               */
/* ------------------------------------------------------------------ */

export type AdherenceRow = {
  id: string;
  area: string;
  planned: string;
  actual: string;
  verdict: "followed" | "minor" | "major" | "missing";
  why: string;
};

/** Scores the replay attempt against the intent card the trader filled in. */
export function intentAdherence(intent: AttemptIntent, side: Side): { rows: AdherenceRow[]; score: number | null } {
  const rows: AdherenceRow[] = [];
  const push = (r: AdherenceRow) => rows.push(r);

  push({
    id: "entry",
    area: "Entry condition",
    planned: intent.entry_condition?.trim() || "—",
    actual: side.entryPrice != null ? `Filled at ${side.entryPrice}` : "No entry taken",
    verdict: !intent.entry_condition?.trim() ? "missing" : side.entryPrice != null ? "followed" : "major",
    why: !intent.entry_condition?.trim()
      ? "No entry condition was written before playback."
      : side.entryPrice != null
      ? "An entry was taken during the attempt."
      : "The attempt ended without taking the planned entry.",
  });

  push({
    id: "stop",
    area: "Stop",
    planned: intent.stop_plan?.trim() || "—",
    actual: side.stop != null ? `${side.stop}` : "No stop recorded",
    verdict: side.stop == null ? "major" : (side.stopChanges ?? 0) > 0 ? "minor" : "followed",
    why:
      side.stop == null
        ? "Risk went on without a defined stop."
        : (side.stopChanges ?? 0) > 0
        ? `Stop was modified ${side.stopChanges} time(s) during the attempt.`
        : "Stop stayed where it was placed.",
  });

  push({
    id: "target",
    area: "Target",
    planned: intent.target_plan?.trim() || "—",
    actual: side.target != null ? `${side.target}` : "No target recorded",
    verdict: side.target == null ? "minor" : "followed",
    why: side.target == null ? "No target level was stored with the attempt." : "A target level was defined up front.",
  });

  const plannedRisk = intent.risk_pct ?? null;
  push({
    id: "risk",
    area: "Risk",
    planned: plannedRisk != null ? `${plannedRisk}%` : "—",
    actual: side.riskPct != null ? `${round(side.riskPct, 2)}%` : "Not recorded",
    verdict:
      plannedRisk == null || side.riskPct == null
        ? "missing"
        : side.riskPct <= plannedRisk * 1.1
        ? "followed"
        : side.riskPct <= plannedRisk * 1.5
        ? "minor"
        : "major",
    why:
      plannedRisk == null || side.riskPct == null
        ? "Planned or actual risk is missing, so this is not measurable."
        : `Planned ${plannedRisk}% versus ${round(side.riskPct, 2)}% actually risked.`,
  });

  push({
    id: "management",
    area: "Management",
    planned: intent.management_plan?.trim() || "—",
    actual:
      side.stopChanges == null && side.partials == null
        ? "No management events captured"
        : `${side.stopChanges ?? 0} stop change(s), ${side.partials ?? 0} partial(s)`,
    verdict: !intent.management_plan?.trim() ? "missing" : (side.stopChanges ?? 0) > 1 ? "minor" : "followed",
    why: !intent.management_plan?.trim()
      ? "No management plan was written before playback."
      : "Compared against the captured management events.",
  });

  const measurable = rows.filter((r) => r.verdict !== "missing");
  if (!measurable.length) return { rows, score: null };
  const pts = measurable.reduce((s, r) => s + (r.verdict === "followed" ? 1 : r.verdict === "minor" ? 0.5 : 0), 0);
  return { rows, score: Math.round((pts / measurable.length) * 100) };
}

/* ------------------------------------------------------------------ */
/* Improvement delta                                                   */
/* ------------------------------------------------------------------ */

export type DimensionKey =
  | "plan_adherence"
  | "risk_discipline"
  | "entry_quality"
  | "exit_quality"
  | "position_sizing"
  | "rule_compliance"
  | "management_quality"
  | "psychology_discipline"
  | "journaling_completeness";

type Scorer = { key: DimensionKey; label: string; how: string; score: (s: Side) => number | null };

const NEGATIVE_EMOTIONS = ["fomo", "fear", "greed", "revenge", "anxious", "frustrated", "impatient", "stressed"];

export const DIMENSIONS: Scorer[] = [
  {
    key: "plan_adherence",
    label: "Plan adherence",
    how: "Share of measurable plan rows followed. Followed = 1 point, minor deviation = 0.5, major = 0. Rows without a written plan are excluded.",
    score: (s) => s.adherence,
  },
  {
    key: "risk_discipline",
    label: "Risk discipline",
    how: "50 points for a defined stop, plus 50 scaled by risk %: ≤1% = 50, ≤2% = 40, ≤4% = 22, above = 8.",
    score: (s) => {
      if (s.stop == null && s.riskPct == null) return null;
      const stopPts = s.stop != null ? 50 : 0;
      const r = s.riskPct;
      const riskPts = r == null ? 0 : r <= 1 ? 50 : r <= 2 ? 40 : r <= 4 ? 22 : 8;
      return clamp(stopPts + riskPts);
    },
  },
  {
    key: "entry_quality",
    label: "Entry quality",
    how: "Entry efficiency: MFE / (MFE + MAE) × 100 — how much adverse excursion the entry avoided. Requires candle history.",
    score: (s) => s.entryEfficiency,
  },
  {
    key: "exit_quality",
    label: "Exit quality",
    how: "Exit efficiency: captured move / MFE × 100 — how much of the favourable excursion was banked. Requires candle history.",
    score: (s) => s.exitEfficiency,
  },
  {
    key: "position_sizing",
    label: "Position sizing",
    how: "Risk band versus a 2% per-trade budget: ≤1% = 100, ≤2% = 80, ≤4% = 45, above = 15.",
    score: (s) => s.sizingQuality,
  },
  {
    key: "rule_compliance",
    label: "Rule compliance",
    how: "Checklist items ticked when a checklist exists; otherwise 100 minus 20 per recorded mistake.",
    score: (s) => {
      if (s.ruleTotal) return Math.round(((s.ruleFollowed ?? 0) / s.ruleTotal) * 100);
      if (!s.mistakes.length && s.kind === "original") return null;
      return clamp(100 - s.mistakes.length * 20);
    },
  },
  {
    key: "management_quality",
    label: "Management quality",
    how: "Starts at 100. −25 per stop change beyond the first, −15 if no stop existed, +10 when break-even was used.",
    score: (s) => {
      if (s.stopChanges == null && s.stop == null && s.breakEven == null) return null;
      let v = 100;
      const moves = s.stopChanges ?? 0;
      if (moves > 1) v -= (moves - 1) * 25;
      if (moves === 1) v -= 10;
      if (s.stop == null) v -= 15;
      if (s.breakEven) v += 10;
      return clamp(v);
    },
  },
  {
    key: "psychology_discipline",
    label: "Psychology discipline",
    how: "100 minus 20 per recorded negative emotion tag (FOMO, fear, greed, revenge, anxiety, frustration, impatience, stress).",
    score: (s) => {
      if (!s.emotions.length && s.confidence == null) return null;
      const bad = s.emotions.filter((e) => NEGATIVE_EMOTIONS.some((k) => e.toLowerCase().includes(k))).length;
      return clamp(100 - bad * 20);
    },
  },
  {
    key: "journaling_completeness",
    label: "Journaling completeness",
    how: "Share of the review fields that carry content.",
    score: (s) => (s.journalTotal ? Math.round((s.journalFilled / s.journalTotal) * 100) : null),
  },
];

export type DeltaRow = {
  key: DimensionKey;
  label: string;
  how: string;
  original: number | null;
  replay: number | null;
  delta: number | null;
};

export function improvementDelta(original: Side, replay: Side): DeltaRow[] {
  return DIMENSIONS.map((d) => {
    const a = d.score(original);
    const b = d.score(replay);
    return {
      key: d.key,
      label: d.label,
      how: d.how,
      original: a,
      replay: b,
      delta: a != null && b != null ? Math.round(b - a) : null,
    };
  });
}

/** Mean of every measurable dimension — the transparent "process score". */
export function processScore(rows: DeltaRow[], side: "original" | "replay"): number | null {
  const vals = rows.map((r) => (side === "original" ? r.original : r.replay)).filter((v): v is number => v != null);
  if (!vals.length) return null;
  return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
}

/* ------------------------------------------------------------------ */
/* Process vs outcome                                                  */
/* ------------------------------------------------------------------ */

export type OutcomeRow = { key: string; label: string; original: number | null; replay: number | null; unit: string; higherIsBetter: boolean };

export function outcomeRows(a: Side, b: Side): OutcomeRow[] {
  return [
    { key: "pnl", label: "Net P/L", original: a.pnl, replay: b.pnl, unit: "", higherIsBetter: true },
    { key: "r", label: "R multiple", original: a.realizedR, replay: b.realizedR, unit: "R", higherIsBetter: true },
    { key: "rr", label: "Planned R:R", original: a.plannedRR, replay: b.plannedRR, unit: "", higherIsBetter: true },
    { key: "mfe", label: "MFE", original: a.mfe, replay: b.mfe, unit: "", higherIsBetter: true },
    { key: "mae", label: "MAE", original: a.mae, replay: b.mae, unit: "", higherIsBetter: false },
    {
      key: "hold",
      label: "Hold time",
      original: a.holdSeconds == null ? null : Math.round(a.holdSeconds / 60),
      replay: b.holdSeconds == null ? null : Math.round(b.holdSeconds / 60),
      unit: "min",
      higherIsBetter: true,
    },
  ];
}

export type ProcessOutcome = {
  processOriginal: number | null;
  processReplay: number | null;
  processDelta: number | null;
  outcomeDelta: number | null;
  headline: string;
  tone: "up" | "down" | "flat" | "unknown";
};

export function processVsOutcome(rows: DeltaRow[], a: Side, b: Side): ProcessOutcome {
  const pa = processScore(rows, "original");
  const pb = processScore(rows, "replay");
  const pd = pa != null && pb != null ? pb - pa : null;
  const od = a.realizedR != null && b.realizedR != null ? b.realizedR - a.realizedR : a.pnl != null && b.pnl != null ? b.pnl - a.pnl : null;

  let headline = "Not enough comparable data to judge process or outcome.";
  let tone: ProcessOutcome["tone"] = "unknown";
  if (pd != null) {
    const better = pd >= 5;
    const worse = pd <= -5;
    if (od == null) {
      headline = better
        ? "Process improved. Outcome is not comparable on the recorded data."
        : worse
        ? "Process declined. Outcome is not comparable on the recorded data."
        : "Process held steady. Outcome is not comparable on the recorded data.";
      tone = better ? "up" : worse ? "down" : "flat";
    } else if (better && od < 0) {
      headline = "Process improved despite a lower financial result.";
      tone = "up";
    } else if (better) {
      headline = "Process and financial result both improved.";
      tone = "up";
    } else if (worse && od > 0) {
      headline = "Financial result improved, but process quality declined.";
      tone = "down";
    } else if (worse) {
      headline = "Process and financial result both declined.";
      tone = "down";
    } else {
      headline = od > 0 ? "Process unchanged; the financial result was better — likely market variation." : "Process unchanged and the result was not better.";
      tone = "flat";
    }
  }
  return { processOriginal: pa, processReplay: pb, processDelta: pd == null ? null : Math.round(pd), outcomeDelta: od == null ? null : round(od, 2), headline, tone };
}

/* ------------------------------------------------------------------ */
/* Mistake comparison                                                  */
/* ------------------------------------------------------------------ */

export type MistakeVerdict = "corrected" | "partial" | "repeated" | "not_tested" | "insufficient";

export type MistakeComparisonRow = {
  value: string;
  label: string;
  verdict: MistakeVerdict;
  evidence: string;
};

const RULE_EVIDENCE: Record<string, (b: Side) => { tested: boolean; ok: boolean; why: string }> = {
  no_stop_loss: (b) => ({ tested: true, ok: b.stop != null, why: b.stop != null ? "A stop was defined on the replay entry." : "The replay entry also had no stop." }),
  moved_stop_loss: (b) => ({
    tested: b.stopChanges != null,
    ok: (b.stopChanges ?? 0) === 0,
    why: b.stopChanges == null ? "No management events were captured for this attempt." : `${b.stopChanges} stop change(s) recorded.`,
  }),
  over_leveraged: (b) => ({
    tested: b.riskPct != null,
    ok: (b.riskPct ?? 99) <= 2,
    why: b.riskPct == null ? "Risk % was not recorded on the attempt." : `Replay risked ${round(b.riskPct, 2)}%.`,
  }),
  poor_risk_mgmt: (b) => ({
    tested: b.riskPct != null || b.stop != null,
    ok: b.stop != null && (b.riskPct ?? 99) <= 2,
    why: b.stop == null ? "No stop on the replay entry." : `Stop defined, risk ${b.riskPct == null ? "unrecorded" : `${round(b.riskPct, 2)}%`}.`,
  }),
  overtrading: (b) => ({ tested: true, ok: !b.multiLeg, why: b.multiLeg ? "More than one position was opened in the attempt." : "A single position was taken." }),
};

export function compareMistakes(a: Side, b: Side, reflection: AttemptReflection): {
  rows: MistakeComparisonRow[];
  introduced: MistakeComparisonRow[];
  correctedCount: number;
  repeatedCount: number;
} {
  const replaySelf = new Set(b.mistakes);
  const rows: MistakeComparisonRow[] = (a.mistakes ?? []).map((value) => {
    const label = mistakeLabel(value);
    // 1. The trader's own reflection is the strongest evidence.
    if (replaySelf.has(value)) {
      return { value, label, verdict: "repeated" as const, evidence: "You tagged this mistake again on the replay attempt." };
    }
    // 2. Rule-derived evidence from the executed replay trade.
    const rule = RULE_EVIDENCE[value];
    if (rule) {
      const r = rule(b);
      if (!r.tested) return { value, label, verdict: "insufficient" as const, evidence: r.why };
      return { value, label, verdict: r.ok ? "corrected" : "repeated", evidence: r.why };
    }
    // 3. Fall back to the single reflection question.
    if (reflection.original_mistake_avoided === "yes") return { value, label, verdict: "corrected" as const, evidence: "You reported avoiding the original mistake." };
    if (reflection.original_mistake_avoided === "partly") return { value, label, verdict: "partial" as const, evidence: "You reported partially avoiding the original mistake." };
    if (reflection.original_mistake_avoided === "no") return { value, label, verdict: "repeated" as const, evidence: "You reported repeating the original mistake." };
    if (!b.entryPrice) return { value, label, verdict: "not_tested" as const, evidence: "No entry was taken, so this behaviour was never exercised." };
    return { value, label, verdict: "insufficient" as const, evidence: "No captured signal proves or disproves this behaviour." };
  });

  const originalSet = new Set(a.mistakes ?? []);
  const introduced: MistakeComparisonRow[] = (b.mistakes ?? [])
    .filter((v) => !originalSet.has(v))
    .map((value) => ({ value, label: mistakeLabel(value), verdict: "repeated" as const, evidence: "New on the replay attempt — not present on the original trade." }));

  return {
    rows,
    introduced,
    correctedCount: rows.filter((r) => r.verdict === "corrected").length,
    repeatedCount: rows.filter((r) => r.verdict === "repeated").length,
  };
}

/* ------------------------------------------------------------------ */
/* Psychology comparison                                               */
/* ------------------------------------------------------------------ */

export type PsychRow = { label: string; original: string; replay: string; note: string | null };

export function psychologyRows(a: Side, b: Side): PsychRow[] {
  const rows: PsychRow[] = [
    {
      label: "Confidence",
      original: a.confidence == null ? "—" : `${a.confidence}/10`,
      replay: b.confidence == null ? "—" : `${b.confidence}/10`,
      note: a.confidence != null && b.confidence != null ? (b.confidence > a.confidence ? "Higher reported confidence on the attempt." : b.confidence < a.confidence ? "Lower reported confidence on the attempt." : "Unchanged.") : "Not measurable.",
    },
  ];
  for (const key of NEGATIVE_EMOTIONS) {
    const inA = a.emotions.some((e) => e.toLowerCase().includes(key));
    const inB = b.emotions.some((e) => e.toLowerCase().includes(key));
    if (!inA && !inB) continue;
    rows.push({
      label: key.charAt(0).toUpperCase() + key.slice(1),
      original: inA ? "Reported" : "Not reported",
      replay: inB ? "Reported" : "Not reported",
      note: inA && !inB ? "Not reported on the replay attempt." : !inA && inB ? "Newly reported on the replay attempt." : "Reported on both.",
    });
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* Readiness verdict                                                   */
/* ------------------------------------------------------------------ */

export type Readiness = "repeat_drill" | "improved_inconsistent" | "skill_corrected" | "needs_evidence";

export const READINESS_LABEL: Record<Readiness, string> = {
  repeat_drill: "Repeat this drill",
  improved_inconsistent: "Improved but inconsistent",
  skill_corrected: "Skill corrected",
  needs_evidence: "Needs more evidence",
};

export type AttemptSummary = { processDelta: number | null; repeatedCount: number; correctedCount: number };

/**
 * Transparent rules — outcome never enters the verdict:
 *  • no measurable process delta anywhere → needs more evidence
 *  • latest delta ≤ 0 → repeat the drill
 *  • ≥2 completed attempts, all deltas ≥ +5 and no repeated mistakes → corrected
 *  • otherwise → improved but inconsistent
 */
export function readinessVerdict(attempts: AttemptSummary[]): { verdict: Readiness; why: string } {
  const measurable = attempts.filter((a) => a.processDelta != null);
  if (!measurable.length) return { verdict: "needs_evidence", why: "No attempt has enough recorded data to score process improvement." };
  const latest = measurable[measurable.length - 1];
  if ((latest.processDelta ?? 0) <= 0) {
    return { verdict: "repeat_drill", why: `The latest attempt did not improve process (${fmtDelta(latest.processDelta)}).` };
  }
  const allGood = measurable.length >= 2 && measurable.every((a) => (a.processDelta ?? 0) >= 5) && measurable.every((a) => a.repeatedCount === 0);
  if (allGood) {
    return { verdict: "skill_corrected", why: `${measurable.length} consecutive attempts improved process with no repeated mistakes.` };
  }
  return {
    verdict: "improved_inconsistent",
    why:
      measurable.length === 1
        ? "One attempt showed improvement — a single attempt cannot establish mastery."
        : "Improvement is present but not consistent across every attempt.",
  };
}

/* ------------------------------------------------------------------ */
/* Next practice action                                                */
/* ------------------------------------------------------------------ */

export type NextAction = { id: string; title: string; detail: string; mode: PracticeMode; mistake?: string };

export function nextPracticeAction(
  rows: DeltaRow[],
  mistakes: { rows: MistakeComparisonRow[]; introduced: MistakeComparisonRow[] },
  po: ProcessOutcome,
): NextAction {
  const repeated = mistakes.rows.find((r) => r.verdict === "repeated");
  if (repeated) {
    return {
      id: `drill_${repeated.value}`,
      title: `Drill: ${repeated.label.toLowerCase()}`,
      detail: `${repeated.label} repeated on this attempt. Run the same context again focused only on that behaviour.`,
      mode: "mistake_drill",
      mistake: repeated.value,
    };
  }
  const worst = rows
    .filter((r) => r.delta != null)
    .sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0))[0];
  if (worst && (worst.delta ?? 0) < 0) {
    return {
      id: `dim_${worst.key}`,
      title: `Practise ${worst.label.toLowerCase()}`,
      detail: `${worst.label} moved ${fmtDelta(worst.delta)} versus the original. Repeat the attempt with that dimension as the single rule focus.`,
      mode: "retry_plan",
    };
  }
  if (po.processDelta != null && po.processDelta >= 5) {
    return {
      id: "blind_repeat",
      title: "Repeat the same trade blind",
      detail: "Process improved. Run it once more with direction, entry and outcome hidden to prove the read wasn't hindsight.",
      mode: "blind",
    };
  }
  return {
    id: "retry_plan",
    title: "Retry with the original plan",
    detail: "Run the same context again with the original plan preloaded and hold to invalidation.",
    mode: "retry_plan",
  };
}

/* ------------------------------------------------------------------ */
/* Grounded evaluation (deterministic — no model call)                 */
/* ------------------------------------------------------------------ */

export type EvaluationBlock = { title: string; body: string; evidence: string[] };

export function buildEvaluation(input: {
  rows: DeltaRow[];
  po: ProcessOutcome;
  mistakes: ReturnType<typeof compareMistakes>;
  readiness: { verdict: Readiness; why: string };
  next: NextAction;
  original: Side;
  replay: Side;
}): { blocks: EvaluationBlock[]; missing: string[] } {
  const { rows, po, mistakes, readiness, next, original, replay } = input;
  const improved = rows.filter((r) => (r.delta ?? 0) > 0).sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0));
  const worse = rows.filter((r) => (r.delta ?? 0) < 0).sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0));
  const missing: string[] = [];
  if (replay.mfe == null) missing.push("MFE/MAE for the replay leg");
  if (replay.riskPct == null) missing.push("recorded risk % on the attempt");
  if (!replay.emotions.length) missing.push("psychology tags for the attempt");
  if (original.adherence == null) missing.push("plan adherence on the original trade");

  const blocks: EvaluationBlock[] = [
    {
      title: "Executive summary",
      body: po.headline,
      evidence: [
        po.processDelta == null ? "Process delta not measurable." : `Process score ${po.processOriginal} → ${po.processReplay} (${fmtDelta(po.processDelta)}).`,
        po.outcomeDelta == null ? "Outcome delta not measurable." : `Outcome delta ${fmtDelta(po.outcomeDelta)}.`,
      ],
    },
    {
      title: "What improved",
      body: improved.length ? improved.slice(0, 3).map((r) => `${r.label} ${fmtDelta(r.delta)}`).join(", ") + "." : "No dimension scored higher than the original on the recorded data.",
      evidence: improved.slice(0, 3).map((r) => `${r.label}: ${r.original} → ${r.replay}`),
    },
    {
      title: "What repeated",
      body: mistakes.repeatedCount
        ? `${mistakes.repeatedCount} original mistake(s) showed up again.`
        : "No original mistake was observed again on this attempt.",
      evidence: mistakes.rows.filter((r) => r.verdict === "repeated").map((r) => `${r.label}: ${r.evidence}`),
    },
    {
      title: "What became worse",
      body: worse.length
        ? worse.slice(0, 3).map((r) => `${r.label} ${fmtDelta(r.delta)}`).join(", ") + "."
        : mistakes.introduced.length
        ? `${mistakes.introduced.length} new mistake(s) appeared.`
        : "Nothing measurable declined.",
      evidence: [...worse.slice(0, 3).map((r) => `${r.label}: ${r.original} → ${r.replay}`), ...mistakes.introduced.map((r) => `New: ${r.label}`)],
    },
    {
      title: "Process vs outcome",
      body: po.headline,
      evidence: ["Process is scored from plan, risk, sizing, rules, management, psychology, execution and journaling. Outcome is P/L and R only."],
    },
    {
      title: "Most important lesson",
      body: next.detail,
      evidence: [readiness.why],
    },
    {
      title: "Suggested next drill",
      body: next.title,
      evidence: [`Mode: ${PRACTICE_MODES.find((m) => m.value === next.mode)?.label ?? next.mode}`],
    },
    {
      title: "Readiness to move on",
      body: READINESS_LABEL[readiness.verdict],
      evidence: [readiness.why],
    },
  ];
  return { blocks, missing };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function round(v: number, d = 2): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

export function fmtDelta(v: number | null | undefined, digits = 0): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const r = round(v, digits);
  return `${r > 0 ? "+" : ""}${r}`;
}

export const MISTAKE_OPTIONS = DEFAULT_MISTAKES;

export const VERDICT_TONE: Record<MistakeVerdict, "up" | "down" | "flat"> = {
  corrected: "up",
  partial: "flat",
  repeated: "down",
  not_tested: "flat",
  insufficient: "flat",
};

export const VERDICT_LABEL: Record<MistakeVerdict, string> = {
  corrected: "Corrected",
  partial: "Partially corrected",
  repeated: "Repeated",
  not_tested: "Not tested",
  insufficient: "Insufficient evidence",
};

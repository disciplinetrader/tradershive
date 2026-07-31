/**
 * Trade Story — derived, evidence-grounded model for `/journal/$entryId`.
 *
 * Every value here comes from data that already exists on the entry (or from
 * the candles the chart has loaded). Nothing is invented: when the inputs are
 * missing the derived value is `null` and the UI renders a compact
 * missing-data prompt instead of a fabricated number.
 */

import type { JournalEntry, JournalAttachment, JournalHistory } from "@/lib/journal/api";
import type { Candle } from "@/lib/market-data/types";
import { DEFAULT_MISTAKES, DEFAULT_SETUPS, SESSION_OPTIONS } from "@/lib/journal/constants";
import { deriveTrade, RISK_BASIS_LABEL, type RiskBasis, type TradeResult } from "@/lib/journal/derive";

const n = (v: unknown): number | null => {
  const x = typeof v === "string" ? Number(v) : (v as number);
  return typeof x === "number" && Number.isFinite(x) ? x : null;
};

export const num = n;

/* ------------------------------------------------------------------ */
/* Narrative (registry lives in a leaf module to avoid an import cycle) */
/* ------------------------------------------------------------------ */

export {
  NARRATIVE_SECTIONS,
  readNarrative,
  type NarrativeKey,
  type Narrative,
} from "@/lib/journal/narrative";

/* ------------------------------------------------------------------ */
/* Performance                                                         */
/* ------------------------------------------------------------------ */

export type StoryMetrics = {
  netPnl: number | null;
  grossPnl: number | null;
  fees: number | null;
  r: number | null;
  /** Which risk basis produced `r` — never leave R's meaning ambiguous. */
  rBasis: RiskBasis | null;
  rBasisLabel: string | null;
  riskAmount: number | null;
  result: TradeResult | null;
  riskDistance: number | null;
  riskPct: number | null;
  rewardDistance: number | null;
  plannedRR: number | null;
  mfe: number | null;
  mae: number | null;
  holdSeconds: number | null;
  entryEfficiency: number | null;
  exitEfficiency: number | null;
  sizingQuality: number | null;
  sizingNote: string | null;
};


/**
 * MFE / MAE are measured from the candles the chart already loaded, limited to
 * the trade's own open→close window. Without candles they stay null.
 */
export function excursions(entry: JournalEntry, candles: Candle[]): { mfe: number | null; mae: number | null; best: number | null; worst: number | null } {
  const entryPrice = n(entry.entry_price);
  const open = entry.opened_at ? Date.parse(entry.opened_at) : null;
  const close = entry.closed_at ? Date.parse(entry.closed_at) : null;
  if (entryPrice == null || open == null || !candles.length) return { mfe: null, mae: null, best: null, worst: null };
  const end = close ?? Date.now();
  const win = candles.filter((c) => c.time >= open - 1 && c.time <= end + 1);
  if (!win.length) return { mfe: null, mae: null, best: null, worst: null };
  const high = Math.max(...win.map((c) => c.high));
  const low = Math.min(...win.map((c) => c.low));
  const long = entry.direction !== "short";
  const best = long ? high : low;
  const worst = long ? low : high;
  return {
    mfe: Math.abs(best - entryPrice),
    mae: Math.abs(entryPrice - worst),
    best,
    worst,
  };
}

export function storyMetrics(entry: JournalEntry, candles: Candle[]): StoryMetrics {
  // P/L, fees and R come from the canonical derivation below.


  const entryPrice = n(entry.entry_price);
  const exitPrice = n(entry.exit_price);
  const sl = n(entry.stop_loss);
  const tp = n(entry.take_profit);

  const riskDistance = entryPrice != null && sl != null ? Math.abs(entryPrice - sl) : null;
  const rewardDistance = entryPrice != null && tp != null ? Math.abs(tp - entryPrice) : null;
  const plannedRR = riskDistance && rewardDistance ? rewardDistance / riskDistance : null;

  const { mfe, mae } = excursions(entry, candles);

  // Entry efficiency — how much of the adverse excursion you avoided.
  const entryEfficiency =
    mfe != null && mae != null && mfe + mae > 0 ? (mfe / (mfe + mae)) * 100 : null;

  // Exit efficiency — how much of the favourable excursion you captured.
  const captured =
    entryPrice != null && exitPrice != null
      ? entry.direction === "short"
        ? entryPrice - exitPrice
        : exitPrice - entryPrice
      : null;
  const exitEfficiency = captured != null && mfe != null && mfe > 0 ? Math.max(0, Math.min(100, (captured / mfe) * 100)) : null;

  const riskPct = n(entry.risk_pct);
  let sizingQuality: number | null = null;
  let sizingNote: string | null = null;
  if (riskPct != null) {
    if (riskPct <= 0) {
      sizingQuality = null;
      sizingNote = "Risk % recorded as zero.";
    } else if (riskPct <= 1) {
      sizingQuality = 100;
      sizingNote = "Within a 1% risk budget.";
    } else if (riskPct <= 2) {
      sizingQuality = 80;
      sizingNote = "Within a 2% risk budget.";
    } else if (riskPct <= 4) {
      sizingQuality = 45;
      sizingNote = "Above a 2% budget.";
    } else {
      sizingQuality = 15;
      sizingNote = "Materially oversized versus a 2% budget.";
    }
  }

  const derived = deriveTrade(entry);

  return {
    netPnl: derived.netPnl,
    grossPnl: derived.grossPnl,
    fees: derived.fees,
    r: derived.r,
    rBasis: derived.rBasis,
    rBasisLabel: derived.rBasis ? RISK_BASIS_LABEL[derived.rBasis] : null,
    riskAmount: derived.riskAmount,
    result: derived.result,
    riskDistance,
    riskPct,
    rewardDistance,
    plannedRR,
    mfe,
    mae,
    holdSeconds: n(entry.duration_seconds),
    entryEfficiency,
    exitEfficiency,
    sizingQuality,
    sizingNote,
  };

}

/* ------------------------------------------------------------------ */
/* Execution timeline                                                  */
/* ------------------------------------------------------------------ */

export type TimelineKind =
  | "idea"
  | "entry"
  | "stop"
  | "target"
  | "screenshot"
  | "note"
  | "exit"
  | "review"
  | "edit";

export type TimelineEvent = {
  id: string;
  kind: TimelineKind;
  label: string;
  at: number | null;
  price: number | null;
  quantity: number | null;
  detail: string | null;
  pnlImpact: number | null;
  screenshot?: string | null;
};

export function buildTimeline(
  entry: JournalEntry,
  attachments: JournalAttachment[],
  history: JournalHistory[],
): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  const openAt = entry.opened_at ? Date.parse(entry.opened_at) : null;
  const closeAt = entry.closed_at ? Date.parse(entry.closed_at) : null;
  const lots = n(entry.lot_size);

  if (entry.entry_reason_text?.trim()) {
    out.push({
      id: "idea",
      kind: "idea",
      label: "Trade idea",
      at: openAt,
      price: null,
      quantity: null,
      detail: entry.entry_reason_text.trim().slice(0, 240),
      pnlImpact: null,
    });
  }

  if (n(entry.entry_price) != null) {
    out.push({
      id: "entry",
      kind: "entry",
      label: `${entry.direction === "short" ? "Short" : "Long"} entry filled`,
      at: openAt,
      price: n(entry.entry_price),
      quantity: lots,
      detail: entry.setup ? setupLabel(entry.setup) : null,
      pnlImpact: null,
    });
  }
  if (n(entry.stop_loss) != null) {
    out.push({ id: "stop", kind: "stop", label: "Stop placed", at: openAt, price: n(entry.stop_loss), quantity: null, detail: null, pnlImpact: null });
  }
  if (n(entry.take_profit) != null) {
    out.push({ id: "target", kind: "target", label: "Target placed", at: openAt, price: n(entry.take_profit), quantity: null, detail: null, pnlImpact: null });
  }

  (entry.screenshots ?? []).forEach((p, i) => {
    out.push({
      id: `shot-${i}`,
      kind: "screenshot",
      label: `Screenshot ${i + 1}`,
      at: openAt,
      price: null,
      quantity: null,
      detail: null,
      pnlImpact: null,
      screenshot: p,
    });
  });

  attachments.forEach((a) => {
    out.push({
      id: `att-${a.id}`,
      kind: "screenshot",
      label: a.caption ?? a.name ?? "Attachment",
      at: a.created_at ? Date.parse(a.created_at) : null,
      price: null,
      quantity: null,
      detail: a.category ?? a.kind ?? null,
      pnlImpact: null,
      screenshot: a.path,
    });
  });

  if (n(entry.exit_price) != null || closeAt) {
    out.push({
      id: "exit",
      kind: "exit",
      label: "Position closed",
      at: closeAt,
      price: n(entry.exit_price),
      quantity: lots,
      detail: null,
      pnlImpact: n(entry.pnl),
    });
  }

  if (entry.notes_text?.trim()) {
    out.push({
      id: "note",
      kind: "note",
      label: "Review note",
      at: entry.updated_at ? Date.parse(entry.updated_at) : closeAt,
      price: null,
      quantity: null,
      detail: entry.notes_text.trim().slice(0, 240),
      pnlImpact: null,
    });
  }

  if (entry.ai_review) {
    out.push({
      id: "ai",
      kind: "review",
      label: "AI review generated",
      at: entry.updated_at ? Date.parse(entry.updated_at) : null,
      price: null,
      quantity: null,
      detail: null,
      pnlImpact: null,
    });
  }

  history.slice(0, 20).forEach((h) => {
    out.push({
      id: `h-${h.id}`,
      kind: "edit",
      label: h.action.replace(/_/g, " "),
      at: h.created_at ? Date.parse(h.created_at) : null,
      price: null,
      quantity: null,
      detail: null,
      pnlImpact: null,
    });
  });

  return out.sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
}

/* ------------------------------------------------------------------ */
/* Plan vs reality                                                     */
/* ------------------------------------------------------------------ */

export type Verdict = "followed" | "minor" | "major" | "missing";

export type PlanRow = {
  id: string;
  area: string;
  planned: string;
  actual: string;
  verdict: Verdict;
  why: string;
};

export function setupLabel(v: string): string {
  return DEFAULT_SETUPS.find((s) => s.value === v)?.label ?? v.replace(/_/g, " ");
}
export function sessionLabel(v: string | null | undefined): string {
  if (!v) return "—";
  return SESSION_OPTIONS.find((s) => s.value === v)?.label ?? String(v).replace(/_/g, " ");
}
export function mistakeLabel(v: string): string {
  return DEFAULT_MISTAKES.find((m) => m.value === v)?.label ?? v.replace(/_/g, " ");
}

const fmtPrice = (v: number | null) => (v == null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: 5 }));

export function planVsReality(entry: JournalEntry, m: StoryMetrics): { rows: PlanRow[]; adherence: number | null } {
  const rows: PlanRow[] = [];
  const entryPrice = n(entry.entry_price);
  const exitPrice = n(entry.exit_price);
  const sl = n(entry.stop_loss);
  const tp = n(entry.take_profit);

  rows.push({
    id: "setup",
    area: "Setup",
    planned: entry.setup ? setupLabel(entry.setup) : "—",
    actual: entry.strategy?.trim() || (entry.setup ? setupLabel(entry.setup) : "—"),
    verdict: entry.setup ? "followed" : "missing",
    why: entry.setup ? "A setup was declared for this trade." : "No setup was recorded, so adherence can't be judged.",
  });

  rows.push({
    id: "stop",
    area: "Stop",
    planned: fmtPrice(sl),
    actual: exitPrice != null && sl != null && isStopHit(entry, exitPrice, sl) ? `${fmtPrice(exitPrice)} (stop hit)` : fmtPrice(exitPrice),
    verdict: sl == null ? "missing" : "followed",
    why: sl == null ? "No stop was recorded on this trade." : "A stop level existed before the trade closed.",
  });

  const targetVerdict: Verdict =
    tp == null ? "missing" : exitPrice == null ? "missing" : reachedTarget(entry, exitPrice, tp) ? "followed" : "minor";
  rows.push({
    id: "target",
    area: "Target",
    planned: fmtPrice(tp),
    actual: fmtPrice(exitPrice),
    verdict: targetVerdict,
    why:
      tp == null
        ? "No target was recorded."
        : targetVerdict === "followed"
        ? "Exit reached or exceeded the planned target."
        : "Exit landed short of the planned target.",
  });

  const riskVerdict: Verdict =
    m.riskPct == null ? "missing" : m.riskPct <= 2 ? "followed" : m.riskPct <= 4 ? "minor" : "major";
  rows.push({
    id: "risk",
    area: "Risk",
    planned: "≤ 2% of account",
    actual: m.riskPct == null ? "—" : `${m.riskPct.toFixed(2)}%`,
    verdict: riskVerdict,
    why:
      m.riskPct == null
        ? "Risk % was not recorded."
        : riskVerdict === "followed"
        ? "Risk stayed inside a 2% budget."
        : riskVerdict === "minor"
        ? "Risk exceeded 2% but stayed under 4%."
        : "Risk exceeded 4% of the account.",
  });

  const rrVerdict: Verdict =
    m.plannedRR == null || m.r == null ? "missing" : m.r >= m.plannedRR * 0.8 ? "followed" : m.r >= 0 ? "minor" : "major";
  rows.push({
    id: "rr",
    area: "Expected R:R",
    planned: m.plannedRR == null ? "—" : `${m.plannedRR.toFixed(2)}R`,
    actual: m.r == null ? "—" : `${m.r.toFixed(2)}R`,
    verdict: rrVerdict,
    why:
      m.plannedRR == null || m.r == null
        ? "Planned or realised R is missing."
        : rrVerdict === "followed"
        ? "Realised R landed within 20% of plan."
        : rrVerdict === "minor"
        ? "Realised R fell short of plan but stayed positive."
        : "The trade closed below its risk line.",
  });

  const mistakes = entry.mistakes ?? [];
  const managementBreaks = mistakes.filter((x) => ["moved_stop_loss", "no_stop_loss", "over_leveraged", "ignored_plan"].includes(x));
  rows.push({
    id: "management",
    area: "Management",
    planned: "Hold the plan once live",
    actual: managementBreaks.length ? managementBreaks.map(mistakeLabel).join(", ") : mistakes.length ? "Minor tags logged" : "No deviations logged",
    verdict: managementBreaks.length ? "major" : mistakes.length ? "minor" : entry.mistakes ? "followed" : "missing",
    why: managementBreaks.length
      ? "You tagged a rule-breaking management action."
      : mistakes.length
      ? "Mistake tags exist but none break a hard rule."
      : "No mistakes were tagged on this trade.",
  });

  const confidence = n(entry.confidence);
  rows.push({
    id: "psych",
    area: "State",
    planned: confidence == null ? "—" : `Confidence ${confidence}%`,
    actual: (entry.emotions ?? []).length ? (entry.emotions ?? []).join(", ") : "—",
    verdict: confidence == null && !(entry.emotions ?? []).length ? "missing" : "followed",
    why: "Recorded state is shown for context only — no causal claim is made.",
  });

  const weights: Record<Verdict, number> = { followed: 1, minor: 0.6, major: 0, missing: 0 };
  const judged = rows.filter((r) => r.verdict !== "missing");
  const adherence = judged.length ? Math.round((judged.reduce((a, r) => a + weights[r.verdict], 0) / judged.length) * 100) : null;

  return { rows, adherence };
}

function isStopHit(entry: JournalEntry, exit: number, sl: number): boolean {
  const tol = Math.abs(sl) * 0.0005;
  return Math.abs(exit - sl) <= Math.max(tol, 1e-8);
}
function reachedTarget(entry: JournalEntry, exit: number, tp: number): boolean {
  return entry.direction === "short" ? exit <= tp : exit >= tp;
}

/* ------------------------------------------------------------------ */
/* Mistakes                                                            */
/* ------------------------------------------------------------------ */

export type MistakeGroup = "setup" | "entry" | "risk" | "management" | "exit" | "psychology" | "process";

const MISTAKE_GROUP: Record<string, MistakeGroup> = {
  entered_early: "entry",
  entered_late: "entry",
  missed_confirmation: "setup",
  no_stop_loss: "risk",
  poor_risk_mgmt: "risk",
  over_leveraged: "risk",
  moved_stop_loss: "management",
  ignored_plan: "management",
  overtrading: "process",
  revenge_trade: "psychology",
};

export type MistakeItem = {
  value: string;
  label: string;
  group: MistakeGroup;
  source: "user" | "rule";
  evidence: string | null;
  costR: number | null;
  correct: string;
  occurrences: number;
};

const CORRECT_BEHAVIOUR: Record<string, string> = {
  entered_early: "Wait for the confirmation candle to close before entering.",
  entered_late: "Set an alert at the level and enter on the first retest.",
  missed_confirmation: "Require your named confirmation before risk goes on.",
  no_stop_loss: "Place a stop with the entry order, never after.",
  poor_risk_mgmt: "Size from the stop distance, not from conviction.",
  over_leveraged: "Cap risk at your written per-trade budget.",
  moved_stop_loss: "Stops move to break-even only, never wider.",
  ignored_plan: "If the plan is wrong, close the trade — don't improvise.",
  overtrading: "Cap trades per session and stop when the cap is hit.",
  revenge_trade: "Enforce a cooling-off period after a loss.",
};

export function buildMistakes(entry: JournalEntry, all: JournalEntry[], m: StoryMetrics): MistakeItem[] {
  const counts = new Map<string, number>();
  for (const e of all) for (const v of e.mistakes ?? []) counts.set(v, (counts.get(v) ?? 0) + 1);

  const items: MistakeItem[] = (entry.mistakes ?? []).map((v) => ({
    value: v,
    label: mistakeLabel(v),
    group: MISTAKE_GROUP[v] ?? "process",
    source: "user" as const,
    evidence: null,
    costR: null,
    correct: CORRECT_BEHAVIOUR[v] ?? "Write the rule that would have prevented this.",
    occurrences: counts.get(v) ?? 1,
  }));

  const has = new Set(items.map((i) => i.value));

  // Rule-detected, only where the data is unambiguous.
  if (!has.has("no_stop_loss") && n(entry.stop_loss) == null && n(entry.entry_price) != null) {
    items.push({
      value: "no_stop_loss",
      label: "No stop loss recorded",
      group: "risk",
      source: "rule",
      evidence: "The entry has no stop_loss value.",
      costR: null,
      correct: CORRECT_BEHAVIOUR.no_stop_loss,
      occurrences: counts.get("no_stop_loss") ?? 0,
    });
  }
  if (m.riskPct != null && m.riskPct > 2) {
    items.push({
      value: "over_leveraged",
      label: "Risk above budget",
      group: "risk",
      source: "rule",
      evidence: `Risk recorded at ${m.riskPct.toFixed(2)}% versus a 2% budget.`,
      costR: null,
      correct: CORRECT_BEHAVIOUR.over_leveraged,
      occurrences: counts.get("over_leveraged") ?? 0,
    });
  }
  if (m.exitEfficiency != null && m.exitEfficiency < 35 && (m.netPnl ?? 0) > 0) {
    items.push({
      value: "early_exit",
      label: "Exited well before the extreme",
      group: "exit",
      source: "rule",
      evidence: `Captured ${Math.round(m.exitEfficiency)}% of the favourable excursion.`,
      costR: null,
      correct: "Scale out in planned steps instead of closing on the first pullback.",
      occurrences: 0,
    });
  }

  return items;
}

/* ------------------------------------------------------------------ */
/* Playbook match                                                      */
/* ------------------------------------------------------------------ */

export type RuleVerdict = { id: string; label: string; state: "followed" | "missed" | "broken"; why: string };

export function playbookMatch(entry: JournalEntry, m: StoryMetrics) {
  const checklist = Array.isArray(entry.checklist) ? (entry.checklist as unknown as { id: string; label: string; checked: boolean }[]) : [];
  const rules: RuleVerdict[] = checklist.map((c) => ({
    id: c.id,
    label: c.label,
    state: c.checked ? "followed" : "missed",
    why: c.checked ? "You ticked this rule on the trade." : "Rule left unticked on the trade.",
  }));

  const mistakes = entry.mistakes ?? [];
  if (mistakes.includes("moved_stop_loss")) rules.push({ id: "stop_integrity", label: "Stop stayed where it was placed", state: "broken", why: "Tagged “Moved Stop Loss”." });
  if (m.riskPct != null) {
    rules.push({
      id: "risk_budget",
      label: "Risk within 2%",
      state: m.riskPct <= 2 ? "followed" : "broken",
      why: `Recorded risk ${m.riskPct.toFixed(2)}%.`,
    });
  }
  if (n(entry.stop_loss) != null) rules.push({ id: "stop_set", label: "Stop defined before entry", state: "followed", why: "A stop level is stored on the trade." });
  else rules.push({ id: "stop_set", label: "Stop defined before entry", state: "broken", why: "No stop level is stored on the trade." });

  const followed = rules.filter((r) => r.state === "followed").length;
  const pct = rules.length ? Math.round((followed / rules.length) * 100) : null;

  const quality = {
    setup: entry.setup ? scoreOf(entry.entry_quality) ?? null : null,
    entry: scoreOf(entry.entry_quality),
    management: scoreOf(entry.risk_mgmt),
    exit: scoreOf(entry.exit_quality),
  };

  return { rules, pct, quality };
}

function scoreOf(v: unknown): number | null {
  const x = n(v);
  return x == null ? null : Math.max(0, Math.min(100, x * 10));
}

/* ------------------------------------------------------------------ */
/* Similar trades                                                      */
/* ------------------------------------------------------------------ */

export type SimilarTrade = {
  entry: JournalEntry;
  score: number;
  similarity: string;
  difference: string;
};

export function similarTrades(entry: JournalEntry, all: JournalEntry[], limit = 4): SimilarTrade[] {
  const mine = new Set(entry.mistakes ?? []);
  const scored: SimilarTrade[] = [];

  for (const e of all) {
    if (e.id === entry.id || e.status === "draft") continue;
    const reasons: string[] = [];
    let score = 0;
    if (e.symbol && e.symbol === entry.symbol) { score += 3; reasons.push(`same symbol (${e.symbol})`); }
    if (e.setup && e.setup === entry.setup) { score += 3; reasons.push(`same setup (${setupLabel(e.setup)})`); }
    if (e.direction && e.direction === entry.direction) { score += 1; reasons.push(`same direction`); }
    if (e.session && e.session === entry.session) { score += 1; reasons.push(`same session`); }
    const sharedMistake = (e.mistakes ?? []).find((x) => mine.has(x));
    if (sharedMistake) { score += 2; reasons.push(`same mistake (${mistakeLabel(sharedMistake)})`); }
    if (score < 3) continue;

    const thisR = n(entry.rr);
    const thatR = n(e.rr);
    const diff =
      thisR != null && thatR != null && Math.abs(thisR - thatR) > 0.5
        ? `R differed: ${thatR.toFixed(2)}R vs ${thisR.toFixed(2)}R`
        : e.direction !== entry.direction
        ? "Opposite direction"
        : e.session !== entry.session
        ? `Different session (${sessionLabel(e.session as string)})`
        : "Comparable execution";

    scored.push({ entry: e, score, similarity: reasons[0] ?? "shared attributes", difference: diff });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* Improvement plan                                                    */
/* ------------------------------------------------------------------ */

export type PlanAction = { id: string; kind: "stop" | "continue" | "rule" | "drill" | "goal"; title: string; detail: string };

export function improvementPlan(entry: JournalEntry, m: StoryMetrics, mistakes: MistakeItem[]): PlanAction[] {
  const out: PlanAction[] = [];
  const worst = mistakes[0];

  out.push({
    id: "stop",
    kind: "stop",
    title: worst ? `Stop: ${worst.label.toLowerCase()}` : "Stop trading without a written plan",
    detail: worst?.correct ?? "Write the setup, stop and target before risk goes on.",
  });

  out.push({
    id: "continue",
    kind: "continue",
    title:
      m.riskPct != null && m.riskPct <= 2
        ? "Continue: sizing inside the risk budget"
        : (m.netPnl ?? 0) > 0
        ? "Continue: taking the setup you actually planned"
        : "Continue: journalling every trade",
    detail: "Repeatable behaviour from this trade worth protecting.",
  });

  out.push({
    id: "rule",
    kind: "rule",
    title: n(entry.stop_loss) == null ? "Reinforce: stop goes on with the entry" : "Reinforce: stop only moves to break-even",
    detail: "One rule, checkable at the end of the next session.",
  });

  out.push({
    id: "drill",
    kind: "drill",
    title: `Drill: replay ${entry.symbol ?? "this symbol"} ${entry.setup ? setupLabel(entry.setup).toLowerCase() : "setup"} three times`,
    detail: "Use Replay Studio to re-trade the same window until execution matches plan.",
  });

  out.push({
    id: "goal",
    kind: "goal",
    title:
      m.exitEfficiency != null
        ? `Goal: capture ≥ ${Math.min(90, Math.round((m.exitEfficiency ?? 0) + 15))}% of the favourable move next session`
        : "Goal: log stop, target and risk on every trade next session",
    detail: "Measurable, single-session target.",
  });

  return out;
}

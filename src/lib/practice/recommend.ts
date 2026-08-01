/**
 * Phase 9 · practice recommendations.
 *
 * Rule-based and evidence-first. Every recommendation states what it was
 * derived from and how big the sample was; thin evidence produces a low
 * confidence label rather than a confident claim. Unknown values never
 * generate a recommendation.
 */

import { DRILLS, findDrill, type DrillTemplate } from "./drills";
import type { Skill } from "./types";

export const RECOMMENDER_VERSION = "practice_rec_v1";

export type EvidenceLevel = "insufficient" | "low" | "moderate" | "high";

export interface RecommendationEvidence {
  /** e.g. "mistake:early_exit", "challenge:daily_loss", "skill:stop_placement". */
  source: string;
  detail: string;
  sampleSize: number;
}

export interface PracticeRecommendation {
  id: string;
  drillId: string;
  title: string;
  skill: Skill;
  reason: string;
  evidence: RecommendationEvidence;
  evidenceLevel: EvidenceLevel;
  origin: "rule" | "ai";
  recommenderVersion: string;
  /** Higher first. */
  priority: number;
}

export interface RecommendationInput {
  /** Mistake tag → number of occurrences observed in canonical review data. */
  mistakeCounts: Record<string, number>;
  /** Skill → { average score, attempts }; unknown scores must be omitted. */
  skillScores: Record<string, { average: number | null; attempts: number }>;
  /** Challenge rule ids that were breached, with counts. */
  challengeBreaches: Record<string, number>;
  /** Drill ids attempted recently, newest first — used to avoid repetition. */
  recentDrillIds: string[];
}

const MISTAKE_TO_DRILL: Record<string, string> = {
  early_exit: "hold_to_plan",
  moved_stop: "stop_discipline",
  widened_stop: "stop_discipline",
  overtrading: "entry_patience",
  late_entry: "entry_patience",
  chasing: "entry_patience",
  excessive_risk: "daily_loss_guard",
  no_target: "hold_to_plan",
  poor_management: "trade_management",
};

const SKILL_TO_DRILL: Partial<Record<Skill, string>> = {
  patience: "entry_patience",
  stop_placement: "stop_discipline",
  exit_discipline: "hold_to_plan",
  risk_discipline: "daily_loss_guard",
  trade_management: "trade_management",
};

const BREACH_TO_DRILL: Record<string, string> = {
  daily_loss: "daily_loss_guard",
  risk_per_trade: "daily_loss_guard",
  open_risk: "daily_loss_guard",
  max_drawdown: "daily_loss_guard",
};

export function evidenceLevel(sampleSize: number): EvidenceLevel {
  if (sampleSize <= 0) return "insufficient";
  if (sampleSize < 3) return "low";
  if (sampleSize < 8) return "moderate";
  return "high";
}

export function recommendPractice(input: RecommendationInput, limit = 4): PracticeRecommendation[] {
  const out: PracticeRecommendation[] = [];
  const seen = new Set<string>();
  const recent = new Set(input.recentDrillIds.slice(0, 3));

  const push = (drill: DrillTemplate | null, rec: Omit<PracticeRecommendation, "id" | "drillId" | "title" | "skill" | "recommenderVersion" | "evidenceLevel">) => {
    if (!drill || seen.has(drill.id)) return;
    seen.add(drill.id);
    out.push({
      id: `${RECOMMENDER_VERSION}:${drill.id}`,
      drillId: drill.id,
      title: drill.title,
      skill: drill.skill,
      recommenderVersion: RECOMMENDER_VERSION,
      evidenceLevel: evidenceLevel(rec.evidence.sampleSize),
      ...rec,
      // Recently attempted drills drop down the list instead of disappearing.
      priority: recent.has(drill.id) ? rec.priority - 50 : rec.priority,
    });
  };

  for (const [mistake, count] of Object.entries(input.mistakeCounts)) {
    if (!count || count < 1) continue;
    const drill = findDrill(MISTAKE_TO_DRILL[mistake] ?? "");
    push(drill, {
      reason: `${mistake.replace(/_/g, " ")} appeared in ${count} reviewed trade(s).`,
      evidence: { source: `mistake:${mistake}`, detail: "Review Mode / Improvement Intelligence", sampleSize: count },
      origin: "rule",
      priority: 100 + count,
    });
  }

  for (const [ruleId, count] of Object.entries(input.challengeBreaches)) {
    if (!count) continue;
    const drill = findDrill(BREACH_TO_DRILL[ruleId] ?? "");
    push(drill, {
      reason: `Challenge rule "${ruleId.replace(/_/g, " ")}" was breached ${count} time(s).`,
      evidence: { source: `challenge:${ruleId}`, detail: "Canonical challenge evaluator", sampleSize: count },
      origin: "rule",
      priority: 120 + count,
    });
  }

  for (const [skill, stat] of Object.entries(input.skillScores)) {
    if (stat.average == null || stat.attempts <= 0) continue; // unknown never recommends
    if (stat.average >= 70) continue;
    const drill = findDrill(SKILL_TO_DRILL[skill as Skill] ?? "");
    push(drill, {
      reason: `${skill.replace(/_/g, " ")} averages ${stat.average}/100 across ${stat.attempts} attempt(s).`,
      evidence: { source: `skill:${skill}`, detail: "Versioned skill results", sampleSize: stat.attempts },
      origin: "rule",
      priority: 80 + (70 - stat.average),
    });
  }

  if (!out.length) {
    // No evidence yet: offer a starter drill and say so plainly.
    const starter = DRILLS.find((d) => d.difficulty === "starter") ?? DRILLS[0]!;
    push(starter, {
      reason: "Not enough reviewed practice yet to spot a weakness — start here to build a baseline.",
      evidence: { source: "baseline", detail: "No qualifying evidence", sampleSize: 0 },
      origin: "rule",
      priority: 10,
    });
  }

  return out.sort((a, b) => b.priority - a.priority).slice(0, limit);
}

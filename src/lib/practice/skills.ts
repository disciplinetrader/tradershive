/**
 * Phase 9 · skill progression.
 *
 * Skill level is DERIVED from attempts, never stored as a mutable number.
 * Historical results are immutable and carry the score version that produced
 * them, so re-scoring later never rewrites the past.
 */

import type { DrillResult } from "./evaluate";
import type { Skill } from "./types";

export const SKILL_MODEL_VERSION = "skill_v1";

export interface SkillResultRecord {
  id?: string;
  skill: Skill;
  score: number | null;
  scoreVersion: string;
  sampleSize: number;
  evidence: Record<string, unknown>;
  sourceSessionId: string | null;
  sourceAssignmentId: string | null;
  sourceDrillId: string | null;
  createdAt: string;
}

export interface SkillProgress {
  skill: Skill;
  attempts: number;
  /** Mean of the scored attempts; null when every attempt was unknown. */
  average: number | null;
  latest: number | null;
  best: number | null;
  /** latest − mean of the earlier attempts; null without a baseline. */
  delta: number | null;
  scoreVersions: string[];
  /** Fewer than three scored attempts is not a trend. */
  confidence: "insufficient" | "low" | "moderate" | "high";
}

export function skillResultFromDrill(input: {
  result: DrillResult;
  skill: Skill;
  sessionId: string | null;
  assignmentId: string | null;
  createdAt?: string;
}): SkillResultRecord {
  const { result } = input;
  return {
    skill: input.skill,
    score: result.score,
    scoreVersion: result.scoreVersion,
    sampleSize: result.sampleSize,
    evidence: {
      drillId: result.drillId,
      drillVersion: result.drillVersion,
      violations: result.violations.map((v) => v.ruleId),
      objectives: result.objectives.map((o) => ({ id: o.id, status: o.status })),
    },
    sourceSessionId: input.sessionId,
    sourceAssignmentId: input.assignmentId,
    sourceDrillId: result.drillId,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export function deriveSkillProgress(records: SkillResultRecord[]): SkillProgress[] {
  const bySkill = new Map<Skill, SkillResultRecord[]>();
  for (const rec of records) {
    const arr = bySkill.get(rec.skill);
    if (arr) arr.push(rec);
    else bySkill.set(rec.skill, [rec]);
  }

  const out: SkillProgress[] = [];
  for (const [skill, all] of bySkill) {
    const ordered = [...all].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    const scored = ordered.filter((r) => typeof r.score === "number") as (SkillResultRecord & { score: number })[];
    const latest = scored.length ? scored[scored.length - 1]!.score : null;
    const earlier = scored.slice(0, -1);
    const average = scored.length ? round(scored.reduce((s, r) => s + r.score, 0) / scored.length) : null;
    const baseline = earlier.length ? earlier.reduce((s, r) => s + r.score, 0) / earlier.length : null;

    out.push({
      skill,
      attempts: ordered.length,
      average,
      latest,
      best: scored.length ? Math.max(...scored.map((r) => r.score)) : null,
      delta: latest != null && baseline != null ? round(latest - baseline) : null,
      scoreVersions: [...new Set(ordered.map((r) => r.scoreVersion))],
      confidence:
        scored.length === 0 ? "insufficient" : scored.length < 3 ? "low" : scored.length < 8 ? "moderate" : "high",
    });
  }
  return out.sort((a, b) => (a.skill < b.skill ? -1 : 1));
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

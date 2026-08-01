/**
 * Phase 9 · practice domain types.
 *
 * A practice assignment is a brief. It never owns execution, a clock or a
 * trade model — it points at a canonical Replay session and is scored from
 * canonical ClosedTrades.
 */

export const PRACTICE_MODEL_VERSION = 1;

export type PracticeType =
  | "free"
  | "guided_drill"
  | "playbook"
  | "mistake_correction"
  | "trade_management"
  | "risk"
  | "surprise";

export type PracticeStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "abandoned";

export type Skill =
  | "setup_recognition"
  | "entry_timing"
  | "stop_placement"
  | "position_sizing"
  | "risk_discipline"
  | "trade_management"
  | "exit_discipline"
  | "patience"
  | "rule_adherence"
  | "playbook_adherence"
  | "review_quality"
  | "consistency";

export const SKILL_LABEL: Record<Skill, string> = {
  setup_recognition: "Setup recognition",
  entry_timing: "Entry timing",
  stop_placement: "Stop placement",
  position_sizing: "Position sizing",
  risk_discipline: "Risk discipline",
  trade_management: "Trade management",
  exit_discipline: "Exit discipline",
  patience: "Patience",
  rule_adherence: "Rule adherence",
  playbook_adherence: "Playbook adherence",
  review_quality: "Review quality",
  consistency: "Consistency",
};

export const PRACTICE_TYPE_LABEL: Record<PracticeType, string> = {
  free: "Free practice",
  guided_drill: "Guided drill",
  playbook: "Playbook practice",
  mistake_correction: "Mistake correction",
  trade_management: "Trade management",
  risk: "Risk practice",
  surprise: "Surprise session",
};

export interface PracticeAssignment {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  practiceType: PracticeType;
  targetSkill: Skill | null;
  targetMistake: string | null;
  playbookId: string | null;
  drillId: string | null;
  drillVersion: number | null;
  symbolRules: { allowed?: string[]; symbol?: string };
  timeframeRules: { timeframe?: string };
  datasetRules: { market?: string; from?: number; to?: number; provider?: string };
  riskRules: { maxRiskPctPerTrade?: number; dailyLossPct?: number; startingBalance?: number };
  tradeRules: { minTrades?: number; maxTrades?: number };
  completion: { requiresReview?: boolean; minTrades?: number };
  scoringProfile: string;
  createdSource: "user" | "recommendation" | "coach" | "challenge" | "review";
  coachSource: string | null;
  dueAt: string | null;
  status: PracticeStatus;
  replaySessionId: string | null;
  reviewSessionId: string | null;
  /** Server-side only for blind sessions; never sent to an active practice UI. */
  hiddenContext: Record<string, unknown>;
  result: Record<string, unknown>;
  version: number;
  completedAt: string | null;
  createdAt: string;
}

/** Everything the launcher may show for a blind/surprise assignment. */
export type SafeAssignment = Omit<PracticeAssignment, "hiddenContext" | "datasetRules"> & {
  datasetRules: Record<string, never> | PracticeAssignment["datasetRules"];
  blind: boolean;
};

/**
 * Strips outcome-revealing context from an assignment before it reaches an
 * ACTIVE blind practice surface. Applied server-side; the UI is not the
 * safety boundary.
 */
export function toSafeAssignment(a: PracticeAssignment, opts: { revealed: boolean }): SafeAssignment {
  const blind = a.practiceType === "surprise" && !opts.revealed;
  const { hiddenContext: _hidden, datasetRules, ...rest } = a;
  return {
    ...rest,
    blind,
    datasetRules: blind ? {} : datasetRules,
  };
}

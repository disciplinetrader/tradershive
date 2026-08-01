/**
 * Phase 9 · versioned drill catalog.
 *
 * Drills are pure specifications. Every objective states whether it can be
 * measured from canonical execution facts ("objective") or whether it is a
 * reflection prompt the trader answers ("reflection"). Nothing here executes,
 * prices or sizes anything.
 */

import type { Skill } from "./types";

export const DRILL_CATALOG_VERSION = 1;

export type DrillDifficulty = "starter" | "core" | "advanced";

export interface DrillObjective {
  id: string;
  label: string;
  /** objective = measured from ClosedTrades / order history. */
  kind: "objective" | "reflection";
  weight: number;
}

export interface DrillTemplate {
  id: string;
  version: number;
  title: string;
  description: string;
  skill: Skill;
  difficulty: DrillDifficulty;
  /** Hard rules the evaluator checks. */
  rules: {
    maxTrades?: number;
    minTrades?: number;
    maxRiskPctPerTrade?: number;
    dailyLossPct?: number;
    stopRequiredBeforeEntry?: boolean;
    stopWideningForbidden?: boolean;
    targetRequiredBeforeEntry?: boolean;
    minHoldBars?: number;
  };
  objectives: DrillObjective[];
  checklist: string[];
  scoreVersion: string;
}

const V = DRILL_CATALOG_VERSION;

export const DRILLS: DrillTemplate[] = [
  {
    id: "entry_patience",
    version: V,
    title: "Entry patience",
    description: "At most two entries. Wait for the setup instead of chasing.",
    skill: "patience",
    difficulty: "starter",
    rules: { maxTrades: 2, minTrades: 1 },
    objectives: [
      { id: "trade_count", label: "Took no more than two entries", kind: "objective", weight: 2 },
      { id: "no_chase", label: "No entry chased far from the trigger", kind: "reflection", weight: 1 },
    ],
    checklist: ["Did every entry match the plan?", "Did you skip a marginal setup?"],
    scoreVersion: "drill_score_v1",
  },
  {
    id: "stop_discipline",
    version: V,
    title: "Stop discipline",
    description: "Define the stop before entry and never widen it.",
    skill: "stop_placement",
    difficulty: "core",
    rules: { stopRequiredBeforeEntry: true, stopWideningForbidden: true, minTrades: 1 },
    objectives: [
      { id: "stop_defined", label: "Every trade had a stop at fill", kind: "objective", weight: 2 },
      { id: "no_widening", label: "No stop was widened", kind: "objective", weight: 3 },
    ],
    checklist: ["Was each stop at a structural level?"],
    scoreVersion: "drill_score_v1",
  },
  {
    id: "hold_to_plan",
    version: V,
    title: "Hold to plan",
    description: "Define target and invalidation up front, then let the trade work.",
    skill: "exit_discipline",
    difficulty: "core",
    rules: { targetRequiredBeforeEntry: true, stopRequiredBeforeEntry: true, minTrades: 1 },
    objectives: [
      { id: "target_defined", label: "Every trade had a target at fill", kind: "objective", weight: 2 },
      { id: "no_early_exit", label: "No manual exit before stop or target", kind: "objective", weight: 3 },
    ],
    checklist: ["What made you want to exit early?"],
    scoreVersion: "drill_score_v1",
  },
  {
    id: "daily_loss_guard",
    version: V,
    title: "Daily loss guard",
    description: "Respect a hard daily loss limit and stop trading once it is hit.",
    skill: "risk_discipline",
    difficulty: "core",
    rules: { dailyLossPct: 2, maxRiskPctPerTrade: 1, minTrades: 1 },
    objectives: [
      { id: "risk_cap", label: "No trade risked more than 1%", kind: "objective", weight: 2 },
      { id: "loss_limit", label: "Stopped trading at the daily limit", kind: "objective", weight: 3 },
    ],
    checklist: ["Did you feel pressure to make it back?"],
    scoreVersion: "drill_score_v1",
  },
  {
    id: "trade_management",
    version: V,
    title: "Trade management",
    description: "Practise break-even moves, partials and trailing without abandoning the plan.",
    skill: "trade_management",
    difficulty: "advanced",
    rules: { minTrades: 1, maxTrades: 4, stopRequiredBeforeEntry: true },
    objectives: [
      { id: "managed", label: "Managed at least one trade after entry", kind: "objective", weight: 2 },
      { id: "no_widening", label: "No stop was widened", kind: "objective", weight: 2 },
    ],
    checklist: ["Did management improve or damage the outcome?"],
    scoreVersion: "drill_score_v1",
  },
];

export function findDrill(id: string): DrillTemplate | null {
  return DRILLS.find((d) => d.id === id) ?? null;
}

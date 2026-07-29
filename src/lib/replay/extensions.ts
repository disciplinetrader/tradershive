/**
 * Replay Learning Extension Points
 * ----------------------------------------------------------------------------
 * Interfaces + a lightweight registry for future learning modules. No UI is
 * shipped for these yet — this file exists so the Replay surface can register
 * and consume providers without further refactors when we build them.
 *
 * Future modules planned:
 *   - Execution Score        (grade of each fill's context)
 *   - Rule Violations        (playbook / risk rule breaches)
 *   - Decision Review        (per-decision AI critique post-session)
 *   - Prediction Mode        (draw next N candles, score against actual)
 *   - Adaptive Coaching      (tailor Coach output to recent behaviour)
 */
import type { ReplaySession, ReplayTrade, Candle } from "./types";

export type ReplayContextSnapshot = {
  session: ReplaySession;
  candles: Candle[];
  trades: ReplayTrade[];
};

export type ExecutionScore = {
  trade_id: string;
  score: number; // 0-100
  reasons: string[];
};

export type RuleViolation = {
  trade_id?: string | null;
  rule: string;
  severity: "info" | "warning" | "critical";
  detail: string;
};

export type DecisionReview = {
  trade_id: string;
  observation: string;
  lesson: string;
  recommendation: string;
};

export type PredictionAttempt = {
  attempted_at: string;
  drawn_points: Array<{ t: number; price: number }>;
  actual_points: Array<{ t: number; price: number }>;
  score: number; // 0-100
};

export interface ExecutionScoreProvider {
  id: string;
  scoreTrades(ctx: ReplayContextSnapshot): Promise<ExecutionScore[]>;
}

export interface RuleViolationProvider {
  id: string;
  detect(ctx: ReplayContextSnapshot): Promise<RuleViolation[]>;
}

export interface DecisionReviewProvider {
  id: string;
  review(ctx: ReplayContextSnapshot): Promise<DecisionReview[]>;
}

export interface PredictionModeProvider {
  id: string;
  evaluate(input: {
    ctx: ReplayContextSnapshot;
    drawn: Array<{ t: number; price: number }>;
  }): Promise<PredictionAttempt>;
}

export interface AdaptiveCoachingProvider {
  id: string;
  adapt(ctx: ReplayContextSnapshot): Promise<{ focus: string; nudge: string }>;
}

type ProviderRegistry = {
  executionScore: ExecutionScoreProvider[];
  ruleViolations: RuleViolationProvider[];
  decisionReview: DecisionReviewProvider[];
  predictionMode: PredictionModeProvider[];
  adaptiveCoaching: AdaptiveCoachingProvider[];
};

const registry: ProviderRegistry = {
  executionScore: [],
  ruleViolations: [],
  decisionReview: [],
  predictionMode: [],
  adaptiveCoaching: [],
};

export function registerReplayExtension<
  K extends keyof ProviderRegistry,
>(kind: K, provider: ProviderRegistry[K][number]) {
  const list = registry[kind] as Array<typeof provider>;
  if (list.some((p) => p.id === provider.id)) return;
  list.push(provider);
}

export function getReplayExtensions<K extends keyof ProviderRegistry>(kind: K): ProviderRegistry[K] {
  return registry[kind];
}

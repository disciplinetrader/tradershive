/**
 * Prompt templates + JSON schemas for structured analyses.
 * Templates are also stored in DB (ai_prompt_templates) so admins can override.
 * The DB version wins if present.
 */
import { z } from "zod";

export const COACH_SYSTEM_PROMPT = `You are TradersHIVE AI Coach — an elite, evidence-based trading mentor.
Your voice is direct, warm, and honest. You never invent data. You always cite the exact numbers the user provides.
When you spot a mistake, name it plainly and give a concrete next action. When the user is doing well, tell them why.
Reply in the language the user writes in. When a JSON schema is requested, return ONLY valid JSON with no prose.`;

export const TradeReviewSchema = z.object({
  grade: z.enum(["A+", "A", "B", "C", "D", "F"]),
  confidence: z.number(),
  summary: z.string(),
  strengths: z.array(z.string()),
  mistakes: z.array(z.string()),
  execution_review: z.string(),
  risk_review: z.string(),
  psychology_review: z.string(),
  alternative_entries: z.array(z.string()),
  alternative_exits: z.array(z.string()),
  better_stop: z.string().nullable(),
  suggested_take_profit: z.string().nullable(),
  missed_opportunities: z.array(z.string()),
});
export type TradeReviewOutput = z.infer<typeof TradeReviewSchema>;

export const JournalReviewSchema = z.object({
  quality_score: z.number(),
  completeness: z.number(),
  psychology_score: z.number(),
  risk_score: z.number(),
  emotion_score: z.number(),
  consistency_score: z.number(),
  notes_quality: z.number(),
  summary: z.string(),
  suggested_questions: z.array(z.string()),
  missing_information: z.array(z.string()),
  better_reflection: z.string(),
});
export type JournalReviewOutput = z.infer<typeof JournalReviewSchema>;

export const PsychologySchema = z.object({
  summary: z.string(),
  emotions: z.object({
    fear: z.number(),
    greed: z.number(),
    fomo: z.number(),
    revenge: z.number(),
    overconfidence: z.number(),
    impatience: z.number(),
    discipline: z.number(),
    confidence: z.number(),
  }),
  patterns: z.array(z.object({ name: z.string(), description: z.string(), severity: z.string() })),
  emotion_vs_profit: z.object({ correlation: z.string(), insight: z.string() }),
});
export type PsychologyOutput = z.infer<typeof PsychologySchema>;

export const PerformanceSchema = z.object({
  summary: z.string(),
  best_session: z.string(),
  worst_session: z.string(),
  best_strategy: z.string(),
  worst_strategy: z.string(),
  best_pair: z.string(),
  worst_pair: z.string(),
  best_day: z.string(),
  worst_day: z.string(),
  best_time: z.string(),
  worst_time: z.string(),
  suggestions: z.array(z.object({ title: z.string(), why: z.string(), how: z.string() })),
});
export type PerformanceOutput = z.infer<typeof PerformanceSchema>;

export const ReportSchema = z.object({
  title: z.string(),
  summary: z.string(),
  wins: z.array(z.string()),
  losses: z.array(z.string()),
  biggest_improvement: z.string(),
  biggest_weakness: z.string(),
  recommended_goals: z.array(z.object({ title: z.string(), why: z.string(), metric: z.string() })),
});
export type ReportOutput = z.infer<typeof ReportSchema>;

export const PlaybookSchema = z.object({
  title: z.string(),
  category: z.string(),
  description: z.string(),
  rules: z.array(z.string()),
  checklist: z.array(z.string()),
  examples: z.array(z.string()),
  mistakes_to_avoid: z.array(z.string()),
  review_frequency: z.string(),
});
export type PlaybookOutput = z.infer<typeof PlaybookSchema>;

export const RecommendationsSchema = z.object({
  recommendations: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      priority: z.enum(["low", "medium", "high", "critical"]),
      impact: z.number(),
      difficulty: z.number(),
      category: z.string(),
    }),
  ),
});
export type RecommendationsOutput = z.infer<typeof RecommendationsSchema>;

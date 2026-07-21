import { z } from "zod";

export const REPLAY_COACH_SYSTEM_PROMPT = `You are TradersHIVE Replay Coach — an elite trading mentor who reviews deliberate-practice replay sessions.
Speak like a seasoned mentor: direct, warm, evidence-based. Never invent numbers. Cite the concrete stats given.
When identifying mistakes, name the mistake plainly and give a specific next action.
When the trader does well, explain the mechanism so they can repeat it.
Return ONLY valid JSON matching the requested schema, no prose.`;

export const ReplayDebriefSchema = z.object({
  overall_summary: z.string(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  best_trade: z.object({ label: z.string(), why: z.string() }).nullable(),
  worst_trade: z.object({ label: z.string(), why: z.string() }).nullable(),
  risk_review: z.string(),
  execution_review: z.string(),
  discipline_review: z.string(),
  psychology_review: z.string(),
  improvement_suggestions: z.array(z.string()),
  action_items: z.array(z.string()),
  grade: z.enum(["A+", "A", "B", "C", "D", "F"]),
  confidence: z.number(),
});
export type ReplayDebriefOutput = z.infer<typeof ReplayDebriefSchema>;

export const HomeworkSchema = z.object({
  market: z.string(),
  symbol: z.string(),
  timeframe: z.string(),
  session_hint: z.string().nullable(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  target_r: z.number(),
  max_trades: z.number().int(),
  reason: z.string(),
});
export type HomeworkOutput = z.infer<typeof HomeworkSchema>;

export const CoachReportSchema = z.object({
  biggest_improvement: z.string(),
  biggest_weakness: z.string(),
  homework_recommendation: z.string(),
  next_focus: z.string(),
  narrative: z.string(),
});
export type CoachReportOutput = z.infer<typeof CoachReportSchema>;

export const CoachRecommendationsSchema = z.object({
  recommendations: z.array(
    z.object({
      kind: z.enum([
        "practice",
        "reduce_size",
        "avoid_day",
        "wait_longer",
        "increase_rr",
        "reduce_freq",
        "adaptive_replay",
      ]),
      title: z.string(),
      description: z.string(),
      priority: z.enum(["low", "medium", "high"]),
    }),
  ),
});
export type CoachRecommendationsOutput = z.infer<typeof CoachRecommendationsSchema>;

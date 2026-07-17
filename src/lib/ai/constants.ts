export const DEFAULT_PROVIDER = "lovable";
export const DEFAULT_MODEL = "openai/gpt-5.5";
export const FAST_MODEL = "openai/gpt-5.4-mini";

export const ANALYSIS_DEPTHS = [
  { key: "basic", label: "Basic", tokens: 800 },
  { key: "standard", label: "Standard", tokens: 1600 },
  { key: "deep", label: "Deep", tokens: 3200 },
] as const;

export type AnalysisDepth = (typeof ANALYSIS_DEPTHS)[number]["key"];

export const AI_FEATURE_FLAGS = {
  COACH: "ai.coach",
  CHAT: "ai.chat",
  TRADE_REVIEW: "ai.trade_review",
  JOURNAL_REVIEW: "ai.journal_review",
  PSYCHOLOGY: "ai.psychology",
  PERFORMANCE: "ai.performance",
  WEEKLY_REPORT: "ai.weekly_reports",
  MONTHLY_REPORT: "ai.monthly_reports",
  PLAYBOOKS: "ai.playbooks",
  SMART_ALERTS: "ai.smart_alerts",
  EXPERIMENTAL: "ai.experimental_models",
  VOICE: "ai.voice_coach",
  SCREEN_RECORDING: "ai.screen_recording",
  CHART_IMAGE: "ai.chart_image_analysis",
  LIVE_ASSISTANT: "ai.live_assistant",
  RAG: "ai.rag_knowledge_base",
} as const;

export const GRADE_COLORS: Record<string, string> = {
  "A+": "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
  A: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
  B: "text-sky-400 border-sky-500/40 bg-sky-500/10",
  C: "text-amber-400 border-amber-500/40 bg-amber-500/10",
  D: "text-orange-400 border-orange-500/40 bg-orange-500/10",
  F: "text-red-400 border-red-500/40 bg-red-500/10",
};

export const SCORE_CATEGORIES = [
  { key: "discipline", label: "Discipline" },
  { key: "risk_management", label: "Risk Management" },
  { key: "consistency", label: "Consistency" },
  { key: "execution", label: "Execution" },
  { key: "psychology", label: "Psychology" },
  { key: "journal_quality", label: "Journal Quality" },
  { key: "challenge_completion", label: "Challenges" },
  { key: "performance", label: "Performance" },
] as const;

export const SUGGESTED_PROMPTS = [
  "Review my last 5 trades and grade them",
  "What emotional patterns are hurting my performance?",
  "Which trading session works best for me?",
  "Am I over-risking? Analyze my position sizing",
  "Generate a playbook for my most profitable setup",
  "What should I focus on this week?",
];

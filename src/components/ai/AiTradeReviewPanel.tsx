/**
 * AI Trade Review Panel
 * ---------------------
 * Presentational component that renders a structured, coach-style review of a
 * completed trade. It is deliberately provider-agnostic: the `review` prop
 * matches the shape a future AI backend will return, and a demo placeholder
 * is provided when no review is available yet.
 *
 * Sections: Overall Score, Summary, Strengths, Improvements, Risk Management,
 * Psychology, Execution, Next Practice Goal.
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ShieldCheck,
  HeartPulse,
  Target,
  Flag,
  Sparkles,
  FileText,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type AiReviewTone = "positive" | "suggestion" | "critical" | "neutral";

export type AiReviewBullet = {
  text: string;
  tone?: AiReviewTone;
};

export type AiTradeReview = {
  overall_score?: number | null;
  grade?: string | null;
  summary?: string | null;
  strengths?: Array<string | AiReviewBullet>;
  improvements?: Array<string | AiReviewBullet>;
  risk_management?: string | null;
  psychology?: string | null;
  execution?: string | null;
  next_practice_goal?: string | null;
  generated_at?: string | null;
  model?: string | null;
};

const DEMO_REVIEW: AiTradeReview = {
  overall_score: 82,
  grade: "A",
  summary:
    "Good trend-following long trade with disciplined risk. Entry aligned with the higher-timeframe trend and stop placement respected market structure.",
  strengths: [
    { text: "Followed the trading plan", tone: "positive" },
    { text: "Clean entry at pullback into demand", tone: "positive" },
    { text: "Stop-loss placed below invalidation", tone: "positive" },
  ],
  improvements: [
    { text: "Took profits slightly early — could have let runners work", tone: "suggestion" },
    { text: "Position size on the smaller side for a high-conviction setup", tone: "suggestion" },
  ],
  risk_management:
    "Risk was well-defined at 0.8R with a hard stop. Total account exposure stayed within your rules. Consider scaling out in tranches instead of fully closing at first target.",
  psychology:
    "Stayed patient throughout the trade. No premature exits driven by fear, and no revenge trades logged afterward. Emotional discipline was a clear strength here.",
  execution:
    "Order placement was precise, spread was reasonable, and fills matched intended levels. No hesitation between signal and execution.",
  next_practice_goal:
    "Practice trailing your stop behind swing structure to capture more of the extended move on similar trend-continuation setups.",
  generated_at: null,
  model: "demo",
};

function toneStyles(tone: AiReviewTone) {
  switch (tone) {
    case "positive":
      return {
        icon: CheckCircle2,
        text: "text-success",
        bg: "bg-success/10",
        border: "border-success/30",
        dot: "bg-success",
      };
    case "suggestion":
      return {
        icon: AlertTriangle,
        text: "text-warning",
        bg: "bg-warning/10",
        border: "border-warning/30",
        dot: "bg-warning",
      };
    case "critical":
      return {
        icon: XCircle,
        text: "text-danger",
        bg: "bg-danger/10",
        border: "border-danger/30",
        dot: "bg-danger",
      };
    default:
      return {
        icon: Sparkles,
        text: "text-muted-foreground",
        bg: "bg-muted/20",
        border: "border-border/60",
        dot: "bg-muted-foreground",
      };
  }
}

function scoreTone(score: number): AiReviewTone {
  if (score >= 75) return "positive";
  if (score >= 50) return "suggestion";
  return "critical";
}

function normalizeBullets(items?: Array<string | AiReviewBullet>, fallbackTone: AiReviewTone = "neutral"): AiReviewBullet[] {
  if (!items?.length) return [];
  return items.map((item) =>
    typeof item === "string" ? { text: item, tone: fallbackTone } : { tone: fallbackTone, ...item },
  );
}

export function AiTradeReviewPanel({
  review,
  isDemo,
  onGenerate,
  isGenerating,
}: {
  review?: AiTradeReview | null;
  isDemo?: boolean;
  onGenerate?: () => void;
  isGenerating?: boolean;
}) {
  const data = review ?? DEMO_REVIEW;
  const demo = isDemo ?? !review;

  const score = typeof data.overall_score === "number" ? Math.max(0, Math.min(100, data.overall_score)) : null;
  const st = score != null ? toneStyles(scoreTone(score)) : toneStyles("neutral");

  const strengths = normalizeBullets(data.strengths, "positive");
  const improvements = normalizeBullets(data.improvements, "suggestion");

  return (
    <div className="space-y-3">
      {demo ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-dashed border-border/60 bg-background/40 px-3 py-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Preview review — AI analysis is not connected yet. Structure and layout are production-ready.
          </div>
          {onGenerate ? (
            <Button size="sm" variant="outline" onClick={onGenerate} disabled={isGenerating}>
              <Brain className="mr-1.5 h-3.5 w-3.5" />
              {isGenerating ? "Generating…" : "Generate"}
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* Header: overall score + grade + summary */}
      <GlassCard className="p-4">
        <div className="flex items-start gap-4">
          <div className={cn("relative flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-2", st.border, st.bg)}>
            <div className="text-center">
              <div className={cn("text-2xl font-black tabular-nums leading-none", st.text)}>
                {score != null ? score.toFixed(0) : "—"}
              </div>
              <div className="mt-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">/ 100</div>
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">AI Trade Review</div>
              {data.grade ? (
                <Badge variant="outline" className={cn("text-[10px] font-bold", st.text, st.border)}>
                  Grade {data.grade}
                </Badge>
              ) : null}
              {demo ? <Badge variant="outline" className="text-[10px]">Demo</Badge> : null}
            </div>
            <h3 className="mt-1 text-base font-semibold leading-snug">Trade Summary</h3>
            {data.summary ? (
              <p className="mt-1 text-sm text-foreground/90">{data.summary}</p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground italic">No summary available yet.</p>
            )}
          </div>
        </div>
      </GlassCard>

      <div className="grid gap-3 md:grid-cols-2">
        <BulletSection
          title="What Went Well"
          icon={CheckCircle2}
          tone="positive"
          bullets={strengths}
          emptyLabel="No strengths detected yet."
        />
        <BulletSection
          title="Areas for Improvement"
          icon={AlertTriangle}
          tone="suggestion"
          bullets={improvements}
          emptyLabel="No improvements suggested yet."
        />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <TextSection
          title="Risk Management"
          icon={ShieldCheck}
          tone="neutral"
          body={data.risk_management}
        />
        <TextSection
          title="Psychology"
          icon={HeartPulse}
          tone="neutral"
          body={data.psychology}
        />
        <TextSection
          title="Execution"
          icon={Target}
          tone="neutral"
          body={data.execution}
        />
      </div>

      <NextGoalCard body={data.next_practice_goal} />

      {data.generated_at || data.model ? (
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <FileText className="h-3 w-3" />
            {data.model ? <span>Model: {data.model}</span> : null}
          </div>
          {data.generated_at ? <span>Generated {new Date(data.generated_at).toLocaleString()}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------- Building blocks -------------------------- */

function SectionCard({
  title,
  icon: Icon,
  tone = "neutral",
  defaultOpen = true,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: AiReviewTone;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const st = toneStyles(tone);
  return (
    <GlassCard className={cn("overflow-hidden p-0", st.border)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-background/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
      >
        <div className="flex items-center gap-2">
          <span className={cn("flex h-7 w-7 items-center justify-center rounded-md", st.bg)}>
            <Icon className={cn("h-4 w-4", st.text)} />
          </span>
          <span className="text-sm font-semibold">{title}</span>
        </div>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <div className="border-t border-border/50 px-4 py-3">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </GlassCard>
  );
}

function BulletSection({
  title,
  icon,
  tone,
  bullets,
  emptyLabel,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: AiReviewTone;
  bullets: AiReviewBullet[];
  emptyLabel: string;
}) {
  return (
    <SectionCard title={title} icon={icon} tone={tone}>
      {bullets.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">{emptyLabel}</p>
      ) : (
        <ul className="space-y-1.5">
          {bullets.map((b, i) => {
            const bs = toneStyles(b.tone ?? tone);
            const BIcon = bs.icon;
            return (
              <li key={i} className="flex items-start gap-2 text-sm">
                <BIcon className={cn("mt-0.5 h-4 w-4 shrink-0", bs.text)} />
                <span className="text-foreground/90">{b.text}</span>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

function TextSection({
  title,
  icon,
  tone,
  body,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: AiReviewTone;
  body?: string | null;
}) {
  return (
    <SectionCard title={title} icon={icon} tone={tone}>
      {body ? (
        <p className="text-sm text-foreground/90 whitespace-pre-wrap">{body}</p>
      ) : (
        <p className="text-xs text-muted-foreground italic">No analysis available yet.</p>
      )}
    </SectionCard>
  );
}

function NextGoalCard({ body }: { body?: string | null }) {
  return (
    <GlassCard className="p-4 border-primary/30 bg-primary/5">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15">
          <Flag className="h-4 w-4 text-primary" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wider text-primary/80">Next Practice Goal</div>
          <p className="mt-0.5 text-sm font-medium text-foreground">
            {body ?? "Set a concrete practice goal for your next session."}
          </p>
        </div>
      </div>
    </GlassCard>
  );
}

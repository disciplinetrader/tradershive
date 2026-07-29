/**
 * Today's Insight — one AI/coach observation, one CTA.
 *
 * Replaces the previous "AI Coach" / Coach Tips section. Prioritisation:
 * risk > psychology > review > practice > consistency.
 */

import { Link } from "@tanstack/react-router";
import { Brain, GraduationCap, HeartPulse, ShieldAlert, Sparkles, TrendingUp } from "lucide-react";
import type { HomeCoachTip } from "@/lib/dashboard-home.functions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TAG_ICON = {
  risk: ShieldAlert,
  psychology: HeartPulse,
  review: GraduationCap,
  practice: Brain,
  consistency: TrendingUp,
} as const;

const CTA_BY_TAG: Record<HomeCoachTip["tag"], { label: string; href: string }> = {
  risk: { label: "Open Analytics", href: "/analytics" },
  psychology: { label: "Review trades", href: "/journal" },
  review: { label: "Open Journal", href: "/journal" },
  practice: { label: "Start Replay", href: "/replay" },
  consistency: { label: "Open Dashboard", href: "/dashboard" },
};

const PRIORITY: Record<HomeCoachTip["tag"], number> = {
  risk: 0,
  psychology: 1,
  review: 2,
  practice: 3,
  consistency: 4,
};

export function TodaysInsight({ tips }: { tips: HomeCoachTip[] }) {
  if (!tips.length) return null;
  const top = [...tips].sort((a, b) => PRIORITY[a.tag] - PRIORITY[b.tag])[0];
  const Icon = TAG_ICON[top.tag] ?? Sparkles;
  const cta = CTA_BY_TAG[top.tag];

  return (
    <section aria-label="Today's insight" className="rounded-2xl border border-border/50 bg-card/60 p-4 backdrop-blur">
      <div className="flex items-start gap-3">
        <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary")}>
          <Icon className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/80">Today's Insight</p>
          <p className="mt-1 text-sm leading-snug text-foreground">{top.title}. {top.body}</p>
        </div>
        <Button asChild size="sm" variant="outline" className="shrink-0">
          <Link to={cta.href}>{cta.label}</Link>
        </Button>
      </div>
    </section>
  );
}

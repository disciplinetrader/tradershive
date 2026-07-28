/**
 * Adaptive Dashboard Hero.
 *
 * Renders a single card that answers "What should I do next?" based on the
 * user's current state. Priority (highest wins):
 *
 *   1. Active Prop Firm Challenge     → Resume Challenge
 *   2. Daily Active User              → Continue Today's Session
 *   3. Replay Started (no journal)    → Review Replay
 *   4. Returning User (has replay)    → Continue Last Replay
 *   5. New User (empty platform)      → Start First Replay
 */

import { useMemo } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowRight, BookOpen, Flame, PlayCircle, Rocket, Shield, Sparkles, Target } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import type { HeroChallenge, HeroState } from "@/lib/dashboard-hero.functions";
import { setActivePropChallenge } from "@/lib/prop-challenges/active-session";
import { cn } from "@/lib/utils";

type HeroTone = "primary" | "success" | "warning" | "accent" | "muted";

type HeroConfig = {
  key: string;
  eyebrow: string;
  headline: string;
  description: string;
  primary: { label: string; href: string; onClick?: () => void };
  secondary?: { label: string; href: string };
  progress?: { value: number; label: string };
  icon: typeof Rocket;
  tone: HeroTone;
};

const TONES: Record<HeroTone, { bg: string; ring: string; icon: string; badge: string }> = {
  primary: {
    bg: "bg-gradient-to-br from-primary/15 via-primary/5 to-transparent",
    ring: "ring-1 ring-primary/25",
    icon: "bg-primary/15 text-primary",
    badge: "bg-primary/15 text-primary border-primary/25",
  },
  success: {
    bg: "bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent",
    ring: "ring-1 ring-emerald-500/25",
    icon: "bg-emerald-500/15 text-emerald-400",
    badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  },
  warning: {
    bg: "bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-transparent",
    ring: "ring-1 ring-amber-500/25",
    icon: "bg-amber-500/15 text-amber-400",
    badge: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  },
  accent: {
    bg: "bg-gradient-to-br from-fuchsia-500/15 via-fuchsia-500/5 to-transparent",
    ring: "ring-1 ring-fuchsia-500/25",
    icon: "bg-fuchsia-500/15 text-fuchsia-400",
    badge: "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/25",
  },
  muted: {
    bg: "bg-gradient-to-br from-muted/40 via-muted/10 to-transparent",
    ring: "ring-1 ring-border/60",
    icon: "bg-muted/40 text-muted-foreground",
    badge: "bg-muted/40 text-muted-foreground border-border/60",
  },
};

function isToday(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function decide(state: HeroState): HeroConfig {
  const activeChallenge: HeroChallenge | null = state.activeChallenges[0] ?? null;

  // 1 — Active prop firm challenge takes priority (contractual pressure).
  if (activeChallenge) {
    const target = activeChallenge.targetPct ?? 0;
    const profit = activeChallenge.profitPct ?? 0;
    const progressValue = target > 0 ? Math.max(0, Math.min(100, (profit / target) * 100)) : 0;
    const daysLabel =
      activeChallenge.daysTotal != null && activeChallenge.daysElapsed != null
        ? `Day ${activeChallenge.daysElapsed}/${activeChallenge.daysTotal}`
        : "";
    return {
      key: "prop_challenge",
      eyebrow: activeChallenge.name ?? "Prop Firm Challenge",
      headline: "You have an active challenge running.",
      description:
        target > 0
          ? `You're ${profit.toFixed(2)}% of the way to a ${target.toFixed(0)}% profit target. ${daysLabel}`.trim()
          : "Resume the workspace to continue executing your challenge plan.",
      primary: {
        label: "Resume Challenge",
        href: "/trading",
        onClick: () =>
          setActivePropChallenge({
            id: activeChallenge.id,
            paper_account_id: activeChallenge.paperAccountId,
          }),
      },
      secondary: { label: "View challenge", href: `/prop-challenges/${activeChallenge.id}` },
      progress: target > 0 ? { value: progressValue, label: `${profit.toFixed(2)}% / ${target.toFixed(0)}%` } : undefined,
      icon: Shield,
      tone: "accent",
    };
  }

  // 2 — Daily active user (traded today already).
  if (state.tradesToday > 0) {
    return {
      key: "dau",
      eyebrow: "Today",
      headline: "Pick up where you left off.",
      description: `You've logged ${state.tradesToday} trade${state.tradesToday === 1 ? "" : "s"} today. Continue your session and keep the flow.`,
      primary: { label: "Continue Today's Session", href: "/trading" },
      secondary: { label: "Open journal", href: "/journal" },
      icon: Flame,
      tone: "success",
    };
  }

  // 3 — Replay exists but no journal entries yet.
  if (state.lastReplay && state.journalCount === 0) {
    return {
      key: "replay_review",
      eyebrow: "Replay Session",
      headline: "Review your first replay.",
      description:
        "You've completed a replay session. Log what you learned — it powers your coach and analytics.",
      primary: { label: "Review Replay", href: "/journal" },
      secondary: { label: "Run another replay", href: "/replay" },
      icon: BookOpen,
      tone: "warning",
    };
  }

  // 4 — Returning user with replays.
  if (state.lastReplay) {
    const symbol = state.lastReplay.symbol ?? "market";
    return {
      key: "returning",
      eyebrow: "Welcome back",
      headline: "Continue your last replay.",
      description: `Your last session was on ${symbol}. Jump back in or try a new scenario.`,
      primary: { label: "Continue Last Replay", href: "/replay" },
      secondary: { label: "Start something new", href: "/replay" },
      icon: PlayCircle,
      tone: "primary",
    };
  }

  // 5 — Brand new user.
  return {
    key: "new_user",
    eyebrow: "Welcome to TradersHIVE",
    headline: "Run your first replay in under 2 minutes.",
    description: "Replay lets you practise real setups on historical data — no risk, no waiting for markets to open.",
    primary: { label: "Start First Replay", href: "/replay" },
    secondary: { label: "Take the tour", href: "/dashboard" },
    icon: Rocket,
    tone: "primary",
  };
}

export function DashboardHero({ state }: { state: HeroState | undefined }) {
  const navigate = useNavigate();
  const config = useMemo(() => (state ? decide(state) : null), [state]);

  if (!state || !config) {
    return (
      <div
        aria-busy="true"
        className="h-40 rounded-3xl border border-border/40 bg-card/40 animate-shimmer"
      />
    );
  }

  const tone = TONES[config.tone];
  const Icon = config.icon;

  const handlePrimary = () => {
    config.primary.onClick?.();
    void navigate({ to: config.primary.href });
  };

  return (
    <motion.section
      key={config.key}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      aria-labelledby="hero-heading"
      className={cn(
        "relative overflow-hidden rounded-3xl border border-border/50 p-6 md:p-8",
        tone.bg,
        tone.ring,
      )}
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl" aria-hidden />
      <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 items-start gap-4">
          <div className={cn("hidden shrink-0 items-center justify-center rounded-2xl p-3 sm:flex", tone.icon)}>
            <Icon className="h-6 w-6" aria-hidden />
          </div>
          <div className="min-w-0 space-y-2">
            <Badge variant="outline" className={cn("uppercase tracking-wider text-[10px]", tone.badge)}>
              <Sparkles className="mr-1 h-3 w-3" aria-hidden />
              {config.eyebrow}
            </Badge>
            <h2 id="hero-heading" className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              {config.headline}
            </h2>
            <p className="max-w-2xl text-sm text-muted-foreground md:text-base">{config.description}</p>
            {config.progress ? (
              <div className="max-w-md space-y-1.5 pt-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Target className="h-3 w-3" aria-hidden /> Progress to target
                  </span>
                  <span className="font-medium text-foreground">{config.progress.label}</span>
                </div>
                <Progress value={config.progress.value} aria-label="Progress to target" />
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2 md:items-end">
          <Button size="lg" onClick={handlePrimary} className="min-w-[220px] gap-2">
            {config.primary.label}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
          {config.secondary ? (
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              <Link to={config.secondary.href}>{config.secondary.label}</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </motion.section>
  );
}

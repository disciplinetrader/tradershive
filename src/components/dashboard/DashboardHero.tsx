/**
 * Adaptive Dashboard Hero — Mission Control.
 *
 * Contains only: a small greeting label, one recommendation, one primary CTA.
 * Everything else has been intentionally removed to eliminate competing
 * actions. Contextual "Continue Session" metadata is surfaced when a
 * resumable session exists (replay or today's trading session).
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowRight, BookOpen, Clock, Flame, PlayCircle, Rocket, Shield, Target } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/use-auth";
import type { HeroChallenge, HeroReplay, HeroState } from "@/lib/dashboard-hero.functions";
import { setActivePropChallenge } from "@/lib/prop-challenges/active-session";
import { cn } from "@/lib/utils";

type HeroTone = "primary" | "success" | "warning" | "accent" | "muted";

type ContinueMeta = {
  label: string;
  detail?: string;
  progressPct?: number;
  lastActivityIso?: string | null;
};

type HeroConfig = {
  key: string;
  eyebrow: string;
  headline: string;
  description: string;
  primary: { label: string; href: string; onClick?: () => void };
  continueMeta?: ContinueMeta;
  progress?: { value: number; label: string };
  icon: typeof Rocket;
  tone: HeroTone;
};

const TONES: Record<HeroTone, { bg: string; ring: string; icon: string }> = {
  primary: {
    bg: "bg-gradient-to-br from-primary/12 via-primary/5 to-transparent",
    ring: "ring-1 ring-primary/20",
    icon: "bg-primary/15 text-primary",
  },
  success: {
    bg: "bg-gradient-to-br from-emerald-500/12 via-emerald-500/5 to-transparent",
    ring: "ring-1 ring-emerald-500/20",
    icon: "bg-emerald-500/15 text-emerald-400",
  },
  warning: {
    bg: "bg-gradient-to-br from-amber-500/12 via-amber-500/5 to-transparent",
    ring: "ring-1 ring-amber-500/20",
    icon: "bg-amber-500/15 text-amber-400",
  },
  accent: {
    bg: "bg-gradient-to-br from-fuchsia-500/12 via-fuchsia-500/5 to-transparent",
    ring: "ring-1 ring-fuchsia-500/20",
    icon: "bg-fuchsia-500/15 text-fuchsia-400",
  },
  muted: {
    bg: "bg-gradient-to-br from-muted/40 via-muted/10 to-transparent",
    ring: "ring-1 ring-border/60",
    icon: "bg-muted/40 text-muted-foreground",
  },
};

function partOfDay(hour: number): string {
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function relTime(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const diffMs = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return undefined;
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function replayContinue(r: HeroReplay): ContinueMeta {
  const pct = Math.max(0, Math.min(100, r.completionPct ?? 0));
  const parts = [r.symbol ?? "market", r.timeframe ?? null, pct > 0 ? `${pct.toFixed(0)}% complete` : null]
    .filter(Boolean)
    .join(" · ");
  const remainingSec = Math.max(0, Math.round((r.durationSeconds ?? 0) * (1 - pct / 100)));
  const remaining =
    remainingSec >= 60 ? `${Math.round(remainingSec / 60)} minute${Math.round(remainingSec / 60) === 1 ? "" : "s"} remaining` : undefined;
  return {
    label: "Continue where you left off",
    detail: [parts, remaining].filter(Boolean).join(" — "),
    progressPct: pct > 0 ? pct : undefined,
    lastActivityIso: r.updatedAt,
  };
}

function decide(state: HeroState): HeroConfig {
  const activeChallenge: HeroChallenge | null = state.activeChallenges[0] ?? null;

  // 1 — Active prop firm challenge (contractual pressure).
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
      headline: "Resume your challenge run.",
      description:
        target > 0
          ? `${profit.toFixed(2)}% of ${target.toFixed(0)}% target${daysLabel ? ` · ${daysLabel}` : ""}`
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
      headline: "Resume Paper Trading",
      description: `You've logged ${state.tradesToday} trade${state.tradesToday === 1 ? "" : "s"} today — pick up the session and keep the flow.`,
      primary: { label: "Resume Paper Trading", href: "/trading" },
      continueMeta: {
        label: "Session",
        detail: `${state.tradesToday} trade${state.tradesToday === 1 ? "" : "s"} today`,
        lastActivityIso: state.lastTradeAt,
      },
      icon: Flame,
      tone: "success",
    };
  }

  // 3 — Replay exists but no journal entries yet.
  if (state.lastReplay && !state.lastReplay.hasJournal) {
    return {
      key: "replay_review",
      eyebrow: "Follow-up",
      headline: "Journal your last replay",
      description: "Capture what you saw while it's fresh — it powers your coach and analytics.",
      primary: { label: "Journal Yesterday", href: "/journal" },
      continueMeta: replayContinue(state.lastReplay),
      icon: BookOpen,
      tone: "warning",
    };
  }

  // 4 — Returning user with replays.
  if (state.lastReplay) {
    return {
      key: "returning",
      eyebrow: "Replay",
      headline: "Resume Replay",
      description: `Continue your ${state.lastReplay.symbol ?? "market"} session or launch a new scenario.`,
      primary: { label: "Resume Replay", href: "/replay" },
      continueMeta: replayContinue(state.lastReplay),
      icon: PlayCircle,
      tone: "primary",
    };
  }

  // 5 — Brand new user.
  return {
    key: "new_user",
    eyebrow: "Welcome to TradersHIVE",
    headline: "Run your first replay in under 2 minutes.",
    description: "Practise real setups on historical data — no risk, no waiting for markets to open.",
    primary: { label: "Start First Replay", href: "/replay" },
    icon: Rocket,
    tone: "primary",
  };
}

export function DashboardHero({ state, animate = true }: { state: HeroState | undefined; animate?: boolean }) {
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const config = useMemo(() => (state ? decide(state) : null), [state]);

  // Live-refresh "X minutes ago" without re-fetching.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const firstName =
    profile?.first_name ||
    profile?.display_name?.split(" ")[0] ||
    profile?.username ||
    user?.email?.split("@")[0] ||
    null;

  const tz = profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const greeting = partOfDay(
    Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: tz })),
  );
  const greetingLine = firstName ? `${greeting}, ${firstName}.` : `${greeting}.`;

  if (!state || !config) {
    return <div aria-busy="true" className="h-32 rounded-3xl border border-border/40 bg-card/40 animate-shimmer" />;
  }

  const tone = TONES[config.tone];
  const Icon = config.icon;
  const rel = relTime(config.continueMeta?.lastActivityIso ?? null);

  const handlePrimary = () => {
    config.primary.onClick?.();
    void navigate({ to: config.primary.href });
  };

  const Wrapper = animate ? motion.section : "section";
  const motionProps = animate
    ? { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3 } }
    : {};

  return (
    <Wrapper
      key={config.key}
      aria-labelledby="hero-heading"
      className={cn("relative overflow-hidden rounded-3xl border border-border/50 p-5 md:p-6", tone.bg, tone.ring)}
      {...(motionProps as any)}
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" aria-hidden />
      <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 items-start gap-4">
          <div className={cn("hidden shrink-0 items-center justify-center rounded-2xl p-3 sm:flex", tone.icon)}>
            <Icon className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 space-y-1.5">
            <p className="text-xs text-muted-foreground">
              {greetingLine} <span className="text-muted-foreground/70">{config.eyebrow}</span>
            </p>
            <h2 id="hero-heading" className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">
              {config.headline}
            </h2>
            <p className="max-w-2xl text-sm text-muted-foreground">{config.description}</p>

            {config.continueMeta ? (
              <div className="pt-2 space-y-1.5">
                {config.continueMeta.detail ? (
                  <p className="text-xs font-medium text-foreground/90">{config.continueMeta.detail}</p>
                ) : null}
                {config.continueMeta.progressPct != null ? (
                  <Progress
                    value={config.continueMeta.progressPct}
                    aria-label="Session progress"
                    className="max-w-sm h-1.5"
                  />
                ) : null}
                {rel ? (
                  <p className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock className="h-3 w-3" aria-hidden /> Last activity {rel}
                  </p>
                ) : null}
              </div>
            ) : null}

            {config.progress ? (
              <div className="max-w-md space-y-1 pt-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Target className="h-3 w-3" aria-hidden /> Progress to target
                  </span>
                  <span className="font-medium text-foreground">{config.progress.label}</span>
                </div>
                <Progress value={config.progress.value} aria-label="Progress to target" className="h-1.5" />
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 md:items-end">
          <Button size="lg" onClick={handlePrimary} className="min-w-[220px] gap-2">
            {config.primary.label}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>
    </Wrapper>
  );
}

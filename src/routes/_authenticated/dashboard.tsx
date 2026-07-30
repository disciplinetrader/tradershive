import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { Eye, Star, Target } from "lucide-react";

import { DisclosureSection, Surface } from "@/components/ds";
import { Watchlist } from "@/components/dashboard/Watchlist";
import { CustomizeSheet, type WidgetDef } from "@/components/dashboard/CustomizeSheet";
import { getDashboardLayout, saveDashboardLayout } from "@/lib/dashboard.functions";
import { getHomeSummary } from "@/lib/dashboard-home.functions";
import { getHeroState } from "@/lib/dashboard-hero.functions";
import { DashboardHero } from "@/components/dashboard/DashboardHero";
import { DashboardTodayRail } from "@/components/dashboard/DashboardTodayRail";
import { TodayFocusCard } from "@/components/dashboard/TodayFocusCard";
import { PerformanceSection } from "@/components/dashboard/PerformanceSection";
import { RecentActivitySection } from "@/components/dashboard/RecentActivitySection";
import { TodaysInsight } from "@/components/dashboard/TodaysInsight";
import { BetaBanner } from "@/components/beta/BetaBanner";
import { OnboardingChecklist } from "@/components/onboarding/OnboardingChecklist";
import { resolveDashboardMode } from "@/lib/dashboard-mode";

/**
 * Trader Command Center — Mission Control (Redesign Sprint 1).
 *
 * Answers a single question: "What should I do today?"
 *
 * Rank order:
 *   1. Hero            — recommendation + primary CTA, with a Today rail
 *                        (today's P&L, prop-firm status, quick actions)
 *   2. AI insight      — one observation, one CTA
 *   3. Performance     — equity curve + 3 headline KPIs (+3 deferred)
 *   4. Recent activity — trades / replay / reminders in one tabbed block
 *   5. Deferred        — Today's Focus detail and Watchlist behind disclosure
 *
 * Progressive disclosure keeps the default view ~30% lighter without removing
 * a single feature. No backend, API or business logic was changed.
 */
export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — TradersHIVE Arena" },
      { name: "description", content: "Your trading command center: one recommendation, one action, then the numbers." },
      { property: "og:title", content: "Dashboard — TradersHIVE Arena" },
      { property: "og:description", content: "Trader command center — what to do next, at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

const SECTIONS: WidgetDef[] = [
  { id: "performance", label: "Performance", group: "Command Center" },
  { id: "activity", label: "Recent activity", group: "Command Center" },
  { id: "focus", label: "Today's Focus", group: "Command Center" },
  { id: "watchlist", label: "Watchlist", group: "Command Center" },
  { id: "insight", label: "Today's Insight", group: "Coaching" },
];

const ANIM_SESSION_KEY = "dashboard:animated-once";

/**
 * Play dashboard entrance animations only on the first visit within a browser
 * session — subsequent visits render immediately to avoid information delay.
 */
function useFirstVisitAnimation(): boolean {
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    try {
      const seen = sessionStorage.getItem(ANIM_SESSION_KEY);
      if (!seen) {
        sessionStorage.setItem(ANIM_SESSION_KEY, "1");
        setAnimate(true);
      }
    } catch {
      /* storage unavailable — render without animation */
    }
  }, []);
  return animate;
}

function DashboardPage() {
  const fetchLayout = useServerFn(getDashboardLayout);
  const saveLayout = useServerFn(saveDashboardLayout);
  const fetchHome = useServerFn(getHomeSummary);
  const fetchHero = useServerFn(getHeroState);
  const animate = useFirstVisitAnimation();

  const { data: layout } = useQuery({
    queryKey: ["dashboard_layout"],
    queryFn: () => fetchLayout(),
    staleTime: 60_000,
  });
  const { data: home, isPending } = useQuery({
    queryKey: ["home_summary"],
    queryFn: () => fetchHome(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const { data: hero } = useQuery({
    queryKey: ["dashboard_hero"],
    queryFn: () => fetchHero(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // Future dashboard-mode routing (architecture only — no UI branching yet).
  const _mode = resolveDashboardMode(hero);
  void _mode;

  const [hidden, setHidden] = useState<Set<string>>(new Set());
  useEffect(() => { if (layout) setHidden(new Set(layout.hidden ?? [])); }, [layout]);

  const persistHidden = (next: Set<string>) => {
    setHidden(next);
    void saveLayout({ data: { hidden: Array.from(next), collapsed: layout?.collapsed ?? [] } });
  };

  const visible = useMemo(() => (id: string) => !hidden.has(id), [hidden]);

  const Section = animate ? motion.div : "div";
  const sectionProps = animate
    ? { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3 } }
    : {};

  return (
    <div className="space-y-6">
      <Section {...(sectionProps as any)}><BetaBanner /></Section>

      {/* 1 — Hero: one recommendation + one CTA, then today's state */}
      <Section {...(sectionProps as any)} className="space-y-3">
        <DashboardHero state={hero} animate={animate} />
        <DashboardTodayRail performance={home?.performance} hero={hero} />
      </Section>


      {/* 2 — One AI observation, one CTA */}
      {visible("insight") && home && home.tips.length > 0 ? (
        <Section {...(sectionProps as any)}>
          <TodaysInsight tips={home.tips} />
        </Section>
      ) : null}

      <Section {...(sectionProps as any)}>
        <OnboardingChecklist />
      </Section>

      {/* 3 — Performance */}
      {visible("performance") ? (
        <Section {...(sectionProps as any)}>
          {isPending || !home ? <PerformanceSkeleton /> : <PerformanceSection data={home.performance} />}
        </Section>
      ) : null}

      {/* 4 — Recent activity */}
      {visible("activity") ? (
        <Section {...(sectionProps as any)}>
          <RecentActivitySection hero={hero} actions={home?.actions ?? []} />
        </Section>
      ) : null}

      {/* 5 — Deferred detail: nothing removed, just out of the way */}
      <Section {...(sectionProps as any)} className="grid gap-3 lg:grid-cols-2">
        {visible("focus") ? (
          <DisclosureSection
            title="Today's focus detail"
            description="Replay minutes, journal debt, streak and goals"
            icon={Target}
            storageKey="dashboard-focus"
          >
            {home ? <TodayFocusCard data={home.focus} /> : <FocusSkeleton />}
          </DisclosureSection>
        ) : null}

        {visible("watchlist") ? (
          <DisclosureSection
            title="Watchlist"
            description="Symbols you're tracking"
            icon={Star}
            storageKey="dashboard-watchlist"
          >
            <Watchlist />
          </DisclosureSection>
        ) : null}
      </Section>

      <Section {...(sectionProps as any)} className="flex justify-end">
        <CustomizeSheet widgets={SECTIONS} hidden={hidden} onChange={persistHidden} />
      </Section>

      {hidden.size === SECTIONS.length ? (
        <Surface tone="muted" className="border-dashed p-10 text-center">
          <Eye className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">All sections are hidden. Open Customize to bring them back.</p>
        </Surface>
      ) : null}
    </div>
  );
}

function FocusSkeleton() {
  return <div className="h-40 rounded-2xl border border-border/40 bg-card/40 animate-shimmer" />;
}
function PerformanceSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl border border-border/40 bg-card/40 animate-shimmer" />
        ))}
      </div>
      <div className="h-72 rounded-2xl border border-border/40 bg-card/40 animate-shimmer" />
    </div>
  );
}

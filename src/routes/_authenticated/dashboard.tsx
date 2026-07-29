import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { Activity, Eye, Star } from "lucide-react";

import { RecentTrades } from "@/components/dashboard/RecentTrades";
import { Watchlist } from "@/components/dashboard/Watchlist";
import { WidgetShell } from "@/components/dashboard/WidgetShell";
import { CustomizeSheet, type WidgetDef } from "@/components/dashboard/CustomizeSheet";
import { getDashboardLayout, saveDashboardLayout } from "@/lib/dashboard.functions";
import { getHomeSummary } from "@/lib/dashboard-home.functions";
import { getHeroState } from "@/lib/dashboard-hero.functions";
import { DashboardHero } from "@/components/dashboard/DashboardHero";
import { TodayFocusCard } from "@/components/dashboard/TodayFocusCard";
import { PerformanceSnapshot } from "@/components/dashboard/PerformanceSnapshot";
import { ActionItemsList } from "@/components/dashboard/ActionItemsList";
import { TodaysInsight } from "@/components/dashboard/TodaysInsight";
import { BetaBanner } from "@/components/beta/BetaBanner";
import { OnboardingChecklist } from "@/components/onboarding/OnboardingChecklist";
import { resolveDashboardMode } from "@/lib/dashboard-mode";

/**
 * Trader Command Center — Mission Control.
 *
 * Answers a single question: "What should I do next?"
 * Rank order:
 *   1. Hero          — one recommendation + one primary CTA
 *   2. Performance   — Net PnL / Win Rate / Profit Factor (guarded)
 *   3. Today's Focus — action targets for the day
 *   4. Continue      — Recent trades + Watchlist
 *   5. Action items  — outstanding follow-ups
 *   6. Today's Insight (1 tip, 1 CTA)
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
  { id: "focus", label: "Today's Focus", group: "Command Center" },
  { id: "trades", label: "Recent trades", group: "Command Center" },
  { id: "watchlist", label: "Watchlist", group: "Command Center" },
  { id: "actions", label: "Action Items", group: "Command Center" },
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
  const wProps = (id: string) => ({
    id,
    collapsed: false,
    onToggleCollapsed: () => {},
    onHide: (wid: string) => {
      const next = new Set(hidden); next.add(wid); persistHidden(next);
    },
  });

  const Section = animate ? motion.div : "div";
  const sectionProps = animate
    ? { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3 } }
    : {};

  return (
    <div className="space-y-4">
      <Section {...(sectionProps as any)}><BetaBanner /></Section>

      {/* 1 — Hero (greeting embedded) + Performance are tighter together */}
      <div className="space-y-3">
        <Section {...(sectionProps as any)}>
          <DashboardHero state={hero} animate={animate} />
        </Section>

        {visible("performance") && (
          <Section {...(sectionProps as any)}>
            {isPending || !home ? <KpiSkeleton /> : <PerformanceSnapshot data={home.performance} />}
          </Section>
        )}
      </div>

      <Section {...(sectionProps as any)}>
        <OnboardingChecklist />
      </Section>

      {/* 3 — Today's Focus */}
      {visible("focus") && (
        <Section {...(sectionProps as any)}>
          {isPending || !home ? <FocusSkeleton /> : <TodayFocusCard data={home.focus} />}
        </Section>
      )}

      {/* 4 — Continue working */}
      {(visible("trades") || visible("watchlist")) && (
        <Section {...(sectionProps as any)} className="grid gap-4 lg:grid-cols-3">
          {visible("trades") && (
            <WidgetShell
              {...wProps("trades")}
              title="Recent trades"
              description="Last 10 executions"
              icon={Activity}
              className="lg:col-span-2"
            >
              <RecentTrades />
            </WidgetShell>
          )}
          {visible("watchlist") && (
            <WidgetShell
              {...wProps("watchlist")}
              title="Watchlist"
              description="Symbols you're tracking"
              icon={Star}
            >
              <Watchlist />
            </WidgetShell>
          )}
        </Section>
      )}

      {/* 5 — Action items */}
      {visible("actions") && (
        <Section {...(sectionProps as any)}>
          {isPending || !home ? <ActionsSkeleton /> : <ActionItemsList items={home.actions} />}
        </Section>
      )}

      {/* 6 — Today's Insight (single card, single CTA) */}
      {visible("insight") && home && home.tips.length > 0 && (
        <Section {...(sectionProps as any)}>
          <TodaysInsight tips={home.tips} />
        </Section>
      )}

      <Section {...(sectionProps as any)} className="flex justify-end">
        <CustomizeSheet widgets={SECTIONS} hidden={hidden} onChange={persistHidden} />
      </Section>

      {hidden.size === SECTIONS.length ? (
        <div className="rounded-3xl border border-dashed border-border/60 bg-surface/40 p-10 text-center">
          <Eye className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">All sections are hidden. Open Customize to bring them back.</p>
        </div>
      ) : null}
    </div>
  );
}

function FocusSkeleton() {
  return <div className="h-40 rounded-3xl border border-border/40 bg-card/40 animate-shimmer" />;
}
function KpiSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-24 rounded-2xl border border-border/40 bg-card/40 animate-shimmer" />
      ))}
    </div>
  );
}
function ActionsSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-20 rounded-2xl border border-border/40 bg-card/40 animate-shimmer" />
      ))}
    </div>
  );
}

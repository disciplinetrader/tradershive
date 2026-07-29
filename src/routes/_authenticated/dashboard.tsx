import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { Activity, ChevronDown, Eye, Star } from "lucide-react";

import { useCommandPalette } from "@/components/command-palette";
import { HeaderGreeting } from "@/components/dashboard/HeaderGreeting";
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
import { CoachTipsCard } from "@/components/dashboard/CoachTipsCard";
import { TopMistakeWidget } from "@/components/dashboard/TopMistakeWidget";
import { BetaBanner } from "@/components/beta/BetaBanner";
import { OnboardingChecklist } from "@/components/onboarding/OnboardingChecklist";
import { usePersistentDisclosure } from "@/hooks/use-persistent-disclosure";

/**
 * Trader Command Center.
 *
 * Answers, in order, within 5 seconds:
 *   1. How am I performing?      → Hero + Performance
 *   2. What should I do next?    → Hero CTA + Focus + Actions
 *   3. Where do I continue?      → Recent trades + Watchlist
 *
 * Secondary insights (coach tips, top mistake) live behind a collapse.
 * Achievements, XP and streaks moved to the Profile / Community surface.
 */
export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — TradersHIVE Arena" },
      { name: "description", content: "Your trading command center: performance, next action, and where to continue working." },
      { property: "og:title", content: "Dashboard — TradersHIVE Arena" },
      { property: "og:description", content: "Your trading command center." },
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
  { id: "coach", label: "Coach tips", group: "More insights" },
];

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.35 } } };

function DashboardPage() {
  const { setOpen } = useCommandPalette();
  const [moreOpen, , toggleMore] = usePersistentDisclosure("dashboard-more-v3", false);

  const fetchLayout = useServerFn(getDashboardLayout);
  const saveLayout = useServerFn(saveDashboardLayout);
  const fetchHome = useServerFn(getHomeSummary);
  const fetchHero = useServerFn(getHeroState);

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

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={item}><BetaBanner /></motion.div>

      {/* 0 — Greeting bar (slim, non-dominant) */}
      <motion.div variants={item}>
        <HeaderGreeting onOpenSearch={() => setOpen(true)} />
      </motion.div>

      {/* 1 — Hero: answers "What should I do next?" with a single primary CTA */}
      <motion.div variants={item}>
        <DashboardHero state={hero} />
      </motion.div>

      <motion.div variants={item}>
        <OnboardingChecklist />
      </motion.div>

      {/* 2 — Performance: answers "How am I performing?" */}
      {visible("performance") && (
        <motion.div variants={item}>
          {isPending || !home ? <KpiSkeleton /> : <PerformanceSnapshot data={home.performance} />}
        </motion.div>
      )}

      {/* 3 — Today's Focus: today-only action targets */}
      {visible("focus") && (
        <motion.div variants={item}>
          {isPending || !home ? <FocusSkeleton /> : <TodayFocusCard data={home.focus} />}
        </motion.div>
      )}

      {/* 4 — Continue working: Recent trades + Watchlist (promoted from behind a fold) */}
      {(visible("trades") || visible("watchlist")) && (
        <motion.div variants={item} className="grid gap-4 lg:grid-cols-3">
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
        </motion.div>
      )}

      {/* 5 — Action items: things that need attention this week */}
      {visible("actions") && (
        <motion.div variants={item}>
          {isPending || !home ? <ActionsSkeleton /> : <ActionItemsList items={home.actions} />}
        </motion.div>
      )}

      {/* More insights — coach tips + top mistake, collapsed by default */}
      {visible("coach") && (
        <motion.div variants={item} className="space-y-4">
          <button
            type="button"
            onClick={toggleMore}
            aria-expanded={moreOpen}
            className="group flex w-full items-center justify-between rounded-lg border border-border/60 bg-card/40 px-4 py-2.5 text-left transition hover:border-primary/40 hover:bg-card/70"
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Coaching insights</p>
              <p className="text-[11px] text-muted-foreground/70">AI tips and your most costly mistake</p>
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${moreOpen ? "rotate-180" : ""}`} />
          </button>

          {moreOpen && (
            <div className="grid gap-4 lg:grid-cols-2">
              {isPending || !home ? <CoachSkeleton /> : <CoachTipsCard tips={home.tips} />}
              <TopMistakeWidget />
            </div>
          )}
        </motion.div>
      )}

      <motion.div variants={item} className="flex justify-end">
        <CustomizeSheet widgets={SECTIONS} hidden={hidden} onChange={persistHidden} />
      </motion.div>

      {hidden.size === SECTIONS.length ? (
        <div className="rounded-3xl border border-dashed border-border/60 bg-surface/40 p-10 text-center">
          <Eye className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">All sections are hidden. Open Customize to bring them back.</p>
        </div>
      ) : null}
    </motion.div>
  );
}

function FocusSkeleton() {
  return <div className="h-48 rounded-3xl border border-border/40 bg-card/40 animate-shimmer" />;
}
function KpiSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
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
function CoachSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="h-28 rounded-2xl border border-border/40 bg-card/40 animate-shimmer" />
      ))}
    </div>
  );
}

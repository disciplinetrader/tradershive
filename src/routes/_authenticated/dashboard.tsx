import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { Activity, ChevronDown, Eye, Flame, Star, Trophy } from "lucide-react";

import { useCommandPalette } from "@/components/command-palette";
import { HeaderGreeting } from "@/components/dashboard/HeaderGreeting";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { RecentTrades } from "@/components/dashboard/RecentTrades";
import { Watchlist } from "@/components/dashboard/Watchlist";
import { StreakWidget } from "@/components/dashboard/StreakWidget";
import { XPWidget } from "@/components/dashboard/XPWidget";
import { WidgetShell } from "@/components/dashboard/WidgetShell";
import { CustomizeSheet, type WidgetDef } from "@/components/dashboard/CustomizeSheet";
import { getDashboardLayout, saveDashboardLayout } from "@/lib/dashboard.functions";
import { getHomeSummary } from "@/lib/dashboard-home.functions";
import { useMarketCadence } from "@/lib/market-data/hooks";
import { TodayFocusCard } from "@/components/dashboard/TodayFocusCard";
import { PerformanceSnapshot } from "@/components/dashboard/PerformanceSnapshot";
import { ActionItemsList } from "@/components/dashboard/ActionItemsList";
import { CoachTipsCard } from "@/components/dashboard/CoachTipsCard";
import { TopMistakeWidget } from "@/components/dashboard/TopMistakeWidget";
import { BetaBanner } from "@/components/beta/BetaBanner";
import { usePersistentDisclosure } from "@/hooks/use-persistent-disclosure";

/**
 * Trader Home 2.0 — four-section layout:
 *   1. Today's Focus        (What should I do today?)
 *   2. Performance Snapshot (How am I performing?)
 *   3. Action Items         (What needs attention?)
 *   4. Continuous Improvement (What's my next improvement?)
 *
 * All data is live from paper trades, journal, replay sessions and goals.
 * Personalisation (hidden/collapsed section state) persists per user via
 * the existing dashboard_layouts table.
 */
export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — TradersHIVE Arena" },
      { name: "description", content: "Your daily trading command center: today's focus, performance, action items and coaching." },
      { property: "og:title", content: "Dashboard — TradersHIVE Arena" },
      { property: "og:description", content: "Your daily trading command center." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

const SECTIONS: WidgetDef[] = [
  { id: "focus", label: "Today's Focus", group: "Home 2.0" },
  { id: "performance", label: "Performance Snapshot", group: "Home 2.0" },
  { id: "actions", label: "Action Items", group: "Home 2.0" },
  { id: "coach", label: "Continuous Improvement", group: "Home 2.0" },
  { id: "trades", label: "Recent trades", group: "More insights" },
  { id: "watchlist", label: "Watchlist", group: "More insights" },
  { id: "streak", label: "Streaks", group: "More insights" },
  { id: "xp", label: "XP & rank", group: "More insights" },
];

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.35 } } };

function DashboardPage() {
  useMarketCadence("dashboard");
  const { setOpen } = useCommandPalette();
  const [moreOpen, , toggleMore] = usePersistentDisclosure("dashboard-more-v2", false);

  const fetchLayout = useServerFn(getDashboardLayout);
  const saveLayout = useServerFn(saveDashboardLayout);
  const fetchHome = useServerFn(getHomeSummary);

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
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-8">
      <motion.div variants={item}><BetaBanner /></motion.div>

      <motion.div variants={item}>
        <HeaderGreeting onOpenSearch={() => setOpen(true)} />
      </motion.div>

      <motion.div variants={item} className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Quick actions</h2>
        </div>
        <CustomizeSheet widgets={SECTIONS} hidden={hidden} onChange={persistHidden} />
      </motion.div>

      <motion.div variants={item}><QuickActions /></motion.div>

      {/* Section 1 — Today's Focus */}
      {visible("focus") && (
        <motion.div variants={item}>
          {isPending || !home ? <FocusSkeleton /> : <TodayFocusCard data={home.focus} />}
        </motion.div>
      )}

      {/* Section 2 — Performance Snapshot */}
      {visible("performance") && (
        <motion.div variants={item}>
          {isPending || !home ? <KpiSkeleton /> : <PerformanceSnapshot data={home.performance} />}
        </motion.div>
      )}

      {/* Section 3 — Action Items */}
      {visible("actions") && (
        <motion.div variants={item}>
          {isPending || !home ? <ActionsSkeleton /> : <ActionItemsList items={home.actions} />}
        </motion.div>
      )}

      {/* Section 4 — Continuous Improvement */}
      {visible("coach") && (
        <motion.div variants={item} className="grid gap-4 lg:grid-cols-2">
          {isPending || !home ? <CoachSkeleton /> : <CoachTipsCard tips={home.tips} />}
          <TopMistakeWidget />
        </motion.div>
      )}

      {/* More insights — collapsed by default */}
      {(visible("xp") || visible("streak") || visible("trades") || visible("watchlist")) && (
        <motion.div variants={item} className="space-y-4">
          <button
            type="button"
            onClick={toggleMore}
            aria-expanded={moreOpen}
            className="group flex w-full items-center justify-between rounded-lg border border-border/60 bg-card/40 px-4 py-2.5 text-left transition hover:border-primary/40 hover:bg-card/70"
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">More insights</p>
              <p className="text-[11px] text-muted-foreground/70">XP, streaks, recent trades &amp; watchlist</p>
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${moreOpen ? "rotate-180" : ""}`} />
          </button>

          {moreOpen && (
            <div className="space-y-4">
              {(visible("xp") || visible("streak")) && (
                <div className="grid gap-4 md:grid-cols-2">
                  {visible("xp") && (
                    <WidgetShell {...wProps("xp")} title="XP & rank" icon={Trophy}><XPWidget /></WidgetShell>
                  )}
                  {visible("streak") && (
                    <WidgetShell {...wProps("streak")} title="Streaks" icon={Flame}><StreakWidget /></WidgetShell>
                  )}
                </div>
              )}
              {(visible("trades") || visible("watchlist")) && (
                <div className="grid gap-4 lg:grid-cols-3">
                  {visible("trades") && (
                    <WidgetShell {...wProps("trades")} title="Recent trades" description="Last 10 executions" icon={Activity} className="lg:col-span-2">
                      <RecentTrades />
                    </WidgetShell>
                  )}
                  {visible("watchlist") && (
                    <WidgetShell {...wProps("watchlist")} title="Watchlist" description="Symbols you're tracking" icon={Star}>
                      <Watchlist />
                    </WidgetShell>
                  )}
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}

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
    <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-7">
      {Array.from({ length: 7 }).map((_, i) => (
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
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-28 rounded-2xl border border-border/40 bg-card/40 animate-shimmer" />
      ))}
    </div>
  );
}

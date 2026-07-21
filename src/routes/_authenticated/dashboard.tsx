import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowUpRight,
  Award,
  Bell,
  Calendar as CalendarIcon,
  Eye,
  Flame,
  LineChart,
  ListChecks,
  Sparkles,
  StickyNote,
  Star,
  Trophy,
  User as UserIcon,
  Zap,
} from "lucide-react";
import { useCommandPalette } from "@/components/command-palette";
import { HeaderGreeting } from "@/components/dashboard/HeaderGreeting";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { WelcomeCard } from "@/components/dashboard/WelcomeCard";
import { TodaysChallenge } from "@/components/dashboard/TodaysChallenge";
import { RecentTrades } from "@/components/dashboard/RecentTrades";
import { Watchlist } from "@/components/dashboard/Watchlist";
import { MarketOverview } from "@/components/dashboard/MarketOverview";
import { StreakWidget } from "@/components/dashboard/StreakWidget";
import { XPWidget } from "@/components/dashboard/XPWidget";
import { Achievements } from "@/components/dashboard/Achievements";
import { NotificationsWidget } from "@/components/dashboard/NotificationsWidget";
import { CalendarWidget } from "@/components/dashboard/CalendarWidget";
import { ProductivityWidget } from "@/components/dashboard/ProductivityWidget";
import { QuickNotes } from "@/components/dashboard/QuickNotes";
import { LeaderboardPreview } from "@/components/dashboard/LeaderboardPreview";
import { ProfileSummary } from "@/components/dashboard/ProfileSummary";
import { WidgetShell } from "@/components/dashboard/WidgetShell";
import { CustomizeSheet, type WidgetDef } from "@/components/dashboard/CustomizeSheet";
import { getDashboardLayout, saveDashboardLayout } from "@/lib/dashboard.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — TradersHIVE Arena" },
      { name: "description", content: "Your personalized command center: challenges, stats, journal, watchlists and more." },
    ],
  }),
  component: DashboardPage,
});

const WIDGETS: WidgetDef[] = [
  { id: "welcome", label: "Welcome & progress", group: "Overview" },
  { id: "challenge", label: "Today's challenge", group: "Overview" },
  { id: "analytics_cta", label: "Analytics shortcut", group: "Overview" },
  { id: "trades", label: "Recent trades", group: "Trading" },
  { id: "watchlist", label: "Watchlist", group: "Trading" },
  { id: "markets", label: "Market overview", group: "Trading" },
  { id: "streak", label: "Streaks", group: "Gamification" },
  { id: "xp", label: "XP & rank", group: "Gamification" },
  { id: "achievements", label: "Achievements", group: "Gamification" },
  { id: "leaderboard", label: "Leaderboard preview", group: "Gamification" },
  { id: "notifications", label: "Notifications", group: "Productivity" },
  { id: "calendar", label: "Calendar", group: "Productivity" },
  { id: "productivity", label: "Today's goals", group: "Productivity" },
  { id: "notes", label: "Quick notes", group: "Productivity" },
  { id: "profile", label: "Profile summary", group: "Overview" },
];

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.04 } } };
const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.35 } } };

function DashboardPage() {
  const { setOpen } = useCommandPalette();
  const fetchLayout = useServerFn(getDashboardLayout);
  const saveLayout = useServerFn(saveDashboardLayout);
  const { data: layout } = useQuery({
    queryKey: ["dashboard_layout"],
    queryFn: () => fetchLayout(),
    staleTime: 60_000,
  });

  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!layout) return;
    setHidden(new Set(layout.hidden ?? []));
    setCollapsed(new Set(layout.collapsed ?? []));
  }, [layout]);

  function toggleCollapsed(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      void saveLayout({ data: { hidden: Array.from(hidden), collapsed: Array.from(next) } });
      return next;
    });
  }
  function hideWidget(id: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      next.add(id);
      void saveLayout({ data: { hidden: Array.from(next), collapsed: Array.from(collapsed) } });
      return next;
    });
  }

  const visible = useMemo(() => (id: string) => !hidden.has(id), [hidden]);
  const wProps = (id: string) => ({
    id,
    collapsed: collapsed.has(id),
    onToggleCollapsed: toggleCollapsed,
    onHide: hideWidget,
  });

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={item}>
        <HeaderGreeting onOpenSearch={() => setOpen(true)} />
      </motion.div>

      <motion.div variants={item} className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Quick actions</h2>
        </div>
        <CustomizeSheet widgets={WIDGETS} hidden={hidden} onChange={setHidden} />
      </motion.div>

      <motion.div variants={item}>
        <QuickActions />
      </motion.div>

      {/* Row 1: welcome + challenge */}
      {(visible("welcome") || visible("challenge")) && (
        <motion.div variants={item} className="grid gap-4 lg:grid-cols-2">
          {visible("welcome") && (
            <WidgetShell {...wProps("welcome")} title="Welcome back" description="Your season progress" icon={Sparkles}>
              <WelcomeCard />
            </WidgetShell>
          )}
          {visible("challenge") && (
            <WidgetShell {...wProps("challenge")} title="Today's challenge" description="Earn XP & coins" icon={Zap}>
              <TodaysChallenge />
            </WidgetShell>
          )}
        </motion.div>
      )}

      {/* Analytics shortcut — statistics live in the Analytics Center now */}
      {visible("analytics_cta") && (
        <motion.div variants={item}>
          <Link
            to="/analytics"
            className="group flex flex-col gap-3 rounded-lg border border-border/60 bg-gradient-to-br from-primary/10 via-card to-card p-5 transition hover:border-primary/40 hover:shadow-elegant sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary/80">Analytics Center</p>
                <h3 className="mt-0.5 text-base font-semibold">Equity curve, KPIs & performance breakdown</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">All statistics moved to Analytics — deeper filters, compare mode and coach insights.</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 self-start rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition group-hover:translate-x-0.5 sm:self-auto">
              Open Analytics <ArrowUpRight className="h-3.5 w-3.5" />
            </span>
          </Link>
        </motion.div>
      )}

      {/* XP + streak */}
      {(visible("xp") || visible("streak")) && (
        <motion.div variants={item} className="grid gap-4 md:grid-cols-2">
          {visible("xp") && (
            <WidgetShell {...wProps("xp")} title="XP & rank" icon={Trophy}>
              <XPWidget />
            </WidgetShell>
          )}
          {visible("streak") && (
            <WidgetShell {...wProps("streak")} title="Streaks" icon={Flame}>
              <StreakWidget />
            </WidgetShell>
          )}
        </motion.div>
      )}

      {/* Recent trades + watchlist */}
      {(visible("trades") || visible("watchlist")) && (
        <motion.div variants={item} className="grid gap-4 lg:grid-cols-3">
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
        </motion.div>
      )}

      {/* Market overview */}
      {visible("markets") && (
        <motion.div variants={item}>
          <WidgetShell {...wProps("markets")} title="Market overview" description="Global snapshot" icon={LineChart}>
            <MarketOverview />
          </WidgetShell>
        </motion.div>
      )}

      {/* Achievements + leaderboard */}
      {(visible("achievements") || visible("leaderboard")) && (
        <motion.div variants={item} className="grid gap-4 lg:grid-cols-3">
          {visible("achievements") && (
            <WidgetShell {...wProps("achievements")} title="Achievements" description="Unlock badges as you play" icon={Award} className="lg:col-span-2">
              <Achievements />
            </WidgetShell>
          )}
          {visible("leaderboard") && (
            <WidgetShell {...wProps("leaderboard")} title="Leaderboard" description="Top traders this season" icon={Trophy}>
              <LeaderboardPreview />
            </WidgetShell>
          )}
        </motion.div>
      )}

      {/* Calendar + productivity + notifications */}
      {(visible("calendar") || visible("productivity") || visible("notifications")) && (
        <motion.div variants={item} className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {visible("calendar") && (
            <WidgetShell {...wProps("calendar")} title="Trading calendar" icon={CalendarIcon}>
              <CalendarWidget />
            </WidgetShell>
          )}
          {visible("productivity") && (
            <WidgetShell {...wProps("productivity")} title="Productivity" description="Daily rituals" icon={ListChecks}>
              <ProductivityWidget />
            </WidgetShell>
          )}
          {visible("notifications") && (
            <WidgetShell {...wProps("notifications")} title="Notifications" icon={Bell}>
              <NotificationsWidget />
            </WidgetShell>
          )}
        </motion.div>
      )}

      {/* Notes + profile */}
      {(visible("notes") || visible("profile")) && (
        <motion.div variants={item} className="grid gap-4 lg:grid-cols-3">
          {visible("notes") && (
            <WidgetShell {...wProps("notes")} title="Quick notes" description="Autosaves as you type" icon={StickyNote} className="lg:col-span-2">
              <QuickNotes />
            </WidgetShell>
          )}
          {visible("profile") && (
            <WidgetShell {...wProps("profile")} title="Profile" icon={UserIcon}>
              <ProfileSummary />
            </WidgetShell>
          )}
        </motion.div>
      )}

      {hidden.size === WIDGETS.length ? (
        <div className="rounded-3xl border border-dashed border-border/60 bg-surface/40 p-10 text-center">
          <Eye className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">All widgets are hidden. Open Customize to bring them back.</p>
        </div>
      ) : null}
    </motion.div>
  );
}

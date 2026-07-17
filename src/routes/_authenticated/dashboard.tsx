import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  Award,
  BarChart3,
  BookOpen,
  Flame,
  LineChart,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { xpForLevel } from "@/lib/constants";
import { XPBar } from "@/components/ui/xp-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [{ title: "Dashboard — TradersHIVE Arena" }],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { profile, user } = useAuth();
  const name = profile?.display_name || profile?.username || user?.email?.split("@")[0] || "Trader";

  return (
    <div className="space-y-8">
      {/* Welcome hero */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <GlassCard className="relative overflow-hidden p-6 md:p-8">
          <div className="pointer-events-none absolute inset-0 gradient-radial-glow opacity-60" />
          <div className="relative grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div className="min-w-0">
              <Badge variant="outline" className="mb-2 border-primary/30 bg-primary/10 text-primary">
                <Sparkles className="mr-1 h-3 w-3" /> Season 1
              </Badge>
              <h1 className="truncate text-2xl font-bold tracking-tight md:text-3xl">
                Welcome back, {name}
              </h1>
              <p className="mt-1 max-w-lg text-sm text-muted-foreground">
                Ready to sharpen your edge? Complete today&apos;s challenges to earn XP and climb the leaderboard.
              </p>
              <div className="mt-6 max-w-md">
                <XPBar
                  level={profile?.level ?? 1}
                  xp={profile?.xp ?? 0}
                  needed={xpForLevel(profile?.level ?? 1)}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild className="gradient-primary text-primary-foreground shadow-elegant">
                <Link to="/paper-trading">
                  <LineChart className="mr-2 h-4 w-4" /> Open chart
                </Link>
              </Button>
              <Button asChild variant="outline" className="glass">
                <Link to="/journal">
                  <BookOpen className="mr-2 h-4 w-4" /> New entry
                </Link>
              </Button>
            </div>
          </div>
        </GlassCard>
      </motion.div>

      {/* Stat row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Equity" value="$0.00" delta="Start trading" hint="Paper account" icon={TrendingUp} />
        <StatCard label="Win rate" value="—" hint="No trades yet" icon={Target} />
        <StatCard label="Streak" value={`${profile?.streak ?? 0}d`} hint="Daily activity" icon={Flame} />
        <StatCard label="League" value={(profile?.league ?? "bronze").toString().toUpperCase()} hint={`Rank #${profile?.rank ?? "—"}`} icon={Trophy} />
      </div>

      {/* Main grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        <GlassCard className="p-6 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Performance</h2>
              <p className="text-xs text-muted-foreground">Equity curve over the last 30 days</p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/statistics">
                Details <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
          <EmptyState
            icon={BarChart3}
            title="No performance data yet"
            description="Execute your first paper trade to start building your equity curve."
          />
        </GlassCard>

        <GlassCard className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Active challenges</h2>
              <p className="text-xs text-muted-foreground">Complete to earn XP</p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/challenges">All</Link>
            </Button>
          </div>
          <EmptyState
            icon={Award}
            title="No active challenges"
            description="Join a challenge to compete and earn rewards."
            action={{ label: "Browse challenges" }}
          />
        </GlassCard>
      </div>
    </div>
  );
}

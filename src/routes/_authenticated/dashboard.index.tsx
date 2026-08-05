import { useEffect, useState } from "react";
import { Link, useLocation, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, LineChart, PlayCircle, Target, Zap, GraduationCap, Trophy, ChevronRight } from "lucide-react";
import { useSessionContext } from "@/hooks/use-session-context";

import { BetaBanner } from "@/components/beta/BetaBanner";
import { ActivityTable } from "@/components/dashboard/v2/ActivityTable";
import { DashboardHeader } from "@/components/dashboard/v2/DashboardHeader";
import { EquitySection } from "@/components/dashboard/v2/EquitySection";
import { HeroCard } from "@/components/dashboard/v2/HeroCard";
import { KpiCard, QuickActionCard, SectionTitle, Panel } from "@/components/dashboard/v2/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { getHeroState } from "@/lib/dashboard-hero.functions";
import { getHomeSummary } from "@/lib/dashboard-home.functions";
import { listPropChallenges } from "@/lib/prop-challenges.functions";
import { formatCurrency } from "@/lib/prop-challenges/evaluator";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard/")({
  component: DashboardOverviewPage,
});

function fmtR(v: number): string {
  if (!Number.isFinite(v)) return "0.00R";
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${Math.abs(v).toFixed(2)}R`;
}

function fmtMoney(v: number): string {
  const sign = v >= 0 ? "+" : "−";
  return `${sign}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function DashboardOverviewPage() {
  const fetchHome = useServerFn(getHomeSummary);
  const fetchHero = useServerFn(getHeroState);
  const fetchProp = useServerFn(listPropChallenges);
  const { context } = useSessionContext();
  const [accountId, setAccountId] = useState<string | null>(null);

  const { data: home, isPending } = useQuery({
    queryKey: ["home_summary", context.type, context.id],
    queryFn: () => fetchHome({ data: { contextType: context.type, contextId: context.id } }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const { data: hero } = useQuery({
    queryKey: ["dashboard_hero"],
    queryFn: () => fetchHero(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const { data: challenges } = useQuery({
    queryKey: ["prop-challenges"],
    queryFn: () => fetchProp(),
  });

  const activeProp = challenges?.find(c => c.status === "active");
  const p = home?.performance;

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-[var(--gutter-md)] pb-[var(--gutter-lg)] sm:space-y-[var(--gutter-lg)]">
      <DashboardHeader accountId={accountId} onAccountChange={setAccountId} />

      <BetaBanner />

      {activeProp && <PropChallengeBanner challenge={activeProp} />}

      {/* 1 — Hero: the visual focus */}
      {isPending && !home ? <Skeleton className="h-64 w-full rounded-xl" /> : <HeroCard data={home} />}

      {/* 2 — Performance: exactly six KPIs, one row */}
      <section className="space-y-3">
        <SectionTitle>Performance</SectionTitle>
        {isPending && !p ? (
          <div className="grid gap-[var(--gutter-sm)] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="stagger grid gap-[var(--gutter-sm)] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <KpiCard
              label="Today's P&L"
              value={fmtR(p?.todayR ?? 0)}
              hint={`${p?.tradesToday ?? 0} trades`}
              tone={(p?.todayR ?? 0) > 0 ? "up" : (p?.todayR ?? 0) < 0 ? "down" : "flat"}
            />
            <KpiCard
              label="Weekly P&L"
              value={fmtR(p?.weekR ?? 0)}
              hint={`${p?.tradesWeek ?? 0} trades`}
              tone={(p?.weekR ?? 0) > 0 ? "up" : (p?.weekR ?? 0) < 0 ? "down" : "flat"}
            />
            <KpiCard
              label="Total Realized P&L"
              value={fmtMoney(p?.totalRealizedPnl ?? 0)}
              hint="Lifetime"
              tone={(p?.totalRealizedPnl ?? 0) > 0 ? "up" : (p?.totalRealizedPnl ?? 0) < 0 ? "down" : "flat"}
            />
            <KpiCard
              label="Total R"
              value={fmtR(p?.totalR ?? 0)}
              hint="Lifetime"
              tone={(p?.totalR ?? 0) > 0 ? "up" : (p?.totalR ?? 0) < 0 ? "down" : "flat"}
            />
            <KpiCard label="Profit factor" value={(p?.profitFactor ?? 0).toFixed(2)} hint="Last 30 days" />
            <KpiCard
              label="Average R"
              value={fmtR(p?.avgR ?? 0)}
              hint="Per closed trade"
              tone={(p?.avgR ?? 0) > 0 ? "up" : (p?.avgR ?? 0) < 0 ? "down" : "flat"}
            />
            <KpiCard label="Win rate" value={`${Math.round(p?.winRate ?? 0)}%`} hint="Last 30 days" />
            <KpiCard label="Expectancy" value={fmtR(p?.expectancy ?? 0)} hint="Per trade (30d)" />
            <KpiCard
              label="Drawdown"
              value={`${(p?.currentDrawdownR ?? 0).toFixed(2)}R`}
              hint="Peak to trough"
              tone={(p?.currentDrawdownR ?? 0) > 0 ? "down" : "flat"}
            />
            <KpiCard
              label="Practice Time"
              value={(() => {
                const s = home?.focus.activePracticeTimeToday ?? 0;
                const h = Math.floor(s / 3600);
                const m = Math.floor((s % 3600) / 60);
                return h > 0 ? `${h}h ${m}m` : `${m}m`;
              })()}
              hint="Today's active time"
            />
            <KpiCard
              label="Market Replayed"
              value={(() => {
                const s = home?.focus.historicalMarketTimeToday ?? 0;
                const h = Math.floor(s / 3600);
                const m = Math.floor((s % 3600) / 60);
                return h > 0 ? `${h}h ${m}m` : `${m}m`;
              })()}
              hint="Today's chart progress"
            />
            <KpiCard
              label="Current Streak"
              value={`${home?.focus.streakDays ?? 0}d`}
              hint={`Best: ${home?.focus.longestStreak ?? 0}d`}
            />
          </div>
        )}
      </section>

      {/* 3 — Equity curve + three stacked cards */}
      <EquitySection home={home} hero={hero} />

      {/* 4 — Recent activity: one table, three tabs */}
      <ActivityTable />

      {/* 5 — Quick actions */}
      <section className="space-y-3">
        <SectionTitle>Quick actions</SectionTitle>
        <div className="stagger grid gap-[var(--gutter-sm)] grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <QuickActionCard to="/replay" icon={PlayCircle} label="Start Replay" hint="Practise a setup" />
          <QuickActionCard to="/trading" icon={LineChart} label="Paper Trade" hint="Open live market" />
          <QuickActionCard to="/replay/prop-firm" icon={Target} label="Prop Challenge" hint="Get funded" />
          <QuickActionCard to="/journal" icon={BookOpen} label="Trading Journal" hint="Review performance" />
          {home?.actions.find(a => a.kind === "replay_unfinished") && (
            <QuickActionCard 
              to={home.actions.find(a => a.kind === "replay_unfinished")?.href || "/replay"} 
              icon={Zap} 
              label="Continue Last" 
              hint="Resume session" 
            />
          )}
          <QuickActionCard to="/settings?tab=support" icon={BookOpen} label="How It Works" hint="Learn the platform" />
        </div>
      </section>
    </div>
  );
}

function PropChallengeBanner({ challenge }: { challenge: any }) {
  const start = Number(challenge.starting_equity);
  const eq = Number(challenge.current_equity);
  const profit = eq - start;
  const target = start * (challenge.profit_target_pct / 100);
  const progress = Math.max(0, (profit / target) * 100);

  return (
    <Panel className="accent-wash border-primary/20 p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-primary">Active Prop Challenge</span>
              <Badge variant="outline" className="text-[10px] h-4 px-1.5">{challenge.preset.replace(/_/g, ' ')}</Badge>
            </div>
            <h4 className="font-bold text-sm sm:text-base">{challenge.name}</h4>
          </div>
        </div>
        
        <div className="flex-1 max-w-xs space-y-1.5">
          <div className="flex justify-between text-[10px] font-bold">
            <span className="text-muted-foreground uppercase">Target Progress</span>
            <span className="text-primary">{progress.toFixed(1)}%</span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>

        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline" className="h-8 rounded-lg text-xs">
            <Link to="/replay/prop-firm">Manage</Link>
          </Button>
          <Button asChild size="sm" className="h-8 rounded-lg text-xs gradient-primary">
            <Link to="/trading">
              Trade <ChevronRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        </div>
      </div>
    </Panel>
  );
}

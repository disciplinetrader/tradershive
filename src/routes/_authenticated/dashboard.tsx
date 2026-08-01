import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, LineChart, PlayCircle } from "lucide-react";

import { BetaBanner } from "@/components/beta/BetaBanner";
import { ActivityTable } from "@/components/dashboard/v2/ActivityTable";
import { DashboardHeader } from "@/components/dashboard/v2/DashboardHeader";
import { EquitySection } from "@/components/dashboard/v2/EquitySection";
import { HeroCard } from "@/components/dashboard/v2/HeroCard";
import { KpiCard, QuickActionCard, SectionTitle } from "@/components/dashboard/v2/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { getHeroState } from "@/lib/dashboard-hero.functions";
import { getHomeSummary } from "@/lib/dashboard-home.functions";

/**
 * Dashboard — rebuilt around a single question: "What should I do today?"
 *
 * Header → Hero → 6 KPIs → Equity + 3 sidebar cards → Recent activity → 3
 * quick actions. Anything that did not help answer that question now lives on
 * its dedicated page (Analytics, Journal, Goals, Community, Watchlist).
 */
export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — TradersHIVE Arena" },
      { name: "description", content: "One screen that answers what to trade, review and journal today." },
      { property: "og:title", content: "Dashboard — TradersHIVE Arena" },
      { property: "og:description", content: "Today's P&L, win rate, streak and your next best action." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

function fmtR(v: number): string {
  if (!Number.isFinite(v)) return "0.00R";
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${Math.abs(v).toFixed(2)}R`;
}

function DashboardPage() {
  const fetchHome = useServerFn(getHomeSummary);
  const fetchHero = useServerFn(getHeroState);
  const [accountId, setAccountId] = useState<string | null>(null);

  const { data: home, isPending } = useQuery({
    queryKey: ["home_summary", accountId],
    queryFn: () => fetchHome({ data: { accountId } }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const { data: hero } = useQuery({
    queryKey: ["dashboard_hero"],
    queryFn: () => fetchHero(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const p = home?.performance;

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-[var(--gutter-md)] pb-[var(--gutter-lg)] sm:space-y-[var(--gutter-lg)]">
      <DashboardHeader accountId={accountId} onAccountChange={setAccountId} />

      <BetaBanner />

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
          <div className="stagger grid gap-[var(--gutter-sm)] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">లో
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
            <KpiCard label="Profit factor" value={(p?.profitFactor ?? 0).toFixed(2)} hint="Last 30 days" />
            <KpiCard
              label="Average R"
              value={fmtR(p?.avgR ?? 0)}
              hint="Per closed trade"
              tone={(p?.avgR ?? 0) > 0 ? "up" : (p?.avgR ?? 0) < 0 ? "down" : "flat"}
            />
            <KpiCard label="Win rate" value={`${Math.round(p?.winRate ?? 0)}%`} hint="Last 30 days" />
            <KpiCard
              label="Drawdown"
              value={`${(p?.currentDrawdownR ?? 0).toFixed(2)}R`}
              hint="Peak to trough"
              tone={(p?.currentDrawdownR ?? 0) > 0 ? "down" : "flat"}
            />
          </div>
        )}
      </section>

      {/* 3 — Equity curve + three stacked cards */}
      <EquitySection home={home} hero={hero} />

      {/* 4 — Recent activity: one table, three tabs */}
      <ActivityTable />

      {/* 5 — Quick actions: exactly three */}
      <section className="space-y-3">
        <SectionTitle>Quick actions</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-3">
          <QuickActionCard to="/trading" icon={LineChart} label="Start Trading" hint="Open the workspace" />
          <QuickActionCard to="/replay" icon={PlayCircle} label="Start Replay" hint="Practise a setup" />
          <QuickActionCard to="/journal" icon={BookOpen} label="Add Journal Entry" hint="Review your last trade" />
        </div>
      </section>
    </div>
  );
}

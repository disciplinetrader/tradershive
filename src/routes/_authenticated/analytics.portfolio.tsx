import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BarChart3, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { AnalyticsFilterBar } from "@/components/analytics/portfolio/FilterBar";
import {
  BehaviourSection, DistributionSection, EquitySection, OverviewSection,
  PlaybookSection, RiskExecutionSection, TimeSection,
} from "@/components/analytics/portfolio/sections";
import { MonteCarloSection } from "@/components/analytics/portfolio/MonteCarloSection";

import { AnalyticsWorkspaceProvider, useAnalyticsWorkspace } from "@/components/analytics/portfolio/provider";
import { filtersFromSearch } from "@/lib/analytics/filters";
import type { Resolution } from "@/lib/analytics";

/**
 * §14 Portfolio analytics workspace.
 *
 * The route owns nothing but URL parsing: filters live in the search params so
 * a refresh — or a shared link — reproduces exactly the same view.
 */
export const Route = createFileRoute("/_authenticated/analytics/portfolio")({
  validateSearch: (search: Record<string, unknown>) => ({
    ...search,
    res: (["trade", "daily", "weekly", "monthly"].includes(String(search.res))
      ? (search.res as Resolution)
      : "trade") as Resolution,
  }),
  head: () => ({
    meta: [
      { title: "Portfolio Analytics — TradersHIVE" },
      {
        name: "description",
        content:
          "Performance, risk, execution quality, behaviour and playbook analytics across every account, computed from your canonical trade records.",
      },
      { property: "og:title", content: "Portfolio Analytics — TradersHIVE" },
      { property: "og:description", content: "One analytics engine across performance, risk, execution and behaviour." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PortfolioAnalyticsRoute,
});

function PortfolioAnalyticsRoute() {
  const search = Route.useSearch();
  const filters = useMemo(() => filtersFromSearch(search as Record<string, unknown>), [search]);
  return (
    <AnalyticsWorkspaceProvider filters={filters} resolution={search.res}>
      <PortfolioWorkspace />
    </AnalyticsWorkspaceProvider>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[86px] rounded-2xl" />)}
      </div>
      <Skeleton className="h-[300px] rounded-2xl" />
      <div className="grid gap-4 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[240px] rounded-2xl" />)}
      </div>
    </div>
  );
}

function PortfolioWorkspace() {
  const { loading, error, result, refresh, resetFilters } = useAnalyticsWorkspace();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Portfolio analytics</h1>
          <p className="text-xs text-muted-foreground">
            Every metric below comes from one engine reading your closed trades, execution tape and journal.
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={refresh}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      <AnalyticsFilterBar />

      {error ? (
        <GlassCard className="p-4">
          <p className="text-sm text-danger">We could not load your trades. Try refreshing.</p>
        </GlassCard>
      ) : null}

      {loading && result.totalRecords === 0 ? (
        <LoadingSkeleton />
      ) : result.state === "no_trades" ? (
        <GlassCard className="p-8">
          <EmptyState
            icon={BarChart3}
            title="No closed trades yet"
            description="Close your first trade and this workspace fills in with performance, risk, execution quality and behaviour analytics."
            action={{ label: "Open the trading workspace", href: "/trading" }}
          />
        </GlassCard>
      ) : result.state === "no_matches" ? (
        <GlassCard className="p-8">
          <EmptyState
            icon={BarChart3}
            title="No trades match these filters"
            description="Your history is there — this particular combination of filters just excludes all of it."
            action={{ label: "Clear filters", onClick: resetFilters }}
          />
        </GlassCard>
      ) : (
        <>
          <OverviewSection />
          <EquitySection />
          <MonteCarloSection />

          <DistributionSection />
          <RiskExecutionSection />
          <BehaviourSection />
          <PlaybookSection />
          <TimeSection />
          <GlassCard className="flex flex-wrap items-center justify-between gap-2 p-4">
            <p className="text-xs text-muted-foreground">Looking for journal-level breakdowns and homework?</p>
            <Button asChild variant="outline" size="sm">
              <Link to="/journal/analytics">Open Journal analytics</Link>
            </Button>
          </GlassCard>
        </>
      )}
    </div>
  );
}

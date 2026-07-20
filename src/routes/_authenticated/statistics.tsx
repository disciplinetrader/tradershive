import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { FiltersBar } from "@/components/statistics/FiltersBar";
import { StatisticsProvider, useStatistics } from "@/components/statistics/context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/statistics")({
  head: () => ({
    meta: [
      { title: "Statistics — TradersHIVE Arena" },
      { name: "description", content: "Analytics, performance, drawdown and reports for every paper trade you take." },
    ],
  }),
  component: StatisticsLayout,
});

const TABS = [
  { to: "/statistics", label: "Overview", exact: true },
  { to: "/statistics/performance", label: "Performance" },
  { to: "/statistics/calendar", label: "Calendar" },
  { to: "/statistics/setups", label: "Setups & Pairs" },
  { to: "/statistics/sessions", label: "Sessions & Risk" },
  { to: "/statistics/risk", label: "Risk & Accounts" },
  { to: "/statistics/reports", label: "Reports" },
];

function StatisticsLayout() {
  const loc = useLocation();
  return (
    <StatisticsProvider>
      <div className="space-y-4">
        <PageHeader
          title="Statistics & Analytics"
          description="Deep analytics computed live from every paper trade and journal entry."
        />

        <div className="overflow-x-auto -mx-2 px-2">
          <div className="inline-flex rounded-2xl border border-border/40 bg-background/40 p-1">
            {TABS.map((t) => {
              const active = t.exact ? loc.pathname === t.to : loc.pathname === t.to || loc.pathname.startsWith(t.to + "/");
              return (
                <Link
                  key={t.to}
                  to={t.to}
                  className={cn(
                    "whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-medium transition",
                    active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label}
                </Link>
              );
            })}
          </div>
        </div>

        <FiltersBar />

        <DatasetStatus />
        <Outlet />
      </div>
    </StatisticsProvider>
  );
}

function DatasetStatus() {
  const { loading, error, filtered } = useStatistics();
  if (error) {
    return (
      <GlassCard className="p-4 flex items-center gap-2 text-sm text-danger">
        <AlertCircle className="h-4 w-4" />
        Failed to load statistics data.
      </GlassCard>
    );
  }
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="glass rounded-3xl h-24 animate-pulse" />
        ))}
      </div>
    );
  }
  if (filtered.length === 0) {
    return (
      <GlassCard className="p-6 text-center text-sm text-muted-foreground">
        No trades match your filters yet. Close some paper trades to populate analytics.
      </GlassCard>
    );
  }
  return null;
}

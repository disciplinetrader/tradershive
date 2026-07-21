import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { FiltersBar } from "@/components/statistics/FiltersBar";
import { useStatistics } from "@/components/statistics/context";
import { AnalyticsProvider } from "@/components/analytics/AnalyticsProvider";
import { BacktestSelector } from "@/components/analytics/BacktestSelector";
import { AnalyticsSearch } from "@/components/analytics/AnalyticsSearch";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics Center — TradersHIVE Arena" },
      { name: "description", content: "Performance laboratory: benchmark live trading, replay backtests, coach scores, and championship history side by side." },
    ],
  }),
  component: AnalyticsLayout,
});

const TABS = [
  { to: "/analytics", label: "Overview", exact: true },
  { to: "/analytics/performance", label: "Performance" },
  { to: "/analytics/risk", label: "Risk" },
  { to: "/analytics/trades", label: "Trades" },
  { to: "/analytics/sessions", label: "Sessions" },
  { to: "/analytics/symbols", label: "Symbols" },
  { to: "/analytics/calendar", label: "Calendar" },
  { to: "/analytics/compare", label: "Compare" },
  { to: "/analytics/replay", label: "Replay" },
  { to: "/analytics/championships", label: "Championships" },
  { to: "/analytics/ai", label: "AI Coach" },
  { to: "/analytics/reports", label: "Reports" },
];

function AnalyticsLayout() {
  const loc = useLocation();
  return (
    <AnalyticsProvider>
      <div className="space-y-4">
        <PageHeader
          title="Analytics Center"
          description="Your performance laboratory — analyse live trades, replay backtests, and coach scores in one place."
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
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
          <div className="flex flex-wrap items-center gap-2">
            <AnalyticsSearch />
            <BacktestSelector />
          </div>
        </div>

        <FiltersBar />

        <DatasetStatus />
        <Outlet />
      </div>
    </AnalyticsProvider>
  );
}

function DatasetStatus() {
  const { loading, error, filtered } = useStatistics();
  if (error) {
    return (
      <GlassCard className="p-4 flex items-center gap-2 text-sm text-danger">
        <AlertCircle className="h-4 w-4" />
        Failed to load analytics data.
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
        No trades match your filters or the selected backtest. Adjust filters, pick a different backtest, or close some paper trades.
      </GlassCard>
    );
  }
  return null;
}

import { createFileRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { AlertCircle, LineChart, BookOpen, Upload, Layers } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { FiltersBar } from "@/components/statistics/FiltersBar";
import { ExcursionBackfill } from "@/components/statistics/ExcursionBackfill";
import { useStatistics } from "@/components/statistics/context";
import { AnalyticsProvider } from "@/components/analytics/AnalyticsProvider";
import { BacktestSelector } from "@/components/analytics/BacktestSelector";
import { AnalyticsSearch } from "@/components/analytics/AnalyticsSearch";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { cn } from "@/lib/utils";
import type { TradeSourceTab } from "@/lib/statistics/types";

export const Route = createFileRoute("/_authenticated/analytics")({
  /**
   * Passthrough so the statistics filter params survive navigation.
   *
   * `StatisticsProvider` keeps filters in the URL — that is what makes a
   * filtered view reloadable and shareable — and an unvalidated route would
   * drop them. Nothing is typed here on purpose: the grammar is owned by
   * `lib/statistics/filters.ts`, and duplicating it in four routes is four
   * places to disagree.
   */
  validateSearch: (search: Record<string, unknown>) => search,
  head: () => ({
    meta: [
      { title: "Analytics Center — TradersHIVE" },
      { name: "description", content: "Performance laboratory: benchmark live trading, replay backtests, and championship history." },
    ],
  }),
  component: AnalyticsLayout,
});

const TABS = [
  { to: "/analytics", label: "Overview", exact: true },
  { to: "/analytics/portfolio", label: "Portfolio" },
  { to: "/analytics/performance", label: "Performance" },

  { to: "/analytics/risk", label: "Risk" },
  { to: "/analytics/behaviour", label: "Behaviour" },
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

const SOURCE_TABS: { id: TradeSourceTab; label: string; icon: typeof Layers }[] = [
  { id: "all", label: "All Trades", icon: Layers },
  { id: "journal", label: "Journal", icon: BookOpen },
  { id: "paper", label: "Paper Trading", icon: LineChart },
  { id: "imported", label: "Imported", icon: Upload },
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

        <SourceTabs />

        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
          <SegmentedTabs tabs={TABS} pathname={loc.pathname} className="min-w-0 flex-1" />
          <div className="flex flex-wrap items-center gap-2">
            <AnalyticsSearch />
            <BacktestSelector />
          </div>
        </div>

        <FiltersBar />

        {/* Sits above the dataset, because until the backfill runs the ideal
            metrics below are blank — and a blank column with no explanation
            reads as a broken feature rather than as unmeasured data. */}
        <ExcursionBackfill />

        <DatasetStatus />
        <SourceOutlet pathname={loc.pathname} />
      </div>
    </AnalyticsProvider>
  );
}

function SourceTabs() {
  const { filters, setFilters } = useStatistics();
  const active = (filters.source ?? "all") as TradeSourceTab;
  return (
    <div
      role="tablist"
      aria-label="Trade source"
      className="no-scrollbar -mx-1 overflow-x-auto px-1"
    >
      <div className="inline-flex snap-x snap-mandatory items-center gap-1 rounded-lg border border-border/60 bg-card/60 p-1">
        {SOURCE_TABS.map((t) => {
          const isActive = active === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setFilters((prev) => ({ ...prev, source: t.id }))}
              className={cn(
                "inline-flex shrink-0 snap-start cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors sm:text-[13px]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                isActive
                  ? "bg-primary/15 text-primary shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_30%,transparent)]"
                  : "text-muted-foreground hover:bg-background/40 hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SourceOutlet({ pathname }: { pathname: string }) {
  const { filters } = useStatistics();
  const key = `${filters.source ?? "all"}::${pathname}`;
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={key}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.16, ease: "easeOut" }}
      >
        <Outlet />
      </motion.div>
    </AnimatePresence>
  );
}

function DatasetStatus() {
  const navigate = useNavigate();
  const { loading, error, filtered, raw, filters, setFilters } = useStatistics();
  const source = (filters.source ?? "all") as TradeSourceTab;

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
          <div key={i} className="rounded-3xl h-24 bg-muted animate-shimmer" />
        ))}
      </div>
    );
  }
  if (filtered.length === 0) {
    // Source-specific empty state so the tester's request is obvious.
    const hasAnyForSource = source === "all"
      ? raw.length > 0
      : raw.some((t) => t.source === source);
    if (source !== "all" && !hasAnyForSource) {
      const copy = SOURCE_EMPTY[source];
      return (
        <GlassCard className="p-8 text-center space-y-3">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <copy.icon className="h-5 w-5" />
          </div>
          <div>
            <div className="text-base font-semibold">{copy.title}</div>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{copy.body}</p>
          </div>
          <div className="flex items-center justify-center gap-2 pt-1">
            {copy.cta ? (
              <Button size="sm" onClick={() => navigate({ to: copy.cta!.to as any })}>{copy.cta.label}</Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setFilters((prev) => ({ ...prev, source: "all" }))}
            >
              View all trades
            </Button>
          </div>
        </GlassCard>
      );
    }
    return (
      <GlassCard className="p-8 text-center space-y-3">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Layers className="h-5 w-5" />
        </div>
        <div>
          <div className="text-base font-semibold">No trades match your filters</div>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Try widening the date range, clearing tags, or switching source to All.
          </p>
        </div>
        <div className="flex items-center justify-center gap-2 pt-1">
          <Button size="sm" onClick={() => setFilters((prev) => ({ ...prev, source: "all", tag: undefined as any }))}>
            Reset filters
          </Button>
          <Button size="sm" variant="ghost" onClick={() => navigate({ to: "/journal" })}>Open Journal</Button>
        </div>
      </GlassCard>
    );
  }
  return null;
}

const SOURCE_EMPTY: Record<Exclude<TradeSourceTab, "all">, {
  title: string;
  body: string;
  icon: typeof Layers;
  cta?: { label: string; to: string };
}> = {
  paper: {
    title: "No Paper Trades yet.",
    body: "Open your first simulated position to start building live Paper Trading analytics.",
    icon: LineChart,
    cta: { label: "Go to Paper Trading", to: "/trading" },
  },
  journal: {
    title: "Your Journal is empty.",
    body: "Log a trade in the Journal to see setup, session, and emotion analytics here.",
    icon: BookOpen,
    cta: { label: "Open Journal", to: "/journal" },
  },
  imported: {
    title: "No imported trades yet.",
    body: "Imported broker trades will appear here so you can compare real performance against Paper and Journal.",
    icon: Upload,
    cta: { label: "Import from Journal", to: "/journal" },
  },
};

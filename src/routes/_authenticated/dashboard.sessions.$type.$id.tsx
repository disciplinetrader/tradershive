import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { 
  ChevronLeft, 
  LayoutDashboard, 
  History as HistoryIcon, 
  Settings as SettingsIcon, 
  Play,
  Briefcase,
  PlayCircle,
  Target,
  Swords,
  Info
} from "lucide-react";
import { DashboardHeader } from "@/components/dashboard/v2/DashboardHeader";
import { KpiCard, SectionTitle, Panel } from "@/components/dashboard/v2/primitives";
import { AnalyticsProvider } from "@/components/analytics/AnalyticsProvider";
import { EquityCurveCard, MonthlyPerformanceCard, DailyPerformanceCard, WinRateBreakdownCard, ProfitFactorCard } from "@/components/statistics/Charts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getHomeSummary } from "@/lib/dashboard-home.functions";
import { getAccount } from "@/lib/paper-trading.functions";
import { getReplaySession } from "@/lib/replay.functions";
import { getPropChallenge } from "@/lib/prop-challenges.functions";
import { getBattle } from "@/lib/battle-arena.functions";
import { useSessionContext } from "@/hooks/use-session-context";

export const Route = createFileRoute("/_authenticated/dashboard/sessions/$type/$id")({
  component: SessionDetailPage,
});

function SessionDetailPage() {
  const { type, id } = Route.useParams();
  const fetchHome = useServerFn(getHomeSummary);
  const { selectContext } = useSessionContext();
  
  // Dynamic fetcher based on type
  const fetchAccount = useServerFn(getAccount);
  const fetchReplay = useServerFn(getReplaySession);
  const fetchProp = useServerFn(getPropChallenge);
  const fetchBattle = useServerFn(getBattle);

  const { data: sessionInfo, isLoading: infoLoading } = useQuery({
    queryKey: ["session-info", type, id],
    queryFn: async () => {
      if (type === "paper") return fetchAccount({ data: { id } });
      if (type === "replay") return fetchReplay({ data: { id } });
      if (type === "prop") return fetchProp({ data: { id } });
      if (type === "arena") return fetchBattle({ data: { id } });
      return null;
    }
  });

  const { data: home, isPending } = useQuery({
    queryKey: ["home_summary", type, id],
    queryFn: () => fetchHome({ data: { contextType: type, contextId: id } }),
    staleTime: 30_000,
  });

  const sessionName = useMemo(() => {
    if (!sessionInfo) return "Session Details";
    if (type === "paper") return sessionInfo.name;
    if (type === "replay") return `${sessionInfo.symbol || 'Replay'} (${new Date(sessionInfo.created_at).toLocaleDateString()})`;
    if (type === "prop") return sessionInfo.name || "Prop Challenge";
    if (type === "arena") return sessionInfo.battle?.battle_name || "Arena Match";
    return "Session Details";
  }, [sessionInfo, type]);

  const Icon = type === "paper" ? Briefcase : type === "replay" ? PlayCircle : type === "prop" ? Target : Swords;
  const p = home?.performance;

  const handleResume = () => {
    selectContext(type as any, id, sessionName);
  };

  return (
    <AnalyticsProvider>
      <div className="mx-auto w-full max-w-[1400px] space-y-6 pb-[var(--gutter-lg)] animate-in fade-in duration-500">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild className="rounded-xl">
              <Link to="/dashboard/sessions">
                <ChevronLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold">{sessionName}</h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="outline" className="text-[10px] uppercase tracking-widest">{type}</Badge>
                  <span className="text-[10px] text-muted-foreground">•</span>
                  <span className="text-[10px] text-muted-foreground">ID: {id.slice(0, 8)}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-9 rounded-xl px-4" asChild>
              <Link to="/dashboard">
                <LayoutDashboard className="mr-2 h-4 w-4" /> Global Dashboard
              </Link>
            </Button>
            <Button size="sm" className="h-9 rounded-xl gradient-primary px-4 shadow-lg shadow-primary/20" onClick={handleResume}>
              <Play className="mr-2 h-4 w-4 fill-current" /> Resume Session
            </Button>
          </div>
        </div>

        <section className="space-y-3">
          <SectionTitle>Performance Overview</SectionTitle>
          {isPending ? (
            <div className="grid gap-[var(--gutter-sm)] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
            </div>
          ) : (
            <div className="stagger grid gap-[var(--gutter-sm)] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <KpiCard label="Net P&L" value={`$${(p?.totalRealizedPnl ?? 0).toLocaleString()}`} tone={(p?.totalRealizedPnl ?? 0) >= 0 ? "up" : "down"} />
              <KpiCard label="Total R" value={`${(p?.totalR ?? 0).toFixed(2)}R`} tone={(p?.totalR ?? 0) >= 0 ? "up" : "down"} />
              <KpiCard label="Win Rate" value={`${Math.round(p?.winRate ?? 0)}%`} />
              <KpiCard label="Profit Factor" value={(p?.profitFactor ?? 0).toFixed(2)} />
            </div>
          )}
        </section>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <EquityCurveCard />
            <div className="grid gap-6 md:grid-cols-2">
              <MonthlyPerformanceCard />
              <DailyPerformanceCard />
            </div>
          </div>
          <div className="space-y-6">
            <WinRateBreakdownCard />
            <ProfitFactorCard />
            <Panel className="p-5">
              <SectionTitle className="mb-4">Session Info</SectionTitle>
              <div className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Status</span>
                  <Badge className="capitalize">{(sessionInfo as any)?.status || 'Active'}</Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Started</span>
                  <span className="font-medium">{new Date((sessionInfo as any)?.created_at || (sessionInfo as any)?.opened_at).toLocaleDateString()}</span>
                </div>
                {type === 'replay' && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Symbol</span>
                    <span className="font-medium">{(sessionInfo as any)?.symbol}</span>
                  </div>
                )}
                <div className="pt-4 flex flex-col gap-2">
                   <Button variant="outline" size="sm" className="w-full justify-start h-9 rounded-xl" asChild>
                    <Link to="/journal">
                      <History className="mr-2 h-4 w-4" /> View in Journal
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" className="w-full justify-start h-9 rounded-xl" asChild>
                    <Link to="/settings">
                      <Settings className="mr-2 h-4 w-4" /> Session Settings
                    </Link>
                  </Button>
                </div>
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </AnalyticsProvider>
  );
}



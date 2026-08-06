import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import {
  Activity,
  BarChart3,
  Clock,
  Compass,
  Dices,
  Film,
  Library,
  Percent,
  Play,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { CreatorWizard } from "@/components/replay/CreatorWizard";
import { ScenarioPicker } from "@/components/replay/ScenarioPicker";
import { LibraryCard } from "@/components/replay/LibraryCard";
import {
  getReplayStatistics,
  listReplaySessions,
  listReplayTrades,
} from "@/lib/replay.functions";
import { createRandomReplaySession } from "@/lib/replay-studio.functions";
import type { ReplaySession } from "@/lib/replay/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/replay/")({
  head: () => ({
    meta: [
      { title: "Replay Studio — Home — TradersHIVE Arena" },
      {
        name: "description",
        content:
          "Your backtesting command center. Create a backtest, resume last session, and review recent performance in one place.",
      },
    ],
  }),
  component: ReplayDashboard,
});

function ReplayDashboard() {
  const [wiz, setWiz] = useState(false);
  const [picker, setPicker] = useState<null | "free" | "day">(null);
  const navigate = useNavigate();

  const list = useServerFn(listReplaySessions);
  const stats = useServerFn(getReplayStatistics);
  const trades = useServerFn(listReplayTrades);
  const rand = useServerFn(createRandomReplaySession);

  const sessions = useQuery({ queryKey: ["replay", "sessions"], queryFn: () => list() });
  const stat = useQuery({ queryKey: ["replay", "statistics"], queryFn: () => stats() });
  const tradesQ = useQuery({ queryKey: ["replay", "trades"], queryFn: () => trades() });

  const randomM = useMutation({
    mutationFn: () => rand(),
    onSuccess: (res) => {
      if (!res.session) {
        toast.error(res.unavailable?.message ?? "No market data available", {
          description: res.unavailable?.remedy,
        });
        return;
      }
      navigate({ to: "/replay/studio", search: { id: res.session.id } as never });
    },
  });

  const all = (sessions.data ?? []) as ReplaySession[];
  const active = all.find((s) => s.status === "active" || s.status === "paused");
  const recent = all.filter((s) => s.status !== "archived").slice(0, 8);
  const tradesData = (tradesQ.data ?? []) as Array<{
    id: string; symbol: string; direction: string; pnl: number | string | null;
    rr_realized: number | string | null; status: string; opened_at: string | null;
    replay_sessions?: { title?: string } | null;
  }>;

  // Performance snapshot from real trade data
  const perf = useMemo(() => {
    const closed = tradesData.filter((t) => t.status === "closed");
    const wins = closed.filter((t) => Number(t.pnl ?? 0) > 0);
    const losses = closed.filter((t) => Number(t.pnl ?? 0) < 0);
    const grossWin = wins.reduce((a, t) => a + Number(t.pnl ?? 0), 0);
    const grossLoss = Math.abs(losses.reduce((a, t) => a + Number(t.pnl ?? 0), 0));
    const rrValues = closed.map((t) => Number(t.rr_realized ?? 0)).filter((v) => Number.isFinite(v) && v !== 0);
    const avgRR = rrValues.length ? rrValues.reduce((a, b) => a + b, 0) / rrValues.length : 0;
    return {
      winRate: closed.length ? Math.round((wins.length / closed.length) * 100) : 0,
      totalTrades: closed.length,
      avgRR,
      sessionsCompleted: all.filter((s) => s.status === "completed").length,
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0,
    };
  }, [tradesData, all]);

  // Favorite instruments (from most-traded symbols)
  const favInstruments = useMemo(() => {
    const counts = new Map<string, number>();
    tradesData.forEach((t) => counts.set(t.symbol, (counts.get(t.symbol) ?? 0) + 1));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [tradesData]);

  // Favorite strategies (from favorite sessions & titles)
  const favStrategies = useMemo(() => {
    const favs = all.filter((s) => s.is_favorite).slice(0, 5);
    return favs.length ? favs : all.slice(0, 5);
  }, [all]);

  // Recent activity timeline from most recent trades + sessions
  const activity = useMemo(() => {
    const events: { ts: number; label: string; icon: string; tone?: string }[] = [];
    tradesData.slice(0, 10).forEach((t) => {
      const pnl = Number(t.pnl ?? 0);
      events.push({
        ts: new Date(t.opened_at ?? Date.now()).getTime(),
        label: `${t.direction.toUpperCase()} ${t.symbol} · ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`,
        icon: "trade",
        tone: pnl >= 0 ? "success" : "danger",
      });
    });
    all.slice(0, 5).forEach((s) => {
      events.push({
        ts: new Date(s.last_opened_at ?? s.updated_at).getTime(),
        label: `${s.status === "completed" ? "Completed" : "Opened"} · ${s.title}`,
        icon: "session",
      });
    });
    return events.sort((a, b) => b.ts - a.ts).slice(0, 8);
  }, [tradesData, all]);

  const s = stat.data;
  const perfTiles = [
    { label: "Win Rate", value: `${perf.winRate}%`, icon: Percent, tone: "success" as const },
    { label: "Total Trades", value: perf.totalTrades, icon: Activity },
    { label: "Average RR", value: perf.avgRR.toFixed(2), icon: Target, tone: "info" as const },
    { label: "Sessions Completed", value: perf.sessionsCompleted, icon: Trophy, tone: "warning" as const },
    { label: "Profit Factor", value: perf.profitFactor.toFixed(2), icon: TrendingUp, tone: perf.profitFactor >= 1 ? ("success" as const) : ("danger" as const) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Replay Studio"
        description="Create, execute, review and analyse backtests — your practice command center."
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
            <Button variant="outline" size="sm" onClick={() => setPicker("free")} className="w-full sm:w-auto">
              <Compass className="mr-2 h-4 w-4" />Scenario Picker
            </Button>
          </div>
        }
      />

      {/* Primary CTA + Continue Last Session */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <motion.button
          whileHover={{ y: -2 }}
          onClick={() => setWiz(true)}
          className="group relative overflow-hidden rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent p-6 text-left shadow-elegant transition hover:border-primary/70"
        >
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-primary/20 p-3 text-primary">
              <Sparkles className="h-7 w-7" />
            </div>
            <div className="flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-primary">Start Here</div>
              <div className="text-2xl font-bold">Create Backtest</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Pick an instrument, timeframe and date — trade in under 30 seconds.
              </p>
            </div>
            <Play className="h-6 w-6 text-primary opacity-60 transition group-hover:translate-x-1 group-hover:opacity-100" />
          </div>
        </motion.button>

        <GlassCard className="p-5 space-y-3 flex flex-col justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Continue Last Session</div>
            <div className="mt-1 text-base font-bold truncate">
              {active ? active.title : "No active session"}
            </div>
            {active ? (
              <div className="mt-0.5 space-y-1.5">
                <div className="text-xs text-muted-foreground">
                  {active.market} · {active.symbol} · {active.timeframe}
                </div>
                {typeof (active as any).completion_pct === "number" ? (
                  <div className="flex items-center gap-2">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted/50">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${Math.max(2, Math.min(100, (active as any).completion_pct))}%` }}
                      />
                    </div>
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {Math.round((active as any).completion_pct)}%
                    </span>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground mt-0.5">
                Start a backtest to see your resume point here.
              </div>
            )}
          </div>
          {active ? (
            <div className="space-y-2">
              <Button size="sm" asChild className="w-full">
                <Link to="/replay/studio" search={{ id: active.id } as never}>
                  <Play className="mr-2 h-3.5 w-3.5" /> Resume Session
                </Link>
              </Button>
              <Button size="sm" variant="secondary" asChild className="w-full">
                <Link to="/replay/studio" search={{ id: active.id } as never}>
                  Open in Replay Studio (canonical engine)
                </Link>
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={() => setWiz(true)} className="w-full shadow-elegant">
              <Sparkles className="mr-2 h-3.5 w-3.5" /> Create Backtest
            </Button>
          )}
        </GlassCard>
      </div>

      {/* Performance snapshot */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Performance Snapshot
          </h2>
          <Button asChild variant="ghost" size="sm" className="text-xs">
            <Link to="/replay/performance"><BarChart3 className="mr-1.5 h-3 w-3" /> View Performance</Link>
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {perfTiles.map((t) => {
            const Icon = t.icon;
            return (
              <GlassCard key={t.label} className="p-4">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "rounded-lg p-2",
                    t.tone === "success" && "bg-success/10 text-success",
                    t.tone === "danger" && "bg-danger/10 text-danger",
                    t.tone === "info" && "bg-info/10 text-info",
                    t.tone === "warning" && "bg-warning/10 text-warning",
                    !t.tone && "bg-primary/10 text-primary",
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t.label}</div>
                    <div className="truncate text-lg font-bold tabular-nums">{t.value}</div>
                  </div>
                </div>
              </GlassCard>
            );
          })}
        </div>
      </section>

      {/* Recent sessions */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Recent Sessions
          </h2>
          <Button asChild variant="ghost" size="sm" className="text-xs">
            <Link to="/replay/library"><Library className="mr-1.5 h-3 w-3" /> View all</Link>
          </Button>
        </div>
        {sessions.isPending ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-border/60 h-32 bg-muted animate-pulse" />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <GlassCard className="p-8 text-center space-y-3">
            <Sparkles className="mx-auto h-8 w-8 text-primary" />
            <div className="text-sm text-muted-foreground">No sessions yet. Create your first backtest.</div>
            <Button onClick={() => setWiz(true)}><Sparkles className="mr-2 h-4 w-4" /> Create Backtest</Button>
          </GlassCard>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {recent.map((sess) => <LibraryCard key={sess.id} session={sess} />)}
          </div>
        )}
      </section>

      {/* Favorites + Activity */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <GlassCard className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Favorite Instruments</h3>
            <Star className="h-3.5 w-3.5 text-warning" />
          </div>
          {favInstruments.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              Take some trades to see your top instruments.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {favInstruments.map(([sym, n]) => (
                <li key={sym} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-background/60">
                  <span className="font-mono text-sm">{sym}</span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{n} trades</span>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>

        <GlassCard className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Favorite Strategies</h3>
            <Star className="h-3.5 w-3.5 text-warning" />
          </div>
          {favStrategies.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              Star sessions from the library to pin your strategies.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {favStrategies.map((sess) => (
                <li key={sess.id}>
                  <Link
                    to="/replay/studio"
                    search={{ id: sess.id } as never}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-background/60"
                  >
                    <span className="truncate text-sm">{sess.title}</span>
                    <span className="ml-2 shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {sess.timeframe}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>

        <GlassCard className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent Activity</h3>
            <Activity className="h-3.5 w-3.5 text-primary" />
          </div>
          {activity.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              Your recent trades and sessions will appear here.
            </div>
          ) : (
            <ol className="space-y-2">
              {activity.map((ev, i) => (
                <li key={i} className="flex items-start gap-2 text-xs">
                  <span className={cn(
                    "mt-1 h-1.5 w-1.5 rounded-full shrink-0",
                    ev.tone === "success" && "bg-success",
                    ev.tone === "danger" && "bg-danger",
                    !ev.tone && "bg-primary",
                  )} />
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{ev.label}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(ev.ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </GlassCard>
      </div>

      {/* KPIs stat strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <GlassCard className="p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Practice Hours</div>
          <div className="mt-0.5 text-xl font-bold tabular-nums flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-primary" />
            {(s?.total_hours ?? 0).toFixed(1)}
          </div>
        </GlassCard>
        <GlassCard className="p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Trades Reviewed</div>
          <div className="mt-0.5 text-xl font-bold tabular-nums flex items-center gap-1.5">
            <Film className="h-4 w-4 text-primary" />
            {s?.total_trades ?? 0}
          </div>
        </GlassCard>
        <GlassCard className="p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Avg Replay Score</div>
          <div className="mt-0.5 text-xl font-bold tabular-nums flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-warning" />
            {s?.average_score ?? 0}
          </div>
        </GlassCard>
        <GlassCard className="p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Practice Streak</div>
          <div className="mt-0.5 text-xl font-bold tabular-nums flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-success" />
            {s?.streak_days ?? 0}d
          </div>
        </GlassCard>
      </div>

      <CreatorWizard open={wiz} onOpenChange={setWiz} />
      {picker ? <ScenarioPicker open={!!picker} onOpenChange={(o) => !o && setPicker(null)} mode={picker} /> : null}
    </div>
  );
}

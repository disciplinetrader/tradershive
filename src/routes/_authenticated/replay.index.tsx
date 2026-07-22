import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import {
  BarChart3,
  Clock,
  Compass,
  Dices,
  Film,
  Flame,
  GraduationCap,
  Library,
  Play,
  Sparkles,
  Star,
  Target,
  Trophy,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CreatorWizard } from "@/components/replay/CreatorWizard";
import { ScenarioPicker } from "@/components/replay/ScenarioPicker";
import { LibraryCard } from "@/components/replay/LibraryCard";
import {
  getReplayStatistics,
  listReplaySessions,
} from "@/lib/replay.functions";
import { createRandomReplaySession } from "@/lib/replay-studio.functions";
import type { ReplaySession } from "@/lib/replay/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/replay/")({
  head: () => ({
    meta: [
      { title: "Replay Studio — Practice — TradersHIVE Arena" },
      {
        name: "description",
        content:
          "Practice, resume saved sessions, review trades and track performance in a single professional replay environment.",
      },
    ],
  }),
  component: ReplayDashboard,
});

const FILTERS = ["all", "active", "paused", "completed", "favorite"] as const;
type Filter = (typeof FILTERS)[number];

function ReplayDashboard() {
  const [wiz, setWiz] = useState(false);
  const [picker, setPicker] = useState<null | "free" | "day">(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const navigate = useNavigate();

  const list = useServerFn(listReplaySessions);
  const stats = useServerFn(getReplayStatistics);
  const rand = useServerFn(createRandomReplaySession);
  const sessions = useQuery({ queryKey: ["replay", "sessions"], queryFn: () => list() });
  const stat = useQuery({ queryKey: ["replay", "statistics"], queryFn: () => stats() });
  const randomM = useMutation({
    mutationFn: () => rand(),
    onSuccess: (row: { id: string }) =>
      navigate({ to: "/replay/session", search: { id: row.id } as never }),
  });

  const all = (sessions.data ?? []) as ReplaySession[];
  const active = all.find((s) => s.status === "active" || s.status === "paused");

  const filtered = useMemo(() => {
    return all.filter((s) => {
      if (search && !`${s.title} ${s.symbol}`.toLowerCase().includes(search.toLowerCase())) return false;
      if (filter === "all") return true;
      if (filter === "favorite") return s.is_favorite;
      return s.status === filter;
    });
  }, [all, search, filter]);

  const favorites = all.filter((s) => s.is_favorite).slice(0, 4);
  const s = stat.data;
  const kpis = [
    { label: "Hours Practiced", value: s ? (s.total_hours ?? 0).toFixed(1) : "0.0", icon: Clock },
    { label: "Trades Reviewed", value: s?.total_trades ?? 0, icon: Film },
    { label: "Avg Replay Score", value: s?.average_score ?? 0, icon: Sparkles },
    { label: "Practice Streak", value: `${s?.streak_days ?? 0}d`, icon: Flame },
  ];

  // Four workflow lanes for the redesigned dashboard.
  const workflows: {
    id: string;
    label: string;
    desc: string;
    icon: React.ComponentType<{ className?: string }>;
    accent: string;
    onClick: () => void;
    cta: string;
  }[] = [
    {
      id: "practice",
      label: "Practice",
      desc: active
        ? `Resume ${active.symbol} · ${active.timeframe}`
        : "Start deliberate practice on any market",
      icon: GraduationCap,
      accent: "from-primary/20 to-primary/5",
      cta: active ? "Resume Session" : "Start Practice",
      onClick: () => {
        if (active) navigate({ to: "/replay/session", search: { id: active.id } as never });
        else setPicker("free");
      },
    },
    {
      id: "saved",
      label: "Saved Sessions",
      desc: `${all.length} saved · resume exactly where you left off`,
      icon: Library,
      accent: "from-info/20 to-info/5",
      cta: "Open Library",
      onClick: () => navigate({ to: "/replay/library" }),
    },
    {
      id: "review",
      label: "Trade Review",
      desc: "Every trade you've taken inside a replay",
      icon: Film,
      accent: "from-warning/20 to-warning/5",
      cta: "Review Trades",
      onClick: () => navigate({ to: "/replay/trades" }),
    },
    {
      id: "performance",
      label: "Performance",
      desc: "Win rate, RR, profit factor and improvement",
      icon: BarChart3,
      accent: "from-success/20 to-success/5",
      cta: "View Performance",
      onClick: () => navigate({ to: "/replay/performance" }),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Replay Studio"
        description="Practice, review, and master execution on real market data."
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
            <Button variant="outline" size="sm" onClick={() => setPicker("free")} className="w-full sm:w-auto">
              <Compass className="mr-2 h-4 w-4" />Scenario Picker
            </Button>
            <Button size="default" onClick={() => setWiz(true)} className="w-full sm:w-auto shadow-elegant">
              <Sparkles className="mr-2 h-4 w-4" />New Replay
            </Button>
            <Button variant="ghost" size="sm" onClick={() => randomM.mutate()} disabled={randomM.isPending} className="w-full sm:w-auto">
              <Dices className="mr-2 h-4 w-4" />{randomM.isPending ? "Rolling…" : "Surprise Me"}
            </Button>
          </div>
        }
      />

      {/* Four core workflow cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {workflows.map((w) => {
          const Icon = w.icon;
          return (
            <motion.button
              key={w.id}
              whileHover={{ y: -3 }}
              onClick={w.onClick}
              className={cn(
                "group relative flex h-full flex-col overflow-hidden rounded-[3px] border border-border/60 bg-card p-5 text-left transition",
                "hover:border-primary/60 hover:shadow-elegant",
              )}
            >
              <div className={cn("absolute inset-0 bg-gradient-to-br opacity-70", w.accent)} />
              <div className="relative flex flex-1 flex-col gap-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-[3px] border border-border/60 bg-background/80 p-2 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Workflow
                    </div>
                    <div className="text-base font-bold">{w.label}</div>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{w.desc}</p>
                <div className="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-primary">
                  {w.cta}
                  <Play className="h-3 w-3" />
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Live KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <GlassCard key={k.label} className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-[3px] bg-primary/10 p-2 text-primary"><Icon className="h-4 w-4" /></div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k.label}</div>
                  <div className="text-xl font-bold tabular-nums">{k.value}</div>
                </div>
              </div>
            </GlassCard>
          );
        })}
      </div>

      {/* Continue lane */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <GlassCard className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Continue</div>
              <div className="text-base font-bold">{active ? active.title : "No active session"}</div>
            </div>
            {active ? (
              <Button size="sm" asChild>
                <Link to="/replay/session" search={{ id: active.id } as never}>
                  <Play className="mr-2 h-3.5 w-3.5" />Resume
                </Link>
              </Button>
            ) : (
              <Button size="sm" onClick={() => setPicker("free")}>
                <Sparkles className="mr-2 h-3.5 w-3.5" />Start
              </Button>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {active
              ? `${active.market} · ${active.symbol} · ${active.timeframe} · ${active.mode}`
              : "Kick off a free-form practice replay or take a graded day-trade challenge."}
          </div>
        </GlassCard>

        <GlassCard className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Compete</div>
              <div className="text-base font-bold">Replay Challenges & Tournaments</div>
            </div>
            <Button size="sm" variant="outline" asChild>
              <Link to="/replay/challenges">
                <Target className="mr-2 h-3.5 w-3.5" />Challenges
              </Link>
            </Button>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Trophy className="h-3.5 w-3.5 text-warning" />
            Play scored replay challenges or historical tournament setups.
          </div>
        </GlassCard>
      </div>

      {favorites.length > 0 ? (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <Star className="h-3.5 w-3.5 text-warning" /> Favorite Scenarios
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {favorites.map((sess) => <LibraryCard key={sess.id} session={sess} />)}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground sm:mr-auto">
            Recent Sessions
          </h2>
          <Input
            placeholder="Search sessions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-full text-xs sm:w-48"
          />
          <div className="flex flex-wrap gap-1 rounded-[3px] border border-border/60 bg-background/60 p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-[3px] px-2 py-1 text-[11px] capitalize transition",
                  filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {sessions.isPending ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-[3px] border border-border/60 h-28 animate-pulse bg-muted/30" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <GlassCard className="p-8 text-center space-y-3">
            <Star className="mx-auto h-8 w-8 text-primary" />
            <div className="text-sm text-muted-foreground">No sessions match your filters.</div>
            <Button onClick={() => setPicker("free")}><Sparkles className="mr-2 h-4 w-4" />Pick a Scenario</Button>
          </GlassCard>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
          >
            {filtered.slice(0, 8).map((sess) => <LibraryCard key={sess.id} session={sess} />)}
          </motion.div>
        )}
        {filtered.length > 8 ? (
          <div className="text-center">
            <Button asChild variant="ghost" size="sm">
              <Link to="/replay/library">View all saved sessions →</Link>
            </Button>
          </div>
        ) : null}
      </section>

      <CreatorWizard open={wiz} onOpenChange={setWiz} />
      {picker ? <ScenarioPicker open={!!picker} onOpenChange={(o) => !o && setPicker(null)} mode={picker} /> : null}
    </div>
  );
}

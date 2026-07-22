import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import {
  Clock, Compass, Dices, Film, Flame, GraduationCap, Play, Sparkles, Star, Target, Trophy,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CreatorWizard } from "@/components/replay/CreatorWizard";
import { ScenarioPicker } from "@/components/replay/ScenarioPicker";
import { LibraryCard } from "@/components/replay/LibraryCard";
import { getReplayStatistics, listReplaySessions } from "@/lib/replay.functions";
import { createRandomReplaySession } from "@/lib/replay-studio.functions";
import type { ReplaySession } from "@/lib/replay/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/replay/")({
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
    onSuccess: (row: any) => navigate({ to: "/replay/session", search: { id: row.id } as any }),
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
  const recentMarkets = Array.from(new Set(all.map((s) => s.market))).slice(0, 6);
  const recentTfs = Array.from(new Set(all.map((s) => s.timeframe))).slice(0, 6);

  const s = stat.data;
  const kpis = [
    { label: "Hours Practiced", value: s ? (s.total_hours ?? 0).toFixed(1) : "0.0", icon: Clock },
    { label: "Trades Reviewed", value: s?.total_trades ?? 0, icon: Film },
    { label: "Avg Replay Score", value: s?.average_score ?? 0, icon: Sparkles },
    { label: "Practice Streak", value: `${s?.streak_days ?? 0}d`, icon: Flame },
  ];

  const modes: {
    id: string; label: string; desc: string; icon: React.ComponentType<{ className?: string }>;
    onClick: () => void; accent: string;
  }[] = [
    {
      id: "continue",
      label: active ? "Continue Last Replay" : "No Session Yet",
      desc: active ? `${active.symbol} · ${active.timeframe}` : "Start any mode below",
      icon: Play,
      accent: "from-primary/20 to-primary/5",
      onClick: () => {
        if (active) navigate({ to: "/replay/session", search: { id: active.id } as any });
        else setPicker("free");
      },
    },
    {
      id: "practice",
      label: "Practice Mode",
      desc: "Unlimited replay, pause & rewind",
      icon: GraduationCap,
      accent: "from-info/20 to-info/5",
      onClick: () => setPicker("free"),
    },
    {
      id: "challenge",
      label: "Challenge Mode",
      desc: "Hidden future, one attempt, scored",
      icon: Target,
      accent: "from-warning/20 to-warning/5",
      onClick: () => setPicker("day"),
    },
    {
      id: "tournament",
      label: "Tournament Replay",
      desc: "Replay historical championships",
      icon: Trophy,
      accent: "from-success/20 to-success/5",
      onClick: () => navigate({ to: "/championship" }),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Replay Studio"
        description="Deliberate practice for professional traders."
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => randomM.mutate()} disabled={randomM.isPending}>
              <Dices className="mr-2 h-4 w-4" />{randomM.isPending ? "Rolling…" : "Surprise Me"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPicker("free")}>
              <Compass className="mr-2 h-4 w-4" />Scenario Picker
            </Button>
            <Button size="default" onClick={() => setWiz(true)} className="shadow-elegant">
              <Sparkles className="mr-2 h-4 w-4" />New Replay
            </Button>

          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {modes.map((m) => {
          const Icon = m.icon;
          return (
            <motion.button
              key={m.id}
              whileHover={{ y: -3 }}
              onClick={m.onClick}
              className={cn(
                "group relative overflow-hidden rounded-[3px] border border-border/60 bg-card p-4 text-left transition",
                "hover:border-primary/60 hover:shadow-elegant",
              )}
            >
              <div className={cn("absolute inset-0 bg-gradient-to-br opacity-60", m.accent)} />
              <div className="relative flex items-start gap-3">
                <div className="rounded-[3px] border border-border/60 bg-background/70 p-2 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{m.label}</div>
                  <div className="text-[11px] text-muted-foreground">{m.desc}</div>
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

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
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-sm font-semibold uppercase tracking-wider text-muted-foreground">Sessions</h2>
          <Input
            placeholder="Search sessions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-48 text-xs"
          />
          <div className="flex gap-1 rounded-[3px] border border-border/60 bg-background/60 p-0.5">
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

        {recentMarkets.length ? (
          <div className="flex flex-wrap gap-1 text-[10px] text-muted-foreground">
            <span className="uppercase tracking-wider">Recent:</span>
            {recentMarkets.map((m) => (
              <button
                key={m}
                onClick={() => setSearch(m)}
                className="rounded-[3px] border border-border/60 px-1.5 py-0.5 hover:border-primary/50"
              >
                {m}
              </button>
            ))}
            <span className="ml-2 uppercase tracking-wider">TFs:</span>
            {recentTfs.map((t) => (
              <button
                key={t}
                onClick={() => setSearch(t)}
                className="rounded-[3px] border border-border/60 px-1.5 py-0.5 hover:border-primary/50"
              >
                {t}
              </button>
            ))}
          </div>
        ) : null}

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
            {filtered.slice(0, 12).map((sess) => <LibraryCard key={sess.id} session={sess} />)}
          </motion.div>
        )}
        {filtered.length > 12 ? (
          <div className="text-center">
            <Button asChild variant="ghost" size="sm">
              <Link to="/replay/library">View all in Library →</Link>
            </Button>
          </div>
        ) : null}
      </section>

      <CreatorWizard open={wiz} onOpenChange={setWiz} />
      {picker ? <ScenarioPicker open={!!picker} onOpenChange={(o) => !o && setPicker(null)} mode={picker} /> : null}
    </div>
  );
}

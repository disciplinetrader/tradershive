import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { Clock, Dices, Film, Flame, Play, Sparkles, Star, Target } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { CreatorWizard } from "@/components/replay/CreatorWizard";
import { LibraryCard } from "@/components/replay/LibraryCard";
import { getReplayStatistics, listReplaySessions } from "@/lib/replay.functions";
import { createRandomReplaySession } from "@/lib/replay-studio.functions";
import type { ReplaySession } from "@/lib/replay/types";

export const Route = createFileRoute("/_authenticated/replay/")({
  component: ReplayDashboard,
});

function ReplayDashboard() {
  const [wiz, setWiz] = useState(false);
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

  const recents = (sessions.data ?? []).slice(0, 8) as ReplaySession[];
  const active = recents.find((s) => s.status === "active" || s.status === "paused");
  const s = stat.data;

  const kpis = [
    { label: "Hours Practiced", value: s ? (s.total_hours ?? 0).toFixed(1) : "0.0", icon: Clock },
    { label: "Trades Reviewed", value: s?.total_trades ?? 0, icon: Film },
    { label: "Avg Replay Score", value: s?.average_score ?? 0, icon: Sparkles },
    { label: "Practice Streak", value: `${s?.streak_days ?? 0}d`, icon: Flame },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Replay & Deliberate Practice"
        description="Replay markets, trades and sessions. Practice like you play."
        actions={
          <>
            {active ? (
              <Button asChild variant="secondary">
                <Link to="/replay/session" search={{ id: active.id } as any}>
                  <Play className="mr-2 h-4 w-4" />Continue
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="secondary">
              <Link to="/replay/challenges"><Target className="mr-2 h-4 w-4" />Challenges</Link>
            </Button>
            <Button variant="secondary" onClick={() => randomM.mutate()} disabled={randomM.isPending}>
              <Dices className="mr-2 h-4 w-4" />{randomM.isPending ? "Rolling…" : "Surprise Me"}
            </Button>
            <Button onClick={() => setWiz(true)}>
              <Sparkles className="mr-2 h-4 w-4" />New Replay
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <GlassCard key={k.label} className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-primary/10 p-2 text-primary"><Icon className="h-4 w-4" /></div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k.label}</div>
                  <div className="text-xl font-bold tabular-nums">{k.value}</div>
                </div>
              </div>
            </GlassCard>
          );
        })}
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Recent Replays</h2>
        {sessions.isPending ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="glass rounded-3xl h-28 animate-pulse" />
            ))}
          </div>
        ) : recents.length === 0 ? (
          <GlassCard className="p-8 text-center space-y-3">
            <Star className="mx-auto h-8 w-8 text-primary" />
            <div className="text-sm text-muted-foreground">No replays yet. Start your first session to practice reading price action.</div>
            <Button onClick={() => setWiz(true)}><Sparkles className="mr-2 h-4 w-4" />Create Your First Replay</Button>
          </GlassCard>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
          >
            {recents.map((sess) => <LibraryCard key={sess.id} session={sess} />)}
          </motion.div>
        )}
      </section>

      <CreatorWizard open={wiz} onOpenChange={setWiz} />
    </div>
  );
}

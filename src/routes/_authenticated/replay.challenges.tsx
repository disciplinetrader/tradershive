import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import * as LucideIcons from "lucide-react";
import { Check, Sparkles, Trophy } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listReplayChallenges, joinReplayChallenge } from "@/lib/replay-studio.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/replay/challenges")({
  component: ChallengesPage,
});

const DIFF_COLOR: Record<string, string> = {
  beginner: "bg-success/15 text-success",
  intermediate: "bg-warning/15 text-warning",
  advanced: "bg-danger/15 text-danger",
};

function ChallengesPage() {
  const list = useServerFn(listReplayChallenges);
  const join = useServerFn(joinReplayChallenge);
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "in_progress" | "completed">("all");

  const q = useQuery({ queryKey: ["replay", "challenges"], queryFn: () => list() });
  const joinM = useMutation({
    mutationFn: (challenge_id: string) => join({ data: { challenge_id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["replay", "challenges"] }),
  });

  const items = (q.data ?? []).filter((c: any) => {
    if (filter === "all") return true;
    return c.progress?.status === filter;
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Replay Challenges"
        description="Deliberate-practice missions. Complete challenges to earn XP, coins and mastery badges."
      />

      <div className="flex gap-1 rounded-lg border border-border/40 bg-background/40 p-1 w-fit">
        {(["all", "in_progress", "completed"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs capitalize transition",
              filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {f.replace("_", " ")}
          </button>
        ))}
      </div>

      {q.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="glass h-40 rounded-3xl animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <GlassCard className="p-8 text-center text-sm text-muted-foreground">
          No challenges match this filter.
        </GlassCard>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((c: any) => {
            const Icon = (LucideIcons as any)[c.icon] ?? Trophy;
            const status = c.progress?.status;
            const done = status === "completed";
            return (
              <GlassCard key={c.id} className="p-5 space-y-3 relative overflow-hidden">
                {c.is_featured ? (
                  <Badge className="absolute top-3 right-3 bg-primary/15 text-primary hover:bg-primary/15">Featured</Badge>
                ) : null}
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-primary/10 p-2 text-primary"><Icon className="h-5 w-5" /></div>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{c.title}</div>
                    <div className={cn("inline-block mt-0.5 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider",
                      DIFF_COLOR[c.difficulty] ?? "bg-background/60 text-muted-foreground")}>
                      {c.difficulty}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground min-h-[36px]">{c.description}</p>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>+{c.xp_reward} XP · +{c.coin_reward} coins</span>
                  <span className="capitalize">{c.category}</span>
                </div>
                {done ? (
                  <Button disabled className="w-full" variant="secondary">
                    <Check className="mr-2 h-4 w-4" /> Completed
                  </Button>
                ) : status === "in_progress" ? (
                  <Button disabled className="w-full" variant="secondary">
                    <Sparkles className="mr-2 h-4 w-4" /> In Progress
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    onClick={() => joinM.mutate(c.id)}
                    disabled={joinM.isPending}
                  >
                    <Sparkles className="mr-2 h-4 w-4" /> Accept Challenge
                  </Button>
                )}
              </GlassCard>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}

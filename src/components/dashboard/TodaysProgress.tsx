import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { ArrowUpRight, Target, Plus } from "lucide-react";
import { getGoalsWithProgress } from "@/lib/goals.functions";
import { GoalCard } from "@/components/goals/GoalCard";
import { GoalsInsights } from "@/components/goals/GoalsInsights";
import { Button } from "@/components/ui/button";

/**
 * Compact "Today's Progress" widget for the Dashboard.
 * Shows the top 4 active goals + rule-based insights, with a link to the
 * full Goals page for management.
 */
export function TodaysProgress() {
  const fetchFn = useServerFn(getGoalsWithProgress);
  const q = useQuery({
    queryKey: ["goals", "progress"],
    queryFn: () => fetchFn(),
    staleTime: 30_000,
  });

  const items = q.data?.progress ?? [];
  const top = items.slice(0, 4);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Today's Progress</h2>
          <p className="text-[11px] text-muted-foreground/80">Discipline and performance goals — live from your trades.</p>
        </div>
        <Link
          to="/goals"
          className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-card/40 px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
        >
          Manage goals <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>

      {q.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 rounded-2xl border border-border/40 bg-card/40 animate-shimmer" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/50 bg-card/40 p-8 text-center"
        >
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary"><Target className="h-5 w-5" /></div>
          <div>
            <p className="text-sm font-semibold">Set your first trading goal</p>
            <p className="text-xs text-muted-foreground">Define daily/weekly targets and discipline caps to build consistency.</p>
          </div>
          <Button asChild size="sm"><Link to="/goals"><Plus className="mr-1 h-3.5 w-3.5" /> Create a goal</Link></Button>
        </motion.div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {top.map((p) => <GoalCard key={p.goal.id} progress={p} compact />)}
          </div>
          {items.length > 0 && <GoalsInsights progress={items} />}
        </>
      )}
    </section>
  );
}

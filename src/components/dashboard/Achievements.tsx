import { motion } from "framer-motion";
import { Award, Lock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { listAchievements } from "@/lib/gamification.functions";
import { cn } from "@/lib/utils";

export function Achievements() {
  const fetchAch = useServerFn(listAchievements);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard_achievements"],
    queryFn: () => fetchAch({} as any),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
    );
  }
  const items = ((data as any[]) ?? []).slice(0, 8);
  if (items.length === 0) {
    return <EmptyState icon={Award} title="No achievements yet" description="Trade, journal, and complete challenges to unlock them." />;
  }
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((a, i) => {
        const target = Number(a.target ?? 1) || 1;
        const pct = Math.min(100, Math.round((Number(a.progress ?? 0) / target) * 100));
        return (
          <motion.div
            key={a.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.03 }}
            className={cn(
              "relative rounded-2xl border p-3 text-center transition",
              a.unlocked ? "border-primary/30 bg-primary/5 shadow-elegant" : "border-border/40 bg-surface/40 opacity-80",
            )}
          >
            <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-background/60 text-2xl">
              {a.unlocked ? (a.icon ?? "🏆") : <Lock className="h-4 w-4 text-muted-foreground" />}
            </div>
            <div className="mt-2 truncate text-xs font-semibold">{a.title}</div>
            <div className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">{a.description}</div>
            {!a.unlocked ? <Progress value={pct} className="mt-2 h-1" /> : null}
          </motion.div>
        );
      })}
    </div>
  );
}

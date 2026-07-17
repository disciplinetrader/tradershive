import { motion } from "framer-motion";
import { Lock } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { MOCK_ACHIEVEMENTS } from "@/lib/dashboard-mock";
import { cn } from "@/lib/utils";

export function Achievements() {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {MOCK_ACHIEVEMENTS.map((a, i) => (
        <motion.div
          key={a.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: i * 0.03 }}
          className={cn(
            "relative rounded-2xl border p-3 text-center transition",
            a.unlocked
              ? "border-primary/30 bg-primary/5 shadow-elegant"
              : "border-border/40 bg-surface/40 opacity-80",
          )}
        >
          <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-background/60 text-2xl">
            {a.unlocked ? a.icon : <Lock className="h-4 w-4 text-muted-foreground" />}
          </div>
          <div className="mt-2 truncate text-xs font-semibold">{a.name}</div>
          <div className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">{a.description}</div>
          {!a.unlocked && typeof a.progress === "number" ? (
            <Progress value={a.progress} className="mt-2 h-1" />
          ) : null}
        </motion.div>
      ))}
    </div>
  );
}

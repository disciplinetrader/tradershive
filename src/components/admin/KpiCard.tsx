import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

export function KpiCard({
  label, value, icon: Icon, hint, delta, tone = "default",
}: {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  hint?: string;
  delta?: string;
  tone?: "default" | "positive" | "negative" | "warning";
}) {
  const toneClass = {
    default: "text-foreground",
    positive: "text-emerald-400",
    negative: "text-rose-400",
    warning: "text-amber-400",
  }[tone];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 220, damping: 22 }}
    >
      <GlassCard className="relative overflow-hidden p-4">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</div>
          {Icon ? <Icon className="h-4 w-4 text-muted-foreground/70" /> : null}
        </div>
        <div className={cn("mt-1 font-mono text-2xl font-bold", toneClass)}>{value}</div>
        {hint || delta ? (
          <div className="mt-1 flex items-center justify-between text-[11px]">
            {hint ? <span className="text-muted-foreground">{hint}</span> : <span />}
            {delta ? <span className={cn("font-mono", toneClass)}>{delta}</span> : null}
          </div>
        ) : null}
      </GlassCard>
    </motion.div>
  );
}

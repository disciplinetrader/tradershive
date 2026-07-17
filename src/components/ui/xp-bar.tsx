import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export interface XPBarProps {
  xp: number;
  needed: number;
  level: number;
  className?: string;
}

export function XPBar({ xp, needed, level, className }: XPBarProps) {
  const pct = Math.min(100, Math.round((xp / needed) * 100));
  return (
    <div className={cn("w-full", className)}>
      <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="font-semibold text-foreground">Lvl {level}</span>
        <span className="font-mono">{xp} / {needed} XP</span>
      </div>
      <div className="relative h-2 overflow-hidden rounded-full bg-surface-2">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="h-full rounded-full gradient-primary"
        />
      </div>
    </div>
  );
}

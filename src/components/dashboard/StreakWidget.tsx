import { motion } from "framer-motion";
import { BookOpen, Flame, LineChart, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export function StreakWidget() {
  const { profile } = useAuth();
  const daily = profile?.streak ?? 0;
  const items = [
    { icon: Flame, label: "Daily", value: daily, color: "text-warning" },
    { icon: BookOpen, label: "Journal", value: Math.max(0, daily - 1), color: "text-info" },
    { icon: Sparkles, label: "Challenge", value: Math.max(0, Math.floor(daily / 2)), color: "text-primary" },
    { icon: LineChart, label: "Trading", value: daily, color: "text-chart-5" },
  ];

  return (
    <div>
      <div className="flex items-center justify-center">
        <motion.div
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          className="grid h-20 w-20 place-items-center rounded-full bg-warning/15 text-warning"
        >
          <Flame className="h-9 w-9" />
        </motion.div>
      </div>
      <div className="mt-3 text-center">
        <div className="text-3xl font-bold tabular-nums">{daily}<span className="ml-1 text-sm font-normal text-muted-foreground">days</span></div>
        <div className="text-xs text-muted-foreground">Keep your fire alive — next reward at {daily + (7 - (daily % 7))}d</div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {items.map((it) => (
          <div key={it.label} className="glass flex items-center gap-2 rounded-xl p-2.5">
            <it.icon className={`h-4 w-4 ${it.color}`} />
            <div className="min-w-0">
              <div className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">{it.label}</div>
              <div className="text-sm font-semibold tabular-nums">{it.value}d</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

import { Activity, ArrowDownRight, ArrowUpRight, BarChart3, Clock, Percent, Target, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { AnimatedCounter } from "./AnimatedCounter";

type Metric = {
  label: string;
  value: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  hint: string;
  icon: LucideIcon;
  tone: "positive" | "negative" | "neutral";
};

const METRICS: Metric[] = [
  { label: "Win rate", value: 58.4, suffix: "%", decimals: 1, hint: "Last 60 trades", icon: Target, tone: "positive" },
  { label: "Profit factor", value: 1.84, decimals: 2, hint: "Gross win / loss", icon: TrendingUp, tone: "positive" },
  { label: "Avg RR", value: 1.7, suffix: "R", decimals: 1, hint: "Realized", icon: Percent, tone: "positive" },
  { label: "Current drawdown", value: 4.2, prefix: "-", suffix: "%", decimals: 1, hint: "From peak", icon: ArrowDownRight, tone: "negative" },
  { label: "Total trades", value: 128, hint: "All time", icon: BarChart3, tone: "neutral" },
  { label: "Winning", value: 75, hint: "Wins closed", icon: ArrowUpRight, tone: "positive" },
  { label: "Losing", value: 48, hint: "Losses closed", icon: ArrowDownRight, tone: "negative" },
  { label: "Avg hold", value: 92, suffix: "m", hint: "Minutes / trade", icon: Clock, tone: "neutral" },
];

export function StatsOverview() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {METRICS.map((m) => {
        const toneColor =
          m.tone === "positive" ? "text-primary" : m.tone === "negative" ? "text-danger" : "text-foreground";
        return (
          <GlassCard key={m.label} className="p-4">
            <div className="flex items-start justify-between">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {m.label}
              </p>
              <div className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
                <m.icon className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className={`mt-2 text-2xl font-bold tracking-tight ${toneColor}`}>
              <AnimatedCounter
                value={m.value}
                decimals={m.decimals ?? 0}
                prefix={m.prefix ?? ""}
                suffix={m.suffix ?? ""}
              />
            </div>
            <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Activity className="h-3 w-3" /> {m.hint}
            </p>
          </GlassCard>
        );
      })}
    </div>
  );
}

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { GlassCard } from "./glass-card";

export interface StatCardProps {
  label: string;
  value: string | number;
  delta?: string;
  trend?: "up" | "down" | "flat";
  icon?: LucideIcon;
  hint?: string;
  className?: string;
}

export function StatCard({ label, value, delta, trend = "flat", icon: Icon, hint, className }: StatCardProps) {
  const trendColor =
    trend === "up" ? "text-primary" : trend === "down" ? "text-danger" : "text-muted-foreground";
  const TrendIcon = trend === "down" ? ArrowDownRight : ArrowUpRight;
  return (
    <GlassCard className={cn("p-5", className)}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
        {Icon ? (
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </div>
        ) : null}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-3xl font-bold tracking-tight">{value}</span>
      </div>
      {delta || hint ? (
        <div className="mt-2 flex items-center gap-2 text-xs">
          {delta ? (
            <span className={cn("inline-flex items-center gap-1 font-medium", trendColor)}>
              {trend !== "flat" ? <TrendIcon className="h-3 w-3" /> : null}
              {delta}
            </span>
          ) : null}
          {hint ? <span className="text-muted-foreground">{hint}</span> : null}
        </div>
      ) : null}
    </GlassCard>
  );
}

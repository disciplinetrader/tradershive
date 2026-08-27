import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { AnimatedCounter } from "@/components/dashboard/AnimatedCounter";
import { cn } from "@/lib/utils";

export interface KpiTileProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone?: "up" | "down" | "info" | "flat" | "success" | "danger";
  decimals?: number;
  prefix?: string;
  suffix?: string;
  hint?: string;
  delay?: number;
}

export function KpiTile({
  label, value, icon: Icon, tone = "info", decimals, prefix, suffix, hint, delay = 0,
}: KpiTileProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.3 }}>
      {/* Stable hook for e2e: KPI values are the only place a test can observe
          that a filter narrowed the DATASET rather than merely rendering a
          control. Keyed by label so it survives reordering. */}
      <GlassCard className="p-4 h-full" data-testid={`kpi-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
        <div className="flex items-start justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
          <div
            className={cn(
              "grid h-8 w-8 place-items-center rounded-xl",
              (tone === "up" || tone === "success") && "bg-success/10 text-success",
              (tone === "down" || tone === "danger") && "bg-danger/10 text-danger",
              tone === "info" && "bg-primary/10 text-primary",
              tone === "flat" && "bg-muted/40 text-muted-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3 text-2xl font-bold tabular-nums tracking-tight">
          {typeof value === "number"
            ? <AnimatedCounter value={value} decimals={decimals ?? 0} prefix={prefix ?? ""} suffix={suffix ?? ""} />
            : value}
        </div>
        {hint ? <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p> : null}
      </GlassCard>
    </motion.div>
  );
}

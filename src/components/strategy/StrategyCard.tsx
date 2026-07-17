import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import * as icons from "lucide-react";
import { Star } from "lucide-react";
import type { Strategy } from "@/lib/strategy/types";
import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";

export function StrategyCard({ strategy }: { strategy: Strategy }) {
  const Icon = ((icons as any)[strategy.icon] ?? icons.Sparkles) as React.ComponentType<{ className?: string }>;
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <Link to="/strategies/$id" params={{ id: strategy.id }} className="block">
        <GlassCard interactive className="p-4 h-full space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className="grid place-items-center rounded-xl p-2 shrink-0"
                style={{ background: `${strategy.color}22`, color: strategy.color }}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{strategy.name}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {strategy.category ?? "uncategorized"} · v{strategy.version}
                </div>
              </div>
            </div>
            {strategy.is_favorite ? <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" /> : null}
          </div>
          {strategy.description ? (
            <p className="line-clamp-2 text-xs text-muted-foreground">{strategy.description}</p>
          ) : null}
          <div className="flex flex-wrap gap-1">
            {strategy.tags.slice(0, 4).map((t) => (
              <span key={t} className="rounded-md bg-background/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                #{t}
              </span>
            ))}
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span className={cn("uppercase tracking-wider",
              strategy.status === "public" ? "text-emerald-400" :
              strategy.status === "archived" ? "text-muted-foreground" : "text-primary",
            )}>{strategy.status}</span>
            <span>{strategy.timeframes.slice(0, 3).join(", ")}</span>
          </div>
        </GlassCard>
      </Link>
    </motion.div>
  );
}

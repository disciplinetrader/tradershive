import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  Award,
  BarChart3,
  Flame,
  Layers,
  Percent,
  Sigma,
  Target,
  Timer,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import type { JournalEntry } from "@/lib/journal/api";
import { formatCurrency, formatDuration, formatNumber } from "@/lib/journal/format";
import { AnimatedCounter } from "@/components/dashboard/AnimatedCounter";
import { cn } from "@/lib/utils";

export function JournalStats({ entries }: { entries: JournalEntry[] }) {
  const stats = useMemo(() => {
    const total = entries.length;
    let wins = 0,
      losses = 0,
      breakevens = 0;
    let grossProfit = 0,
      grossLoss = 0,
      totalR = 0,
      rrSum = 0,
      rrCount = 0,
      durationSum = 0,
      durationCount = 0;
    const setupPnL = new Map<string, number>();
    const setupCount = new Map<string, number>();

    entries.forEach((e) => {
      const pnl = Number(e.pnl ?? 0);
      if (pnl > 0) {
        wins += 1;
        grossProfit += pnl;
      } else if (pnl < 0) {
        losses += 1;
        grossLoss += Math.abs(pnl);
      } else {
        breakevens += 1;
      }
      if (e.rr != null) {
        rrSum += Number(e.rr);
        rrCount += 1;
        totalR += Number(e.rr);
      }
      if (e.duration_seconds) {
        durationSum += e.duration_seconds;
        durationCount += 1;
      }
      if (e.setup) {
        setupPnL.set(e.setup, (setupPnL.get(e.setup) ?? 0) + pnl);
        setupCount.set(e.setup, (setupCount.get(e.setup) ?? 0) + 1);
      }
    });

    const winRate = total ? (wins / total) * 100 : 0;
    const avgRR = rrCount ? rrSum / rrCount : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
    const avgDuration = durationCount ? durationSum / durationCount : 0;

    // Current streak (walk newest → oldest, count same-sign)
    let streak = 0;
    let streakSign: 1 | -1 | 0 = 0;
    for (const e of entries) {
      const pnl = Number(e.pnl ?? 0);
      const sign: 1 | -1 | 0 = pnl > 0 ? 1 : pnl < 0 ? -1 : 0;
      if (sign === 0) break;
      if (streakSign === 0) streakSign = sign;
      if (sign !== streakSign) break;
      streak += 1;
    }

    let bestSetup: [string, number] | null = null;
    let worstSetup: [string, number] | null = null;
    setupPnL.forEach((v, k) => {
      if (!bestSetup || v > bestSetup[1]) bestSetup = [k, v];
      if (!worstSetup || v < worstSetup[1]) worstSetup = [k, v];
    });

    return {
      total,
      wins,
      losses,
      breakevens,
      winRate,
      avgRR,
      profitFactor,
      totalR,
      avgDuration,
      streak,
      streakSign,
      bestSetup,
      worstSetup,
    };
  }, [entries]);

  const cards = [
    { key: "total", label: "Total Trades", value: stats.total, icon: Layers, tone: "info" as const },
    {
      key: "win",
      label: "Win Rate",
      value: `${formatNumber(stats.winRate, 1)}%`,
      icon: Percent,
      tone: stats.winRate >= 50 ? ("up" as const) : ("down" as const),
      raw: stats.winRate,
    },
    {
      key: "rr",
      label: "Average RR",
      value: `${formatNumber(stats.avgRR, 2)}R`,
      icon: Target,
      tone: stats.avgRR >= 1 ? ("up" as const) : ("down" as const),
      raw: stats.avgRR,
    },
    {
      key: "pf",
      label: "Profit Factor",
      value: stats.profitFactor >= 999 ? "∞" : formatNumber(stats.profitFactor, 2),
      icon: BarChart3,
      tone: stats.profitFactor >= 1 ? ("up" as const) : ("down" as const),
      raw: stats.profitFactor,
    },
    {
      key: "netr",
      label: "Net R",
      value: `${formatNumber(stats.totalR, 2)}R`,
      icon: Sigma,
      tone: stats.totalR >= 0 ? ("up" as const) : ("down" as const),
      raw: stats.totalR,
    },
    {
      key: "hold",
      label: "Avg Hold",
      value: formatDuration(stats.avgDuration),
      icon: Timer,
      tone: "flat" as const,
    },
    {
      key: "streak",
      label: "Current Streak",
      value: stats.streak === 0 ? "—" : `${stats.streak} ${stats.streakSign === 1 ? "W" : "L"}`,
      icon: Flame,
      tone: stats.streakSign === -1 ? ("down" as const) : ("up" as const),
    },
    {
      key: "best",
      label: "Best Setup",
      value: stats.bestSetup ? formatCurrency(stats.bestSetup[1]) : "—",
      hint: stats.bestSetup ? formatSetup(stats.bestSetup[0]) : undefined,
      icon: Award,
      tone: "up" as const,
    },
    {
      key: "worst",
      label: "Worst Setup",
      value: stats.worstSetup ? formatCurrency(stats.worstSetup[1]) : "—",
      hint: stats.worstSetup ? formatSetup(stats.worstSetup[0]) : undefined,
      icon: TrendingDown,
      tone: "down" as const,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {cards.map((c, i) => (
        <motion.div
          key={c.key}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.03, duration: 0.3 }}
        >
          <GlassCard className="p-4">
            <div className="flex items-start justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {c.label}
              </p>
              <div
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-xl",
                  c.tone === "up" && "bg-success/10 text-success",
                  c.tone === "down" && "bg-danger/10 text-danger",
                  c.tone === "info" && "bg-primary/10 text-primary",
                  c.tone === "flat" && "bg-muted/40 text-muted-foreground",
                )}
              >
                <c.icon className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2 text-2xl font-bold tracking-tight tabular-nums">
              {typeof c.value === "number" ? (
                <AnimatedCounter value={c.value} />
              ) : "raw" in c && typeof c.raw === "number" ? (
                <AnimatedCounter
                  value={c.raw}
                  decimals={c.key === "win" ? 1 : 2}
                  suffix={c.key === "win" ? "%" : c.key === "rr" || c.key === "netr" ? "R" : ""}
                />
              ) : (
                <span>{c.value}</span>
              )}
            </div>
            {"hint" in c && c.hint ? (
              <p className="mt-1 truncate text-xs text-muted-foreground">{c.hint}</p>
            ) : null}
          </GlassCard>
        </motion.div>
      ))}
    </div>
  );
}

function formatSetup(v: string): string {
  return v.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

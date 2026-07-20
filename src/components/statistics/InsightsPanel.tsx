import { useMemo } from "react";
import { Award, ChartCandlestick, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { useStatistics } from "./context";
import { groupBy, weekdayBuckets, timeOfDayBuckets, groupByMonth } from "@/lib/statistics/calculations";
import { fmtCurrency } from "@/lib/statistics/format";
import { SESSION_LABEL } from "@/lib/statistics/session";

export function InsightsPanel() {
  const { filtered } = useStatistics();

  const insights = useMemo(() => {
    const byPair = groupBy(filtered, (t) => t.symbol);
    const bySession = groupBy(filtered, (t) => t.session ?? null);
    const bySetup = groupBy(filtered, (t) => t.setup ?? null);
    const days = weekdayBuckets(filtered);
    const hours = timeOfDayBuckets(filtered);
    const months = groupByMonth(filtered);

    const best = <T extends { key: string; netProfit: number }>(rows: T[]) => rows.slice().sort((a, b) => b.netProfit - a.netProfit)[0];
    const worst = <T extends { key: string; netProfit: number }>(rows: T[]) => rows.slice().sort((a, b) => a.netProfit - b.netProfit)[0];

    const emotionCount = new Map<string, number>();
    const mistakeCount = new Map<string, number>();
    for (const t of filtered) {
      if (!t.closed_at) continue;
      for (const e of t.emotions ?? []) emotionCount.set(e, (emotionCount.get(e) ?? 0) + 1);
      for (const m of t.mistakes ?? []) mistakeCount.set(m, (mistakeCount.get(m) ?? 0) + 1);
    }
    const topEmotion = Array.from(emotionCount.entries()).sort((a, b) => b[1] - a[1])[0];
    const topMistake = Array.from(mistakeCount.entries()).sort((a, b) => b[1] - a[1])[0];

    const bestDay = days.slice().sort((a, b) => b.pnl - a.pnl)[0];
    const bestHour = hours.slice().sort((a, b) => b.pnl - a.pnl)[0];
    const bestMonth = months.slice().sort((a, b) => b.pnl - a.pnl)[0];

    return {
      bestPair: best(byPair), worstPair: worst(byPair),
      bestSession: best(bySession), worstSession: worst(bySession),
      bestSetup: best(bySetup), worstSetup: worst(bySetup),
      bestDay, bestHour, bestMonth,
      topEmotion, topMistake,
    };
  }, [filtered]);

  const items = [
    { icon: TrendingUp, tone: "up" as const, label: "Best pair", value: insights.bestPair ? `${insights.bestPair.key} · ${fmtCurrency(insights.bestPair.netProfit)}` : "—" },
    { icon: TrendingDown, tone: "down" as const, label: "Worst pair", value: insights.worstPair ? `${insights.worstPair.key} · ${fmtCurrency(insights.worstPair.netProfit)}` : "—" },
    { icon: Award, tone: "up" as const, label: "Best session", value: insights.bestSession ? `${SESSION_LABEL[insights.bestSession.key] ?? insights.bestSession.key} · ${fmtCurrency(insights.bestSession.netProfit)}` : "—" },
    { icon: TrendingDown, tone: "down" as const, label: "Worst session", value: insights.worstSession ? `${SESSION_LABEL[insights.worstSession.key] ?? insights.worstSession.key} · ${fmtCurrency(insights.worstSession.netProfit)}` : "—" },
    { icon: ChartCandlestick, tone: "up" as const, label: "Best setup", value: insights.bestSetup ? `${insights.bestSetup.key} · ${fmtCurrency(insights.bestSetup.netProfit)}` : "—" },
    { icon: TrendingDown, tone: "down" as const, label: "Worst setup", value: insights.worstSetup ? `${insights.worstSetup.key} · ${fmtCurrency(insights.worstSetup.netProfit)}` : "—" },
    { icon: Sparkles, tone: "up" as const, label: "Most profitable weekday", value: insights.bestDay ? `${insights.bestDay.day} · ${fmtCurrency(insights.bestDay.pnl)}` : "—" },
    { icon: Sparkles, tone: "up" as const, label: "Most profitable hour", value: insights.bestHour ? `${insights.bestHour.hour}:00 · ${fmtCurrency(insights.bestHour.pnl)}` : "—" },
    { icon: Sparkles, tone: "up" as const, label: "Most consistent month", value: insights.bestMonth ? `${insights.bestMonth.month} · ${fmtCurrency(insights.bestMonth.pnl)}` : "—" },
    { icon: Sparkles, tone: "flat" as const, label: "Most common emotion", value: insights.topEmotion ? `${insights.topEmotion[0]} (${insights.topEmotion[1]}×)` : "—" },
    { icon: Sparkles, tone: "flat" as const, label: "Most common mistake", value: insights.topMistake ? `${insights.topMistake[0]} (${insights.topMistake[1]}×)` : "—" },
  ];

  return (
    <GlassCard className="p-4">
      <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Automated insights</div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-border/40 bg-background/40 p-3">
            <div className={`grid h-8 w-8 place-items-center rounded-xl ${it.tone === "up" ? "bg-success/10 text-success" : it.tone === "down" ? "bg-danger/10 text-danger" : "bg-muted/40 text-muted-foreground"}`}>
              <it.icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{it.label}</div>
              <div className="text-sm font-semibold truncate">{it.value}</div>
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

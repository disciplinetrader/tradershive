import { useMemo } from "react";
import { AlertTriangle, Award, ChartCandlestick, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { useStatistics } from "./context";
import { groupBy, weekdayBuckets, timeOfDayBuckets, groupByMonth, computeKpis } from "@/lib/statistics/calculations";
import { fmtCurrency, fmtPercent } from "@/lib/statistics/format";
import { SESSION_LABEL } from "@/lib/statistics/session";

type Tone = "up" | "down" | "warn" | "flat";
type Headline = { icon: typeof Sparkles; tone: Tone; title: string; detail: string };

const MIN_SAMPLE = 5;

function bestByExpectancy<T extends { key: string; trades: number; netProfit: number }>(rows: T[]) {
  const eligible = rows.filter((r) => r.trades >= MIN_SAMPLE);
  return eligible.slice().sort((a, b) => b.netProfit / b.trades - a.netProfit / a.trades)[0];
}
function worstByExpectancy<T extends { key: string; trades: number; netProfit: number }>(rows: T[]) {
  const eligible = rows.filter((r) => r.trades >= MIN_SAMPLE);
  return eligible.slice().sort((a, b) => a.netProfit / a.trades - b.netProfit / b.trades)[0];
}

export function InsightsPanel() {
  const { filtered, loading } = useStatistics();

  const headlines = useMemo<Headline[]>(() => {
    const list: Headline[] = [];
    if (filtered.length === 0) return list;

    const byPair = groupBy(filtered, (t) => t.symbol);
    const bySession = groupBy(filtered, (t) => t.session ?? null);
    const bySetup = groupBy(filtered, (t) => t.setup ?? t.strategy ?? null);
    const byMarket = groupBy(filtered, (t) => t.market ?? null);
    const days = weekdayBuckets(filtered);
    const hours = timeOfDayBuckets(filtered);
    const months = groupByMonth(filtered);
    const k = computeKpis(filtered);

    const bestPair = bestByExpectancy(byPair);
    if (bestPair) list.push({
      icon: TrendingUp, tone: "up",
      title: `${bestPair.key} is your highest-expectancy pair`,
      detail: `${bestPair.trades} trades · ${fmtPercent(bestPair.winRate)} win rate · ${fmtCurrency(bestPair.netProfit / bestPair.trades)} / trade`,
    });
    const worstPair = worstByExpectancy(byPair);
    if (worstPair && worstPair.netProfit < 0) list.push({
      icon: TrendingDown, tone: "down",
      title: `${worstPair.key} is dragging your P&L`,
      detail: `${worstPair.trades} trades · ${fmtCurrency(worstPair.netProfit)} · consider a cool-off`,
    });

    const bestSession = bestByExpectancy(bySession);
    if (bestSession) list.push({
      icon: Award, tone: "up",
      title: `Your ${SESSION_LABEL[bestSession.key] ?? bestSession.key} session win rate is ${fmtPercent(bestSession.winRate)}`,
      detail: `${bestSession.trades} trades · ${fmtCurrency(bestSession.netProfit)} net`,
    });
    const worstSession = worstByExpectancy(bySession);
    if (worstSession && worstSession.netProfit < 0) list.push({
      icon: AlertTriangle, tone: "warn",
      title: `${SESSION_LABEL[worstSession.key] ?? worstSession.key} session is unprofitable`,
      detail: `${worstSession.trades} trades · ${fmtCurrency(worstSession.netProfit)} net`,
    });

    const bestMarket = bestByExpectancy(byMarket);
    if (bestMarket) list.push({
      icon: TrendingUp, tone: "up",
      title: `You perform best in ${bestMarket.key}`,
      detail: `${bestMarket.trades} trades · ${fmtPercent(bestMarket.winRate)} · ${fmtCurrency(bestMarket.netProfit)}`,
    });

    const bestSetup = bestByExpectancy(bySetup);
    if (bestSetup) list.push({
      icon: ChartCandlestick, tone: "up",
      title: `"${bestSetup.key}" is your strongest setup`,
      detail: `${bestSetup.trades} trades · ${fmtPercent(bestSetup.winRate)} · ${fmtCurrency(bestSetup.netProfit / bestSetup.trades)} / trade`,
    });
    const worstSetup = worstByExpectancy(bySetup);
    if (worstSetup && worstSetup.netProfit < 0 && worstSetup.key !== bestSetup?.key) list.push({
      icon: TrendingDown, tone: "down",
      title: `"${worstSetup.key}" loses you money`,
      detail: `${worstSetup.trades} trades · ${fmtCurrency(worstSetup.netProfit)} · review or drop`,
    });

    const activeDays = days.filter((d) => d.trades >= MIN_SAMPLE);
    const worstDay = activeDays.slice().sort((a, b) => a.pnl - b.pnl)[0];
    if (worstDay && worstDay.pnl < 0) list.push({
      icon: AlertTriangle, tone: "warn",
      title: `Most losses occur on ${worstDay.day}s`,
      detail: `${worstDay.trades} trades · ${fmtCurrency(worstDay.pnl)}`,
    });
    const bestDay = activeDays.slice().sort((a, b) => b.pnl - a.pnl)[0];
    if (bestDay && bestDay.pnl > 0) list.push({
      icon: Sparkles, tone: "up",
      title: `${bestDay.day} is your most profitable weekday`,
      detail: `${bestDay.trades} trades · ${fmtCurrency(bestDay.pnl)}`,
    });

    const bestHour = hours.filter((h) => h.trades >= MIN_SAMPLE).slice().sort((a, b) => b.pnl - a.pnl)[0];
    if (bestHour) list.push({
      icon: Sparkles, tone: "up",
      title: `Peak performance at ${String(bestHour.hour).padStart(2, "0")}:00`,
      detail: `${bestHour.trades} trades · ${fmtCurrency(bestHour.pnl)}`,
    });

    const bestMonth = months.slice().sort((a, b) => b.pnl - a.pnl)[0];
    if (bestMonth) list.push({
      icon: Sparkles, tone: "up",
      title: `Best month: ${bestMonth.month}`,
      detail: `${bestMonth.trades} trades · ${fmtCurrency(bestMonth.pnl)}`,
    });

    // Streak & drawdown warnings
    if (k.currentStreak.kind === "loss" && k.currentStreak.count >= 3) list.push({
      icon: AlertTriangle, tone: "warn",
      title: `${k.currentStreak.count}-trade losing streak in progress`,
      detail: "Consider stepping away and reviewing your last 5 trades before your next entry.",
    });
    if (k.maxDrawdownPct >= 20) list.push({
      icon: AlertTriangle, tone: "warn",
      title: `Max drawdown reached ${k.maxDrawdownPct.toFixed(1)}%`,
      detail: `${fmtCurrency(k.maxDrawdown)} from peak — tighten risk-per-trade`,
    });

    // Behavioural
    const emotionCount = new Map<string, number>();
    const mistakeCount = new Map<string, number>();
    for (const t of filtered) {
      if (!t.closed_at) continue;
      for (const e of t.emotions ?? []) emotionCount.set(e, (emotionCount.get(e) ?? 0) + 1);
      for (const m of t.mistakes ?? []) mistakeCount.set(m, (mistakeCount.get(m) ?? 0) + 1);
    }
    const topMistake = Array.from(mistakeCount.entries()).sort((a, b) => b[1] - a[1])[0];
    if (topMistake) list.push({
      icon: AlertTriangle, tone: "warn",
      title: `Recurring mistake: "${topMistake[0]}"`,
      detail: `Tagged on ${topMistake[1]} trades — address before next session`,
    });
    const topEmotion = Array.from(emotionCount.entries()).sort((a, b) => b[1] - a[1])[0];
    if (topEmotion) list.push({
      icon: Sparkles, tone: "flat",
      title: `Dominant emotion: "${topEmotion[0]}"`,
      detail: `Logged on ${topEmotion[1]} trades`,
    });

    return list;
  }, [filtered]);

  return (
    <GlassCard className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Automated insights</div>
        <div className="text-[10px] text-muted-foreground">
          Sample threshold: {MIN_SAMPLE}+ trades
        </div>
      </div>
      {loading && filtered.length === 0 ? (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-muted animate-shimmer" />
          ))}
        </div>
      ) : headlines.length === 0 ? (
        <div className="rounded-xl border border-border/40 bg-background/40 p-6 text-center text-sm text-muted-foreground">
          Log more trades to unlock automated insights.
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {headlines.map((h, i) => (
            <div key={i} className="flex items-start gap-3 rounded-xl border border-border/40 bg-background/40 p-3">
              <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${
                h.tone === "up" ? "bg-success/10 text-success" :
                h.tone === "down" ? "bg-danger/10 text-danger" :
                h.tone === "warn" ? "bg-warning/10 text-warning" :
                "bg-muted/40 text-muted-foreground"
              }`}>
                <h.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold leading-snug">{h.title}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{h.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}

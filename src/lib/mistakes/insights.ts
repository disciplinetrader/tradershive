import type { DetectedMistake, EngineInsight, NormalizedTrade } from "./types";

export function buildInsights(detected: DetectedMistake[], trades: NormalizedTrade[]): EngineInsight[] {
  const insights: EngineInsight[] = [];
  const active = detected.filter((d) => !d.resolved).sort((a, b) => Math.abs(b.impact_r) - Math.abs(a.impact_r));

  // 1) Biggest cost habit
  if (active.length && active[0].impact_r < 0) {
    const d = active[0];
    insights.push({
      id: "top_cost",
      tone: "warn",
      related_kinds: [d.kind],
      text: `${d.title} is costing you ${d.impact_r.toFixed(1)}R across ${d.frequency} trades — your single most expensive habit.`,
    });
  }

  // 2) Best-performing strategy has lowest frequency
  const closed = trades.filter((t) => t.status === "closed" && t.strategy_id);
  const bySt = new Map<string, { count: number; sum: number; wins: number; name: string }>();
  for (const t of closed) {
    const key = t.strategy_id!;
    const b = bySt.get(key) ?? { count: 0, sum: 0, wins: 0, name: t.strategy_name ?? "Setup" };
    b.count += 1;
    b.sum += t.rr ?? 0;
    if (t.outcome === "win") b.wins += 1;
    bySt.set(key, b);
  }
  const setups = Array.from(bySt.values()).filter((s) => s.count >= 3);
  if (setups.length >= 2) {
    const byAvgR = [...setups].sort((a, b) => b.sum / b.count - a.sum / a.count);
    const best = byAvgR[0];
    if (best.sum / best.count > 0.3 && best.count === Math.min(...setups.map((s) => s.count))) {
      insights.push({
        id: "best_low_freq",
        tone: "info",
        related_kinds: [],
        text: `Your best-performing setup (${best.name}) has the lowest trade frequency. Trade it more.`,
      });
    }
  }

  // 3) Losing session
  const bySess = new Map<string, { count: number; sum: number }>();
  for (const t of closed) {
    const key = t.session ?? "unknown";
    const b = bySess.get(key) ?? { count: 0, sum: 0 };
    b.count += 1;
    b.sum += t.rr ?? 0;
    bySess.set(key, b);
  }
  const sessArr = Array.from(bySess.entries()).filter(([k, v]) => k !== "unknown" && v.count >= 5);
  if (sessArr.length >= 2) {
    const worst = sessArr.sort(([, a], [, b]) => a.sum / a.count - b.sum / b.count)[0];
    if (worst[1].sum / worst[1].count < -0.2) {
      insights.push({
        id: "losing_session",
        tone: "warn",
        related_kinds: [],
        text: `Most losing trades occur during ${worst[0]} session (avg ${(worst[1].sum / worst[1].count).toFixed(2)}R).`,
      });
    }
  }

  // 4) Loss size trending up
  const losses = closed.filter((t) => t.outcome === "loss" && t.closed_at).sort(
    (a, b) => new Date(a.closed_at!).getTime() - new Date(b.closed_at!).getTime(),
  );
  if (losses.length >= 6) {
    const half = Math.floor(losses.length / 2);
    const early = avg(losses.slice(0, half).map((t) => t.rr ?? 0));
    const late = avg(losses.slice(half).map((t) => t.rr ?? 0));
    if (late < early - 0.2) {
      insights.push({
        id: "loss_increase",
        tone: "warn",
        related_kinds: ["let_loser_run"],
        text: `Your average loss is growing (${early.toFixed(2)}R → ${late.toFixed(2)}R this range).`,
      });
    }
  }

  // 5) Positive: early-exit habit improving
  const earlyExit = detected.find((d) => d.kind === "early_exit_winner");
  if (earlyExit && earlyExit.trend === "improving") {
    insights.push({
      id: "early_exit_improving",
      tone: "positive",
      related_kinds: ["early_exit_winner"],
      text: `You've stopped closing winners early — this habit is improving.`,
    });
  }

  // 6) Consistent exit habit if none of the early/late exit rules fire
  if (!detected.find((d) => d.kind === "early_exit_winner" && !d.resolved) && closed.length >= 10) {
    insights.push({
      id: "exit_consistent",
      tone: "positive",
      related_kinds: [],
      text: `You're letting winners breathe — no early-exit pattern detected.`,
    });
  }

  return insights;
}

function avg(xs: number[]) { return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0; }

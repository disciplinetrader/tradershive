/**
 * Progress computation for trading goals.
 *
 * Pure functions. All inputs are already fetched (paper trades merged with
 * journal, replay sessions, etc.). Kept isomorphic so both server and
 * client can reuse the same math (server does the computation to keep the
 * payload small; client formats and re-derives insights when filters
 * change).
 */

import {
  GOAL_META,
  type GoalKind,
  type GoalPeriod,
  type GoalProgress,
  type GoalRow,
  type GoalStatus,
} from "./types";

export type GoalTrade = {
  id: string;
  closed_at: string | null;
  opened_at: string | null;
  pnl: number;
  rr: number | null;
  risk_pct: number | null;
  has_journal: boolean;
};

export type GoalReplaySession = {
  id: string;
  duration_seconds: number | null;
  created_at: string;
};

export type GoalJournalEntry = {
  id: string;
  created_at: string;
};

export type ProgressInputs = {
  trades: GoalTrade[];
  replaySessions: GoalReplaySession[];
  journalEntries: GoalJournalEntry[];
  now?: Date;
};

function periodRange(period: GoalPeriod, now: Date): { start: Date; end: Date } {
  const end = now;
  const start = new Date(now);
  switch (period) {
    case "day":
      start.setHours(0, 0, 0, 0);
      break;
    case "week": {
      const day = (start.getDay() + 6) % 7; // Monday=0
      start.setDate(start.getDate() - day);
      start.setHours(0, 0, 0, 0);
      break;
    }
    case "month":
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    case "quarter": {
      const q = Math.floor(start.getMonth() / 3) * 3;
      start.setMonth(q, 1);
      start.setHours(0, 0, 0, 0);
      break;
    }
    case "year":
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      break;
    case "all_time":
    case "custom":
    default:
      start.setTime(0);
  }
  return { start, end };
}

function inRange(iso: string | null | undefined, r: { start: Date; end: Date }): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= r.start.getTime() && t <= r.end.getTime();
}

function fmt(unit: string, v: number): string {
  if (!Number.isFinite(v)) return "—";
  switch (unit) {
    case "R": return `${v >= 0 ? "+" : ""}${v.toFixed(2)}R`;
    case "%": return `${v.toFixed(1)}%`;
    case "hours": return `${v.toFixed(1)} hrs`;
    case "days": return `${Math.round(v)} days`;
    case "ratio": return v.toFixed(2);
    case "currency": return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
    case "count":
    default: return `${Math.round(v)}`;
  }
}

function pctFor(direction: "up" | "down", current: number, target: number): number {
  if (target <= 0) return 0;
  if (direction === "up") return Math.max(0, Math.min(100, (current / target) * 100));
  // down = cap; 0 usage => 100% "safe", full cap => 0% remaining. We visualise "used".
  return Math.max(0, Math.min(100, (current / target) * 100));
}

function statusFor(direction: "up" | "down", current: number, target: number, kind: GoalKind): GoalStatus {
  if (direction === "up") {
    if (current >= target) return "completed";
    if (current >= target * 0.75) return "on_track";
    if (current >= target * 0.4) return "warning";
    return "missed";
  }
  // caps — the *lower* the better
  if (current <= target * 0.6) return "on_track";
  if (current <= target * 0.9) return "warning";
  if (current <= target) return "warning";
  return "missed";
}

export function computeGoalProgress(goal: GoalRow, inputs: ProgressInputs): GoalProgress {
  const meta = GOAL_META[goal.kind];
  const now = inputs.now ?? new Date();
  const range = periodRange(goal.period, now);
  const target = Number(goal.target_value);

  const rangeTrades = inputs.trades.filter((t) => inRange(t.closed_at ?? t.opened_at, range));

  let current = 0;

  switch (goal.kind) {
    case "max_trades_per_day":
    case "max_trades":
    case "trades_count":
      current = rangeTrades.length;
      break;

    case "daily_r_target":
    case "weekly_r_target":
    case "monthly_r_target": {
      current = rangeTrades.reduce((s, t) => s + (t.rr ?? 0), 0);
      break;
    }
    case "max_daily_loss":
    case "max_weekly_drawdown": {
      const totalR = rangeTrades.reduce((s, t) => s + (t.rr ?? 0), 0);
      current = totalR < 0 ? Math.abs(totalR) : 0;
      break;
    }
    case "max_risk_per_trade": {
      const risks = rangeTrades.map((t) => t.risk_pct ?? 0);
      current = risks.length ? Math.max(...risks) : 0;
      break;
    }
    case "win_rate_target":
    case "min_win_rate": {
      const wins = rangeTrades.filter((t) => (t.rr ?? t.pnl) > 0).length;
      current = rangeTrades.length ? (wins / rangeTrades.length) * 100 : 0;
      break;
    }
    case "profit_factor_target": {
      const gains = rangeTrades.filter((t) => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
      const losses = Math.abs(rangeTrades.filter((t) => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
      current = losses > 0 ? gains / losses : gains > 0 ? gains : 0;
      break;
    }
    case "min_journal_rate": {
      const closed = rangeTrades.length;
      const journaled = rangeTrades.filter((t) => t.has_journal).length;
      current = closed ? (journaled / closed) * 100 : 0;
      break;
    }
    case "consecutive_days": {
      current = streakDays(inputs.trades, now);
      break;
    }
    case "replay_hours": {
      const secs = inputs.replaySessions
        .filter((s) => inRange(s.created_at, range))
        .reduce((s, r) => s + (r.duration_seconds ?? 0), 0);
      current = secs / 3600;
      break;
    }
    case "journal_entries_count": {
      current = inputs.journalEntries.filter((j) => inRange(j.created_at, range)).length;
      break;
    }
    case "net_profit": {
      current = rangeTrades.reduce((s, t) => s + t.pnl, 0);
      break;
    }
    case "max_drawdown": {
      const totalPnl = rangeTrades.reduce((s, t) => s + t.pnl, 0);
      current = totalPnl < 0 ? Math.abs(totalPnl) : 0;
      break;
    }
    case "min_rr": {
      const rrs = rangeTrades.map((t) => t.rr).filter((x): x is number => x != null);
      current = rrs.length ? rrs.reduce((a, b) => a + b, 0) / rrs.length : 0;
      break;
    }
  }

  const pct = pctFor(meta.direction, current, target);
  const status = statusFor(meta.direction, current, target, goal.kind);
  const insight = buildInsight(goal, meta, current, target, status);

  return {
    goal,
    current,
    target,
    pct,
    status,
    insight,
    formattedCurrent: fmt(meta.unit, current),
    formattedTarget: fmt(meta.unit, target),
  };
}

function streakDays(trades: GoalTrade[], now: Date): number {
  const days = new Set<string>();
  for (const t of trades) {
    const iso = t.closed_at ?? t.opened_at;
    if (!iso) continue;
    days.add(new Date(iso).toISOString().slice(0, 10));
  }
  let streak = 0;
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  for (let i = 0; i < 365; i++) {
    const key = cursor.toISOString().slice(0, 10);
    if (days.has(key)) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else if (i === 0) {
      // Streak may still count if user hasn't traded today yet — check yesterday.
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

function buildInsight(
  goal: GoalRow,
  meta: (typeof GOAL_META)[GoalKind],
  current: number,
  target: number,
  status: GoalStatus,
): string {
  const name = goal.name || meta.label;
  if (meta.direction === "down") {
    if (status === "missed") return `Cap exceeded on "${name}". Reset your rules for the next session.`;
    if (status === "warning") return `Approaching your "${name}" limit — trade with care.`;
    return `Great job staying within "${name}".`;
  }
  if (status === "completed") return `${name} reached — target hit for this period.`;
  if (status === "on_track") return `On track to hit "${name}" — keep the routine.`;
  if (status === "warning") return `Behind on "${name}". A focused session can close the gap.`;
  const missing = Math.max(0, target - current);
  return missing > 0 ? `Behind on "${name}". ${fmt(meta.unit, missing)} still to go.` : `Behind on "${name}".`;
}

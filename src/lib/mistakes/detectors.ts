import type { DetectedMistake, MistakeKind, MistakeOccurrence, NormalizedTrade, UserRiskLimits } from "./types";
import { RULES } from "./rules";

/* ==================== Helpers ==================== */

const R_OF = (t: NormalizedTrade): number => (t.rr ?? 0);
const IS_CLOSED = (t: NormalizedTrade) => t.status === "closed";
const IS_WIN = (t: NormalizedTrade) => t.outcome === "win";
const IS_LOSS = (t: NormalizedTrade) => t.outcome === "loss";

function occ(t: NormalizedTrade, costR: number, detail?: string): MistakeOccurrence {
  return {
    trade_id: t.id,
    source: t.source,
    at: t.closed_at ?? t.opened_at ?? new Date().toISOString(),
    cost_r: costR,
    detail,
  };
}

function mean(xs: number[]) { return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0; }
function std(xs: number[]) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / xs.length);
}
function cov(xs: number[]) { const m = mean(xs); return m === 0 ? 0 : std(xs) / Math.abs(m); }
function byDay(t: NormalizedTrade) { return (t.closed_at ?? t.opened_at ?? "").slice(0, 10); }
function groupBy<T>(items: T[], key: (t: T) => string) {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    if (!k) continue;
    (m.get(k) ?? m.set(k, []).get(k)!).push(it);
  }
  return m;
}

/* ==================== Detectors ==================== */

type Detector = (trades: NormalizedTrade[], limits: UserRiskLimits) => MistakeOccurrence[];

const detectors: Record<MistakeKind, Detector> = {
  /* ---------- Risk ---------- */
  risk_above_limit: (trades, l) =>
    trades
      .filter((t) => t.risk_pct != null && t.risk_pct > l.max_risk_per_trade_pct)
      .map((t) => occ(t, Math.min(0, R_OF(t)), `${t.risk_pct?.toFixed(2)}% risk`)),

  inconsistent_size: (trades) => {
    // Bucket by symbol; flag trades sitting in high-CoV symbol buckets.
    const bySym = groupBy(trades.filter((t) => t.lot_size), (t) => t.symbol ?? "");
    const flagged: MistakeOccurrence[] = [];
    for (const [, list] of bySym) {
      if (list.length < 5) continue;
      const sizes = list.map((t) => t.lot_size!);
      if (cov(sizes) < 0.6) continue;
      const m = mean(sizes);
      for (const t of list) {
        if (t.lot_size! > m * 1.75 || t.lot_size! < m * 0.4) {
          flagged.push(occ(t, IS_LOSS(t) ? R_OF(t) : 0, `Lot ${t.lot_size} vs avg ${m.toFixed(2)}`));
        }
      }
    }
    return flagged;
  },

  consecutive_oversized_losses: (trades) => {
    const chrono = [...trades].filter(IS_CLOSED).sort(sortByCloseAsc);
    const out: MistakeOccurrence[] = [];
    let streak: NormalizedTrade[] = [];
    for (const t of chrono) {
      if (IS_LOSS(t) && R_OF(t) <= -1) {
        streak.push(t);
        if (streak.length >= 2) out.push(occ(t, R_OF(t), `${streak.length} in a row`));
      } else {
        streak = [];
      }
    }
    return out;
  },

  daily_loss_limit_breach: (trades, l) => {
    const days = groupBy(trades.filter(IS_CLOSED), byDay);
    const out: MistakeOccurrence[] = [];
    for (const [, list] of days) {
      const chrono = [...list].sort(sortByCloseAsc);
      let cum = 0;
      let breached = false;
      for (const t of chrono) {
        cum += R_OF(t);
        if (breached) out.push(occ(t, R_OF(t), `Trade after ${l.daily_loss_limit_r}R day cap`));
        if (cum <= l.daily_loss_limit_r) breached = true;
      }
    }
    return out;
  },

  /* ---------- Execution ---------- */
  entered_before_confirmation: (trades) =>
    trades
      .filter((t) => hasFlag(t, ["early_entry", "before_confirmation", "entered_early"]) || (t.strategy_id && !t.checklist_ran))
      .map((t) => occ(t, IS_LOSS(t) ? R_OF(t) : 0, "No confirmation")),

  chased_price: (trades) =>
    trades
      .filter((t) => (t.rr_planned != null && t.rr_planned < 1) || hasFlag(t, ["chased_price", "chase"]))
      .map((t) => occ(t, IS_LOSS(t) ? R_OF(t) : 0, "Chased entry")),

  poor_stop_placement: (trades) =>
    trades
      .filter((t) => {
        if (t.entry == null || t.stop_loss == null || t.take_profit == null) return false;
        const stopDist = Math.abs(t.entry - t.stop_loss);
        const tgtDist = Math.abs(t.take_profit - t.entry);
        if (stopDist === 0 || tgtDist === 0) return false;
        const ratio = stopDist / tgtDist;
        return ratio < 0.05 || ratio > 0.5;
      })
      .map((t) => occ(t, IS_LOSS(t) ? R_OF(t) : 0, "Illogical stop distance")),

  poor_rr: (trades) =>
    trades
      .filter((t) => (t.rr_planned != null && t.rr_planned < 1) || (IS_CLOSED(t) && t.rr != null && t.rr < 1 && !IS_WIN(t)))
      .map((t) => occ(t, IS_LOSS(t) ? R_OF(t) : 0, `RR ${(t.rr_planned ?? t.rr ?? 0).toFixed(2)}`)),

  early_exit_winner: (trades) =>
    trades
      .filter((t) => {
        if (!IS_WIN(t)) return false;
        if (t.entry == null || t.take_profit == null || t.exit == null) return false;
        const planned = Math.abs(t.take_profit - t.entry);
        const captured = Math.abs(t.exit - t.entry);
        return planned > 0 && captured / planned < 0.5;
      })
      .map((t) => {
        const planned = Math.abs((t.take_profit ?? 0) - (t.entry ?? 0));
        const captured = Math.abs((t.exit ?? 0) - (t.entry ?? 0));
        const missed = planned > 0 ? Math.max(0, (planned - captured) / planned) * (t.rr_planned ?? 2) : 1;
        return occ(t, -missed, `${Math.round((captured / planned) * 100)}% of target`);
      }),

  let_loser_run: (trades) =>
    trades
      .filter((t) => IS_LOSS(t) && R_OF(t) < -1.5)
      .map((t) => occ(t, R_OF(t) + 1, `${R_OF(t).toFixed(2)}R vs planned -1R`)),

  /* ---------- Psychology ---------- */
  revenge_trade: (trades) => {
    const chrono = [...trades].filter(IS_CLOSED).sort(sortByCloseAsc);
    const out: MistakeOccurrence[] = [];
    for (let i = 1; i < chrono.length; i++) {
      const prev = chrono[i - 1];
      const cur = chrono[i];
      if (!IS_LOSS(prev)) continue;
      const gap = timeGapMinutes(prev.closed_at, cur.opened_at);
      if (gap != null && gap >= 0 && gap < 5) {
        out.push(occ(cur, IS_LOSS(cur) ? R_OF(cur) : 0, `${gap.toFixed(0)}m after a loss`));
      }
    }
    return out;
  },

  overtrading: (trades) => {
    const days = groupBy(trades, byDay);
    const counts = Array.from(days.values()).map((l) => l.length);
    if (counts.length < 5) return [];
    const avg = mean(counts);
    const out: MistakeOccurrence[] = [];
    for (const [, list] of days) {
      if (list.length > Math.max(3, avg * 2)) {
        for (const t of list.slice(Math.ceil(avg))) {
          out.push(occ(t, IS_LOSS(t) ? R_OF(t) : 0, `Day count ${list.length} vs avg ${avg.toFixed(1)}`));
        }
      }
    }
    return out;
  },

  fomo_entry: (trades) =>
    trades
      .filter((t) => hasEmotion(t, ["fomo"]) || hasFlag(t, ["fomo"]))
      .map((t) => occ(t, IS_LOSS(t) ? R_OF(t) : 0, "FOMO tagged")),

  fear_exit: (trades) =>
    trades
      .filter((t) => IS_WIN(t) && hasEmotion(t, ["fear", "anxious", "nervous", "scared"]))
      .map((t) => occ(t, -0.5, "Fear-driven exit")),

  traded_after_max_loss: (trades, l) => {
    const days = groupBy(trades.filter(IS_CLOSED), byDay);
    const out: MistakeOccurrence[] = [];
    for (const [, list] of days) {
      const chrono = [...list].sort(sortByCloseAsc);
      let cum = 0;
      for (const t of chrono) {
        if (cum <= l.daily_loss_limit_r) out.push(occ(t, R_OF(t), "After daily loss cap"));
        cum += R_OF(t);
      }
    }
    return out;
  },

  /* ---------- Discipline ---------- */
  did_not_follow_playbook: (trades) =>
    trades.filter((t) => IS_CLOSED(t) && !t.strategy_id).map((t) => occ(t, IS_LOSS(t) ? R_OF(t) : 0, "No playbook")),

  journal_incomplete: (trades) =>
    trades
      .filter((t) => t.source === "journal")
      .filter((t) => !t.symbol || !t.direction || !t.session)
      .map((t) => occ(t, 0, "Missing key fields")),

  missing_screenshots: (trades) =>
    trades.filter(IS_CLOSED).filter((t) => !t.has_screenshots).map((t) => occ(t, 0, "No screenshot")),

  missing_notes: (trades) =>
    trades.filter(IS_CLOSED).filter((t) => !t.has_notes).map((t) => occ(t, 0, "No notes")),

  ignored_checklist: (trades) =>
    trades.filter((t) => t.strategy_id && !t.checklist_ran).map((t) => occ(t, IS_LOSS(t) ? R_OF(t) : 0, "Checklist skipped")),

  /* ---------- Consistency ---------- */
  random_lot_sizes: (trades) => {
    const bySym = groupBy(trades.filter((t) => t.lot_size != null), (t) => t.symbol ?? "");
    const out: MistakeOccurrence[] = [];
    for (const [, list] of bySym) {
      if (list.length < 4) continue;
      const sizes = list.map((t) => t.lot_size!);
      const min = Math.min(...sizes);
      const max = Math.max(...sizes);
      if (min > 0 && max / min > 3) {
        for (const t of list) out.push(occ(t, 0, `Range ${min}–${max}`));
      }
    }
    return out;
  },

  random_holding_time: (trades) => {
    const bySetup = groupBy(trades.filter((t) => t.duration_seconds && t.duration_seconds > 0), (t) => t.strategy_id ?? t.symbol ?? "");
    const out: MistakeOccurrence[] = [];
    for (const [, list] of bySetup) {
      if (list.length < 5) continue;
      const durs = list.map((t) => t.duration_seconds!);
      if (std(durs) > mean(durs)) for (const t of list) out.push(occ(t, 0, "Erratic hold time"));
    }
    return out;
  },

  random_sessions: (trades) => {
    const closed = trades.filter(IS_CLOSED).filter((t) => t.session);
    if (closed.length < 15) return [];
    const buckets = groupBy(closed, (t) => t.session ?? "");
    const counts = Array.from(buckets.values()).map((v) => v.length);
    if (counts.length < 3) return [];
    const m = mean(counts);
    const c = cov(counts);
    if (c > 0.35) return []; // sessions are already differentiated
    // Uniform distribution ⇒ flag every trade once at aggregate level.
    return [occ(closed[closed.length - 1], 0, `${counts.length} sessions ~equal (avg ${m.toFixed(1)})`)];
  },

  strategy_hopping: (trades) => {
    const closed = trades.filter(IS_CLOSED);
    const bySt = groupBy(closed, (t) => t.strategy_id ?? "");
    const activeSetups = Array.from(bySt.entries()).filter(([id]) => id);
    const small = activeSetups.filter(([, v]) => v.length < 5);
    if (activeSetups.length > 4 && small.length >= 3) {
      return small.flatMap(([, list]) => list.map((t) => occ(t, 0, `Only ${list.length} trades in this playbook`)));
    }
    return [];
  },
};

/* ==================== Utilities used by detectors ==================== */

function sortByCloseAsc(a: NormalizedTrade, b: NormalizedTrade) {
  return new Date(a.closed_at ?? a.opened_at ?? 0).getTime() - new Date(b.closed_at ?? b.opened_at ?? 0).getTime();
}

function timeGapMinutes(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  return (new Date(to).getTime() - new Date(from).getTime()) / 60000;
}

function hasFlag(t: NormalizedTrade, needles: string[]) {
  const bag = t.mistake_flags.map((s) => s.toLowerCase());
  return needles.some((n) => bag.includes(n.toLowerCase()));
}
function hasEmotion(t: NormalizedTrade, needles: string[]) {
  const bag = (t.emotions ?? []).map((s) => s.toLowerCase());
  return needles.some((n) => bag.some((e) => e.includes(n)));
}

/* ==================== Aggregation ==================== */

function trendFor(occurrences: MistakeOccurrence[]): DetectedMistake["trend"] {
  if (occurrences.length < 4) return occurrences.length ? "new" : "stable";
  const sorted = [...occurrences].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  const mid = Math.floor(sorted.length / 2);
  const first = sorted.slice(0, mid).length;
  const last = sorted.slice(mid).length;
  const delta = last - first;
  if (Math.abs(delta) <= 1) return "stable";
  return delta < 0 ? "improving" : "worsening";
}

function severityFor(freq: number, impactR: number): DetectedMistake["severity"] {
  const score = freq + Math.abs(impactR) * 1.5;
  if (score >= 20 || Math.abs(impactR) >= 10) return "high";
  if (score >= 8 || Math.abs(impactR) >= 4) return "medium";
  return "low";
}

export function runDetectors(trades: NormalizedTrade[], limits: UserRiskLimits): DetectedMistake[] {
  const out: DetectedMistake[] = [];
  for (const kind of Object.keys(detectors) as MistakeKind[]) {
    const occurrences = detectors[kind](trades, limits);
    const rule = RULES[kind];
    if (!occurrences.length) {
      out.push({
        kind,
        category: rule.category,
        title: rule.title,
        description: rule.description,
        severity: "low",
        frequency: 0,
        impact_r: 0,
        trend: "stable",
        first_seen: null,
        last_seen: null,
        occurrences: [],
        resolved: true, // no occurrences in this window
      });
      continue;
    }
    const sorted = [...occurrences].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    const impact = sorted.reduce((s, o) => s + o.cost_r, 0);
    out.push({
      kind,
      category: rule.category,
      title: rule.title,
      description: rule.description,
      severity: severityFor(sorted.length, impact),
      frequency: sorted.length,
      impact_r: Math.round(impact * 100) / 100,
      trend: trendFor(sorted),
      first_seen: sorted[0].at,
      last_seen: sorted[sorted.length - 1].at,
      occurrences: sorted,
      resolved: false,
    });
  }
  return out;
}

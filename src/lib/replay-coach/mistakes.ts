/**
 * Deterministic replay mistake detection. Pure function — takes trades +
 * checklist + bookmarks + objectives and returns a list of mistake rows
 * ready to insert into `replay_mistakes`. Zero LLM.
 */
export type MistakeKind =
  | "no_sl"
  | "poor_rm"
  | "moved_sl"
  | "held_loser"
  | "closed_winner_early"
  | "poor_rr"
  | "overtrading"
  | "revenge"
  | "fomo"
  | "ignored_trend"
  | "entered_early"
  | "entered_late"
  | "broke_objective";

export type DetectedMistake = {
  kind: MistakeKind;
  severity: "low" | "med" | "high";
  trade_id: string | null;
  evidence: Record<string, unknown>;
};

type Trade = {
  id: string;
  status: string;
  entry_price: number | null;
  exit_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  risk_pct: number | null;
  rr_realized: number | null;
  rr_planned: number | null;
  pnl: number | null;
  direction: string;
  opened_at: string;
  closed_at: string | null;
};

export function detectReplayMistakes(input: {
  trades: Trade[];
  objectives?: string[];
  symbol?: string;
  timeframe?: string;
}): DetectedMistake[] {
  const { trades } = input;
  const closed = trades.filter((t) => t.status === "closed");
  const out: DetectedMistake[] = [];

  // Session-level: overtrading
  if (trades.length >= 10) {
    out.push({
      kind: "overtrading",
      severity: trades.length >= 15 ? "high" : "med",
      trade_id: null,
      evidence: { count: trades.length },
    });
  }

  // Session-level: revenge / rapid re-entry after loss
  const sorted = [...closed].sort(
    (a, b) => new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime(),
  );
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if ((prev.pnl ?? 0) < 0 && prev.closed_at) {
      const gap =
        (new Date(cur.opened_at).getTime() - new Date(prev.closed_at).getTime()) / 60_000;
      if (gap < 3) {
        out.push({
          kind: "revenge",
          severity: "high",
          trade_id: cur.id,
          evidence: { gap_min: Math.round(gap), after_trade: prev.id },
        });
      }
    }
  }

  // Per-trade rules
  for (const t of closed) {
    if (t.stop_loss == null) {
      out.push({
        kind: "no_sl",
        severity: "high",
        trade_id: t.id,
        evidence: { entry: t.entry_price, exit: t.exit_price },
      });
    }
    if ((t.risk_pct ?? 0) > 2) {
      out.push({
        kind: "poor_rm",
        severity: (t.risk_pct ?? 0) > 5 ? "high" : "med",
        trade_id: t.id,
        evidence: { risk_pct: t.risk_pct },
      });
    }
    const rrRealized = t.rr_realized ?? 0;
    const rrPlanned = t.rr_planned ?? 0;
    if (rrPlanned > 0 && rrPlanned < 1) {
      out.push({
        kind: "poor_rr",
        severity: "med",
        trade_id: t.id,
        evidence: { planned: rrPlanned },
      });
    }
    if ((t.pnl ?? 0) > 0 && rrPlanned >= 1.5 && rrRealized > 0 && rrRealized < 1) {
      out.push({
        kind: "closed_winner_early",
        severity: "med",
        trade_id: t.id,
        evidence: { planned: rrPlanned, realized: rrRealized },
      });
    }
    if ((t.pnl ?? 0) < 0 && t.opened_at && t.closed_at) {
      const held =
        (new Date(t.closed_at).getTime() - new Date(t.opened_at).getTime()) / 60_000;
      if (held > 120 && rrRealized < -1) {
        out.push({
          kind: "held_loser",
          severity: "med",
          trade_id: t.id,
          evidence: { held_min: Math.round(held), rr: rrRealized },
        });
      }
    }
  }

  // Objective breaches — symbol/timeframe drift
  if (input.symbol && closed.length > 0) {
    // stored per-trade in replay_trades.symbol; caller checks upstream
    // (kept here for signature completeness)
  }

  return out;
}

import type { Strategy, StrategyStats } from "./types";

/** Compute per-strategy performance from journal entries linked via strategy_id. */
export function computeStrategyStats(
  strategyId: string,
  entries: Array<{ pnl: number | null; rr: number | null; opened_at: string | null; closed_at: string | null }>,
): StrategyStats {
  const closed = entries.filter((e) => e.pnl != null);
  const trades = closed.length;
  const wins = closed.filter((e) => (e.pnl ?? 0) > 0).length;
  const losses = closed.filter((e) => (e.pnl ?? 0) < 0).length;
  const win_rate = trades ? wins / trades : 0;
  const rrList = closed.map((e) => e.rr ?? 0).filter((v) => v > 0);
  const avg_rr = rrList.length ? rrList.reduce((s, v) => s + v, 0) / rrList.length : 0;
  const gross_profit = closed.reduce((s, e) => s + Math.max(0, e.pnl ?? 0), 0);
  const gross_loss = closed.reduce((s, e) => s + Math.min(0, e.pnl ?? 0), 0);
  const net_pnl = gross_profit + gross_loss;

  const byMonth = new Map<string, number>();
  for (const e of closed) {
    const key = (e.closed_at ?? e.opened_at ?? "").slice(0, 7);
    if (!key) continue;
    byMonth.set(key, (byMonth.get(key) ?? 0) + (e.pnl ?? 0));
  }
  const values = [...byMonth.values()];
  const best_month = values.length ? Math.max(...values) : 0;
  const worst_month = values.length ? Math.min(...values) : 0;

  const holds = closed
    .map((e) => (e.opened_at && e.closed_at ? (new Date(e.closed_at).getTime() - new Date(e.opened_at).getTime()) / 1000 : null))
    .filter((v): v is number => v != null && v >= 0);
  const avg_hold_seconds = holds.length ? holds.reduce((s, v) => s + v, 0) / holds.length : 0;

  return {
    strategy_id: strategyId,
    trades, wins, losses, win_rate, avg_rr,
    gross_profit, gross_loss, net_pnl, best_month, worst_month, avg_hold_seconds,
  };
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 64);
}

export function nextRuleId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Serialize a strategy into a portable JSON export payload. */
export function toExportJSON(s: Strategy, extras: { playbooks?: any[]; checklists?: any[]; examples?: any[] } = {}) {
  return {
    format: "tradershive.strategy.v1",
    exported_at: new Date().toISOString(),
    strategy: {
      name: s.name, description: s.description, category: s.category,
      market: s.market, markets: s.markets, symbols: s.symbols,
      timeframes: s.timeframes, tags: s.tags, difficulty: s.difficulty,
      estimated_timeframe: s.estimated_timeframe, color: s.color, icon: s.icon,
      market_conditions: s.market_conditions,
      entry_rules: s.entry_rules, exit_rules: s.exit_rules,
      risk_rules: s.risk_rules, trade_management: s.trade_management,
      position_sizing: s.position_sizing, notes: s.notes,
    },
    playbooks: extras.playbooks ?? [],
    checklists: extras.checklists ?? [],
    examples: extras.examples ?? [],
  };
}

/** Convert a strategy to a shareable markdown document. */
export function toMarkdown(s: Strategy): string {
  const lines: string[] = [];
  lines.push(`# ${s.name}`);
  if (s.description) lines.push(`\n${s.description}\n`);
  lines.push(`**Category:** ${s.category ?? "—"}  `);
  lines.push(`**Market:** ${s.market ?? "—"}  `);
  lines.push(`**Timeframes:** ${s.timeframes.join(", ") || "—"}  `);
  lines.push(`**Tags:** ${s.tags.join(", ") || "—"}  `);
  lines.push(`**Difficulty:** ${s.difficulty}\n`);
  if (s.market_conditions.length) lines.push(`**Best Conditions:** ${s.market_conditions.join(", ")}\n`);
  lines.push(`## Entry Rules`);
  s.entry_rules.forEach((r) => lines.push(`- ${r.text}`));
  lines.push(`\n## Exit Rules`);
  s.exit_rules.forEach((r) => lines.push(`- ${r.text}`));
  lines.push(`\n## Risk`);
  const rr = s.risk_rules;
  if (rr.max_risk_pct != null) lines.push(`- Max risk per trade: ${rr.max_risk_pct}%`);
  if (rr.min_rr != null) lines.push(`- Minimum R:R: ${rr.min_rr}`);
  if (rr.max_trades_per_day != null) lines.push(`- Max trades / day: ${rr.max_trades_per_day}`);
  if (rr.max_daily_loss_pct != null) lines.push(`- Max daily loss: ${rr.max_daily_loss_pct}%`);
  if (rr.position_sizing) lines.push(`- Position sizing: ${rr.position_sizing}`);
  if (s.notes) lines.push(`\n## Notes\n${s.notes}`);
  return lines.join("\n");
}

type Stats = {
  avg_pnl: number; avg_rr: number; avg_win_rate: number; avg_drawdown: number;
  active_positions: number; trades_closed: number; trades_open: number; win_percentage: number;
} | null;

function money(n: number) {
  return Number(n ?? 0).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export function LiveStatistics({ stats }: { stats: Stats }) {
  const rows = [
    { label: "Average PnL",         value: money(stats?.avg_pnl ?? 0) },
    { label: "Average RR",          value: (Number(stats?.avg_rr ?? 0)).toFixed(2) },
    { label: "Average Win Rate",    value: `${Number(stats?.avg_win_rate ?? 0).toFixed(1)}%` },
    { label: "Average Drawdown",    value: `$${Number(stats?.avg_drawdown ?? 0).toFixed(0)}` },
    { label: "Win Percentage",      value: `${Number(stats?.win_percentage ?? 0).toFixed(1)}%` },
    { label: "Open Positions",      value: String(stats?.active_positions ?? 0) },
    { label: "Trades Closed",       value: String(stats?.trades_closed ?? 0) },
    { label: "Trades Open",         value: String(stats?.trades_open ?? 0) },
  ];
  return (
    <div className="rounded-2xl border border-border/60 bg-card/40">
      <div className="border-b border-border/60 px-4 py-3 text-sm font-semibold">Live statistics</div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 p-4 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between border-b border-border/40 py-1.5 last:border-b-0">
            <dt className="text-muted-foreground">{r.label}</dt>
            <dd className="font-semibold tabular-nums">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Filter } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listReplayTrades } from "@/lib/replay.functions";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  session_id: string;
  symbol: string;
  market: string;
  direction: string;
  entry_price: number | string | null;
  exit_price: number | string | null;
  lot_size: number | string | null;
  rr_realized: number | string | null;
  pnl: number | string | null;
  status: string;
  opened_at: string | null;
  closed_at: string | null;
  replay_sessions?: { title?: string; symbol?: string; market?: string } | null;
};

const RESULTS = ["all", "win", "loss", "open"] as const;
type Result = (typeof RESULTS)[number];

export const Route = createFileRoute("/_authenticated/replay/trades")({
  head: () => ({
    meta: [
      { title: "Replay Trade Review — TradersHIVE Arena" },
      {
        name: "description",
        content:
          "Review every trade taken across your replay sessions. Filter by result, search by symbol, and export for deeper analysis.",
      },
    ],
  }),
  component: TradesPage,
});

function toCsv(rows: Row[]): string {
  const header = [
    "opened_at",
    "closed_at",
    "session",
    "symbol",
    "market",
    "direction",
    "entry_price",
    "exit_price",
    "lot_size",
    "rr_realized",
    "pnl",
    "status",
  ];
  const escape = (v: unknown) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((t) =>
    [
      t.opened_at,
      t.closed_at,
      t.replay_sessions?.title ?? "",
      t.symbol,
      t.market,
      t.direction,
      t.entry_price,
      t.exit_price,
      t.lot_size,
      t.rr_realized,
      t.pnl,
      t.status,
    ]
      .map(escape)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

function TradesPage() {
  const list = useServerFn(listReplayTrades);
  const q = useQuery({ queryKey: ["replay", "trades"], queryFn: () => list() });
  const raw = (q.data ?? []) as Row[];
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<Result>("all");

  const rows = useMemo(() => {
    return raw.filter((t) => {
      if (search && !`${t.symbol} ${t.replay_sessions?.title ?? ""}`.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      if (result === "all") return true;
      if (result === "open") return t.status !== "closed";
      const pnl = Number(t.pnl ?? 0);
      if (result === "win") return t.status === "closed" && pnl > 0;
      if (result === "loss") return t.status === "closed" && pnl < 0;
      return true;
    });
  }, [raw, search, result]);

  const totalPnl = rows.reduce((a, t) => a + Number(t.pnl ?? 0), 0);
  const wins = rows.filter((t) => t.status === "closed" && Number(t.pnl ?? 0) > 0).length;
  const closed = rows.filter((t) => t.status === "closed").length;
  const winRate = closed > 0 ? Math.round((wins / closed) * 100) : 0;

  const download = () => {
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `replay-trades-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Replay Trade Review"
        description="Every trade you've taken inside a replay session — filter, search, and export."
        actions={
          <Button size="sm" variant="outline" onClick={download} disabled={rows.length === 0}>
            <Download className="mr-2 h-3.5 w-3.5" /> Export CSV
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <GlassCard className="p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Trades</div>
          <div className="text-xl font-bold tabular-nums">{rows.length}</div>
        </GlassCard>
        <GlassCard className="p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Closed</div>
          <div className="text-xl font-bold tabular-nums">{closed}</div>
        </GlassCard>
        <GlassCard className="p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Win Rate</div>
          <div className="text-xl font-bold tabular-nums">{winRate}%</div>
        </GlassCard>
        <GlassCard className="p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Net PnL</div>
          <div className={cn("text-xl font-bold tabular-nums", totalPnl >= 0 ? "text-success" : "text-danger")}>
            {totalPnl.toFixed(2)}
          </div>
        </GlassCard>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search symbol or session…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-full max-w-xs text-xs"
        />
        <div className="flex items-center gap-1 rounded-[3px] border border-border/60 bg-background/60 p-0.5">
          <Filter className="ml-1 h-3 w-3 text-muted-foreground" />
          {RESULTS.map((r) => (
            <button
              key={r}
              onClick={() => setResult(r)}
              className={cn(
                "rounded-[3px] px-2 py-1 text-[11px] capitalize transition",
                result === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <GlassCard className="p-0 overflow-x-auto">
        <table className="w-full min-w-[720px] text-xs">
          <thead className="bg-background/40 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Session</th>
              <th className="px-3 py-2 text-left">Symbol</th>
              <th className="px-3 py-2 text-left">Dir</th>
              <th className="px-3 py-2 text-right">Entry</th>
              <th className="px-3 py-2 text-right">Exit</th>
              <th className="px-3 py-2 text-right">Lot</th>
              <th className="px-3 py-2 text-right">RR</th>
              <th className="px-3 py-2 text-right">PnL</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="border-t border-border/40 hover:bg-background/30">
                <td className="px-3 py-2">
                  <Link to="/replay/session" search={{ id: t.session_id } as never} className="text-primary hover:underline">
                    {t.replay_sessions?.title ?? "—"}
                  </Link>
                </td>
                <td className="px-3 py-2">{t.symbol}</td>
                <td className={cn("px-3 py-2 uppercase", t.direction === "long" ? "text-success" : "text-danger")}>
                  {t.direction}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {t.entry_price != null ? Number(t.entry_price).toFixed(4) : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {t.exit_price != null ? Number(t.exit_price).toFixed(4) : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{t.lot_size ?? "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {t.rr_realized != null ? Number(t.rr_realized).toFixed(2) : "—"}
                </td>
                <td className={cn("px-3 py-2 text-right tabular-nums", Number(t.pnl ?? 0) >= 0 ? "text-success" : "text-danger")}>
                  {t.pnl != null ? Number(t.pnl).toFixed(2) : "—"}
                </td>
                <td className="px-3 py-2 capitalize text-muted-foreground">{t.status}</td>
              </tr>
            ))}
            {rows.length === 0 && !q.isPending ? (
              <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">No trades match your filters.</td></tr>
            ) : null}
          </tbody>
        </table>
      </GlassCard>
    </div>
  );
}

import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpDown, Download, Filter, PlaySquare, Search, X } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  stop_loss: number | string | null;
  take_profit: number | string | null;
  lot_size: number | string | null;
  risk_pct: number | string | null;
  rr_planned: number | string | null;
  rr_realized: number | string | null;
  pnl: number | string | null;
  status: string;
  opened_at: string | null;
  closed_at: string | null;
  notes: string | null;
  replay_sessions?: { title?: string; symbol?: string; market?: string } | null;
};

const RESULTS = ["all", "win", "loss", "open"] as const;
type Result = (typeof RESULTS)[number];

type SortKey = "opened_at" | "closed_at" | "symbol" | "pnl" | "rr_realized" | "duration";
type SortDir = "asc" | "desc";

export const Route = createFileRoute("/_authenticated/replay/trades")({
  head: () => ({
    meta: [
      { title: "Trade Review — TradersHIVE Arena" },
      {
        name: "description",
        content:
          "Professional post-trade debriefing. Analyse every backtest trade — filter, sort, tag mistakes, score execution, and export a printable report.",
      },
    ],
  }),
  component: TradesPage,
});

/* ---------------- helpers ---------------- */

function n(v: unknown): number | null {
  if (v == null || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

function fmtPrice(v: number | null, decimals = 4) {
  return v == null ? "—" : v.toFixed(decimals);
}

function fmtDuration(open: string | null, close: string | null): string {
  if (!open) return "—";
  const start = new Date(open).getTime();
  const end = close ? new Date(close).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "—";
  const s = Math.max(0, Math.round((end - start) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86_400) return `${(s / 3600).toFixed(1)}h`;
  return `${(s / 86_400).toFixed(1)}d`;
}

function riskDollars(r: Row): number | null {
  const risk = n(r.risk_pct);
  return risk == null ? null : risk; // exposure in %
}

function rewardDollars(r: Row): number | null {
  const rr = n(r.rr_realized);
  const risk = n(r.risk_pct);
  return rr != null && risk != null ? +(rr * risk).toFixed(2) : null;
}

function gradeFromPnl(r: Row): string {
  const pnl = n(r.pnl) ?? 0;
  const rr = n(r.rr_realized) ?? 0;
  if (r.status !== "closed") return "—";
  if (pnl > 0 && rr >= 2) return "A";
  if (pnl > 0 && rr >= 1) return "B";
  if (pnl > 0) return "C";
  if (pnl === 0) return "D";
  if (rr <= -1.2) return "F";
  return "D";
}

function escapeCsv(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: Row[]): string {
  const header = [
    "opened_at","closed_at","session","symbol","market","direction",
    "entry_price","exit_price","stop_loss","take_profit",
    "lot_size","risk_pct","rr_planned","rr_realized","pnl","status","duration","grade",
  ];
  const lines = rows.map((t) =>
    [
      t.opened_at, t.closed_at, t.replay_sessions?.title ?? "",
      t.symbol, t.market, t.direction,
      t.entry_price, t.exit_price, t.stop_loss, t.take_profit,
      t.lot_size, t.risk_pct, t.rr_planned, t.rr_realized, t.pnl, t.status,
      fmtDuration(t.opened_at, t.closed_at), gradeFromPnl(t),
    ].map(escapeCsv).join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

function download(name: string, data: string, mime: string) {
  const blob = new Blob([data], { type: `${mime};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ---------------- page ---------------- */

function TradesPage() {
  const list = useServerFn(listReplayTrades);
  const q = useQuery({ queryKey: ["replay", "trades"], queryFn: () => list() });
  const raw = (q.data ?? []) as Row[];

  const [search, setSearch] = useState("");
  const [result, setResult] = useState<Result>("all");
  const [dir, setDir] = useState<"all" | "long" | "short">("all");
  const [sortKey, setSortKey] = useState<SortKey>("opened_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const sessions = useMemo(() => {
    const s = new Set<string>();
    raw.forEach((r) => r.replay_sessions?.title && s.add(r.replay_sessions.title));
    return [...s].sort();
  }, [raw]);
  const [session, setSession] = useState<string>("all");

  const rows = useMemo(() => {
    const filtered = raw.filter((t) => {
      if (session !== "all" && t.replay_sessions?.title !== session) return false;
      if (dir !== "all" && t.direction !== dir) return false;
      if (search && !`${t.symbol} ${t.replay_sessions?.title ?? ""} ${t.notes ?? ""}`.toLowerCase().includes(search.toLowerCase())) return false;
      if (result === "all") return true;
      if (result === "open") return t.status !== "closed";
      const pnl = n(t.pnl) ?? 0;
      if (result === "win") return t.status === "closed" && pnl > 0;
      if (result === "loss") return t.status === "closed" && pnl < 0;
      return true;
    });
    filtered.sort((a, b) => {
      const mul = sortDir === "asc" ? 1 : -1;
      let av: number | string = 0, bv: number | string = 0;
      switch (sortKey) {
        case "symbol": av = a.symbol; bv = b.symbol; break;
        case "pnl": av = n(a.pnl) ?? 0; bv = n(b.pnl) ?? 0; break;
        case "rr_realized": av = n(a.rr_realized) ?? 0; bv = n(b.rr_realized) ?? 0; break;
        case "duration":
          av = (a.closed_at ? new Date(a.closed_at).getTime() : Date.now()) - new Date(a.opened_at ?? 0).getTime();
          bv = (b.closed_at ? new Date(b.closed_at).getTime() : Date.now()) - new Date(b.opened_at ?? 0).getTime();
          break;
        case "closed_at": av = a.closed_at ? new Date(a.closed_at).getTime() : 0; bv = b.closed_at ? new Date(b.closed_at).getTime() : 0; break;
        default: av = a.opened_at ? new Date(a.opened_at).getTime() : 0; bv = b.opened_at ? new Date(b.opened_at).getTime() : 0;
      }
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * mul;
      return ((av as number) - (bv as number)) * mul;
    });
    return filtered;
  }, [raw, search, result, dir, session, sortKey, sortDir]);

  const scoped = selected.size > 0 ? rows.filter((r) => selected.has(r.id)) : rows;

  /* summary metrics */
  const closed = scoped.filter((t) => t.status === "closed");
  const wins = closed.filter((t) => (n(t.pnl) ?? 0) > 0);
  const losses = closed.filter((t) => (n(t.pnl) ?? 0) < 0);
  const totalPnl = scoped.reduce((a, t) => a + (n(t.pnl) ?? 0), 0);
  const winRate = closed.length ? Math.round((wins.length / closed.length) * 100) : 0;
  const avgRR = closed.length ? closed.reduce((a, t) => a + (n(t.rr_realized) ?? 0), 0) / closed.length : 0;
  const grossWin = wins.reduce((a, t) => a + (n(t.pnl) ?? 0), 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + (n(t.pnl) ?? 0), 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : wins.length ? Infinity : 0;
  const expectancy = closed.length ? totalPnl / closed.length : 0;
  const largestWin = wins.reduce((m, t) => Math.max(m, n(t.pnl) ?? 0), 0);
  const largestLoss = losses.reduce((m, t) => Math.min(m, n(t.pnl) ?? 0), 0);

  const streak = useMemo(() => {
    let curW = 0, curL = 0, maxW = 0, maxL = 0;
    for (const t of [...closed].sort((a, b) => new Date(a.closed_at ?? 0).getTime() - new Date(b.closed_at ?? 0).getTime())) {
      const pnl = n(t.pnl) ?? 0;
      if (pnl > 0) { curW += 1; curL = 0; maxW = Math.max(maxW, curW); }
      else if (pnl < 0) { curL += 1; curW = 0; maxL = Math.max(maxL, curL); }
    }
    return { maxW, maxL };
  }, [closed]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  };

  const toggleRow = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };
  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  };

  const clearFilters = () => {
    setSearch(""); setResult("all"); setDir("all"); setSession("all");
  };

  const exportCsv = () => download(`trade-review-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(scoped), "text/csv");
  const exportJson = () => download(`trade-review-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(scoped, null, 2), "application/json");
  const printReport = () => window.print();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Trade Review"
        description="Professional post-trade debriefing — filter, sort, score, and export every backtest trade."
        actions={
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" disabled={scoped.length === 0}>
                  <Download className="mr-2 h-3.5 w-3.5" /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={exportCsv}>Export CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={exportJson}>Export JSON</DropdownMenuItem>
                <DropdownMenuItem onClick={printReport}>Printable report</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      {/* Session Summary */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        <Kpi label="Trades" value={String(scoped.length)} />
        <Kpi label="Win Rate" value={`${winRate}%`} tone={winRate >= 55 ? "success" : winRate >= 45 ? "muted" : "danger"} />
        <Kpi label="Avg RR" value={avgRR.toFixed(2)} tone={avgRR >= 1.5 ? "success" : avgRR >= 1 ? "muted" : "danger"} />
        <Kpi label="Profit Factor" value={Number.isFinite(profitFactor) ? profitFactor.toFixed(2) : "∞"} tone={profitFactor >= 1.5 ? "success" : profitFactor >= 1 ? "muted" : "danger"} />
        <Kpi label="Expectancy" value={expectancy.toFixed(2)} tone={expectancy >= 0 ? "success" : "danger"} />
        <Kpi label="Net P/L" value={totalPnl.toFixed(2)} tone={totalPnl >= 0 ? "success" : "danger"} />
        <Kpi label="Largest Win" value={largestWin.toFixed(2)} tone="success" />
        <Kpi label="Largest Loss" value={largestLoss.toFixed(2)} tone="danger" />
        <Kpi label="Win Streak" value={String(streak.maxW)} />
        <Kpi label="Loss Streak" value={String(streak.maxL)} tone={streak.maxL >= 4 ? "danger" : "muted"} />
        <Kpi label="Open" value={String(scoped.filter((t) => t.status !== "closed").length)} tone="muted" />
        <Kpi label="Selected" value={selected.size > 0 ? String(selected.size) : "All"} tone="muted" />
      </div>

      {/* Filters */}
      <GlassCard className="flex flex-wrap items-center gap-2 p-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search symbol, session, or notes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-7 text-xs"
          />
        </div>
        <FilterPills label="Result" options={RESULTS as unknown as string[]} value={result} onChange={(v) => setResult(v as Result)} />
        <FilterPills label="Side" options={["all", "long", "short"]} value={dir} onChange={(v) => setDir(v as "all" | "long" | "short")} />
        {sessions.length > 0 && (
          <select
            value={session}
            onChange={(e) => setSession(e.target.value)}
            className="h-8 rounded-md border border-border/60 bg-background/60 px-2 text-xs"
          >
            <option value="all">All sessions</option>
            {sessions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        {(search || result !== "all" || dir !== "all" || session !== "all") && (
          <Button size="sm" variant="ghost" onClick={clearFilters} className="h-8 text-xs">
            <X className="mr-1 h-3 w-3" /> Clear
          </Button>
        )}
        <div className="ml-auto text-[11px] text-muted-foreground">
          Showing {rows.length} of {raw.length}
        </div>
      </GlassCard>

      {/* Table */}
      <GlassCard className="p-0 overflow-x-auto">
        <table className="w-full min-w-[1180px] text-xs">
          <thead className="bg-background/40 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="w-8 px-2 py-2">
                <Checkbox checked={rows.length > 0 && selected.size === rows.length} onCheckedChange={toggleAll} aria-label="Select all" />
              </th>
              <ThSort label="Opened" k="opened_at" cur={sortKey} dir={sortDir} onClick={toggleSort} />
              <ThSort label="Closed" k="closed_at" cur={sortKey} dir={sortDir} onClick={toggleSort} />
              <ThSort label="Symbol" k="symbol" cur={sortKey} dir={sortDir} onClick={toggleSort} />
              <th className="px-3 py-2 text-left">Dir</th>
              <th className="px-3 py-2 text-right">Entry</th>
              <th className="px-3 py-2 text-right">Exit</th>
              <th className="px-3 py-2 text-right">SL</th>
              <th className="px-3 py-2 text-right">TP</th>
              <th className="px-3 py-2 text-right">Risk %</th>
              <th className="px-3 py-2 text-right">Reward</th>
              <ThSort label="RR" k="rr_realized" cur={sortKey} dir={sortDir} onClick={toggleSort} className="text-right" />
              <ThSort label="P/L" k="pnl" cur={sortKey} dir={sortDir} onClick={toggleSort} className="text-right" />
              <ThSort label="Duration" k="duration" cur={sortKey} dir={sortDir} onClick={toggleSort} className="text-right" />
              <th className="px-3 py-2 text-left">Strategy</th>
              <th className="px-3 py-2 text-center">Grade</th>
              <th className="px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const pnl = n(t.pnl) ?? 0;
              const rr = n(t.rr_realized);
              const grade = gradeFromPnl(t);
              return (
                <tr
                  key={t.id}
                  className={cn(
                    "border-t border-border/40 transition-colors hover:bg-background/30",
                    selected.has(t.id) && "bg-primary/5",
                  )}
                >
                  <td className="px-2 py-2">
                    <Checkbox checked={selected.has(t.id)} onCheckedChange={() => toggleRow(t.id)} aria-label={`Select ${t.symbol}`} />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{t.opened_at ? new Date(t.opened_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{t.closed_at ? new Date(t.closed_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                  <td className="px-3 py-2 font-mono font-semibold">{t.symbol}</td>
                  <td className={cn("px-3 py-2 uppercase font-semibold", t.direction === "long" ? "text-success" : "text-danger")}>{t.direction}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtPrice(n(t.entry_price))}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtPrice(n(t.exit_price))}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmtPrice(n(t.stop_loss))}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmtPrice(n(t.take_profit))}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{riskDollars(t) != null ? `${riskDollars(t)!.toFixed(2)}%` : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{rewardDollars(t) != null ? rewardDollars(t)!.toFixed(2) : "—"}</td>
                  <td className={cn("px-3 py-2 text-right tabular-nums font-semibold", rr != null && rr >= 1 ? "text-success" : rr != null && rr < 0 ? "text-danger" : "")}>
                    {rr != null ? rr.toFixed(2) : "—"}
                  </td>
                  <td className={cn("px-3 py-2 text-right tabular-nums font-semibold", pnl >= 0 ? "text-success" : "text-danger")}>
                    {t.pnl != null ? `${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmtDuration(t.opened_at, t.closed_at)}</td>
                  <td className="px-3 py-2 truncate max-w-[140px] text-muted-foreground">
                    <Link to="/replay/session" search={{ id: t.session_id } as never} className="text-primary hover:underline">
                      {t.replay_sessions?.title ?? "—"}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={cn(
                      "inline-flex h-5 min-w-5 items-center justify-center rounded px-1.5 text-[10px] font-bold",
                      grade === "A" && "bg-success/15 text-success",
                      grade === "B" && "bg-primary/15 text-primary",
                      grade === "C" && "bg-warning/15 text-warning",
                      (grade === "D" || grade === "F") && "bg-danger/15 text-danger",
                      grade === "—" && "text-muted-foreground",
                    )}>
                      {grade}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button asChild size="sm" variant="ghost" className="h-7 px-2">
                      <Link to="/trades/$tradeId" params={{ tradeId: t.id }} search={{ source: "replay" } as never}>
                        <PlaySquare className="mr-1 h-3 w-3" /> Review
                      </Link>
                    </Button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && !q.isPending ? (
              <tr>
                <td colSpan={17} className="p-10 text-center">
                  <div className="mx-auto flex max-w-sm flex-col items-center gap-2 text-muted-foreground">
                    <Filter className="h-6 w-6 opacity-50" />
                    <div className="text-sm font-medium">No trades match your filters</div>
                    <div className="text-xs">Try clearing filters, or run a backtest to generate trades.</div>
                    <Button size="sm" variant="outline" onClick={clearFilters}>Clear filters</Button>
                  </div>
                </td>
              </tr>
            ) : null}
            {q.isPending ? (
              <tr>
                <td colSpan={17} className="p-6 text-center text-muted-foreground">Loading trades…</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </GlassCard>
    </div>
  );
}

function Kpi({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "success" | "danger" | "muted" }) {
  return (
    <GlassCard className="p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn(
        "text-lg font-bold tabular-nums",
        tone === "success" && "text-success",
        tone === "danger" && "text-danger",
        tone === "muted" && "text-muted-foreground",
      )}>{value}</div>
    </GlassCard>
  );
}

function FilterPills({ label, options, value, onChange }: { label: string; options: readonly string[] | string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-md border border-border/60 bg-background/60 p-0.5">
      <span className="ml-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      {options.map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          className={cn(
            "rounded px-2 py-1 text-[11px] capitalize transition",
            value === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

function ThSort({ label, k, cur, dir, onClick, className }: { label: string; k: SortKey; cur: SortKey; dir: SortDir; onClick: (k: SortKey) => void; className?: string }) {
  const active = cur === k;
  return (
    <th className={cn("px-3 py-2 text-left", className)}>
      <button
        onClick={() => onClick(k)}
        className={cn("inline-flex items-center gap-1 hover:text-foreground transition", active && "text-foreground")}
      >
        {label}
        <ArrowUpDown className={cn("h-3 w-3 opacity-60", active && "opacity-100", active && dir === "asc" && "rotate-180")} />
      </button>
    </th>
  );
}

// re-export unused symbols to satisfy tree-shaking clarity
void Badge;

import { useMemo, useState } from "react";
import { ArrowUpDown } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useStatistics } from "./context";
import { groupBy, type GroupStats } from "@/lib/statistics/calculations";
import { fmtCurrency, fmtNumber, fmtPercent } from "@/lib/statistics/format";
import { SESSION_LABEL } from "@/lib/statistics/session";
import { cn } from "@/lib/utils";

type SortKey = keyof Pick<GroupStats, "trades" | "wins" | "losses" | "winRate" | "netProfit" | "avgRR" | "bestTrade" | "worstTrade">;

function useGroupTable(rows: GroupStats[]) {
  const [sortBy, setSortBy] = useState<SortKey>("netProfit");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const sorted = useMemo(() => {
    return rows.slice().sort((a, b) => {
      const av = a[sortBy] as number;
      const bv = b[sortBy] as number;
      return dir === "asc" ? av - bv : bv - av;
    });
  }, [rows, sortBy, dir]);
  const toggle = (k: SortKey) => {
    if (sortBy === k) setDir(dir === "asc" ? "desc" : "asc");
    else { setSortBy(k); setDir("desc"); }
  };
  return { sorted, sortBy, dir, toggle };
}

function ThSort({ label, k, active, dir, onClick, align = "left" }: { label: string; k: SortKey; active: boolean; dir: "asc" | "desc"; onClick: (k: SortKey) => void; align?: "left" | "right" }) {
  return (
    <TableHead className={align === "right" ? "text-right" : ""}>
      <button
        onClick={() => onClick(k)}
        className={cn("inline-flex items-center gap-1 text-[10px] uppercase tracking-wider hover:text-foreground", active ? "text-foreground" : "text-muted-foreground")}
      >
        {label}
        <ArrowUpDown className={cn("h-3 w-3", active && dir === "asc" && "rotate-180 transition")} />
      </button>
    </TableHead>
  );
}

function StatsTable({ title, subtitle, rows, keyLabel = "Group", transform }: { title: string; subtitle?: string; rows: GroupStats[]; keyLabel?: string; transform?: (k: string) => string }) {
  const { sorted, sortBy, dir, toggle } = useGroupTable(rows);
  return (
    <GlassCard className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{title}</div>
          {subtitle ? <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div> : null}
        </div>
        <Badge variant="outline">{rows.length} rows</Badge>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[10px] uppercase tracking-wider">{keyLabel}</TableHead>
              <ThSort label="Trades" k="trades" active={sortBy==="trades"} dir={dir} onClick={toggle} align="right" />
              <ThSort label="Wins" k="wins" active={sortBy==="wins"} dir={dir} onClick={toggle} align="right" />
              <ThSort label="Losses" k="losses" active={sortBy==="losses"} dir={dir} onClick={toggle} align="right" />
              <ThSort label="Win rate" k="winRate" active={sortBy==="winRate"} dir={dir} onClick={toggle} align="right" />
              <ThSort label="Net P&L" k="netProfit" active={sortBy==="netProfit"} dir={dir} onClick={toggle} align="right" />
              <ThSort label="Avg RR" k="avgRR" active={sortBy==="avgRR"} dir={dir} onClick={toggle} align="right" />
              <ThSort label="Best" k="bestTrade" active={sortBy==="bestTrade"} dir={dir} onClick={toggle} align="right" />
              <ThSort label="Worst" k="worstTrade" active={sortBy==="worstTrade"} dir={dir} onClick={toggle} align="right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center text-xs text-muted-foreground py-8">No data</TableCell></TableRow>
            ) : sorted.map((r) => (
              <TableRow key={r.key}>
                <TableCell className="font-medium">{transform ? transform(r.key) : r.key}</TableCell>
                <TableCell className="text-right tabular-nums">{r.trades}</TableCell>
                <TableCell className="text-right tabular-nums text-emerald-400">{r.wins}</TableCell>
                <TableCell className="text-right tabular-nums text-rose-400">{r.losses}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtPercent(r.winRate)}</TableCell>
                <TableCell className={cn("text-right tabular-nums font-semibold", r.netProfit >= 0 ? "text-emerald-400" : "text-rose-400")}>{fmtCurrency(r.netProfit)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtNumber(r.avgRR)}R</TableCell>
                <TableCell className="text-right tabular-nums text-emerald-400">{fmtCurrency(r.bestTrade)}</TableCell>
                <TableCell className="text-right tabular-nums text-rose-400">{fmtCurrency(r.worstTrade)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </GlassCard>
  );
}

export function PairAnalysisTable() {
  const { filtered } = useStatistics();
  const rows = useMemo(() => groupBy(filtered, (t) => t.symbol), [filtered]);
  return <StatsTable title="Pair analysis" subtitle="Grouped by traded symbol" rows={rows} keyLabel="Pair" />;
}

export function SetupAnalysisTable() {
  const { filtered } = useStatistics();
  const rows = useMemo(() => groupBy(filtered, (t) => t.setup ?? null), [filtered]);
  return <StatsTable title="Setup analysis" subtitle="Grouped by journal setup" rows={rows} keyLabel="Setup" />;
}

export function StrategyAnalysisTable() {
  const { filtered } = useStatistics();
  const rows = useMemo(() => groupBy(filtered, (t) => t.strategy ?? null), [filtered]);
  return <StatsTable title="Strategy analysis" rows={rows} keyLabel="Strategy" />;
}

export function SessionAnalysisTable() {
  const { filtered } = useStatistics();
  const rows = useMemo(() => groupBy(filtered, (t) => t.session ?? null), [filtered]);
  return <StatsTable title="Session analysis" rows={rows} keyLabel="Session" transform={(k) => SESSION_LABEL[k] ?? k} />;
}

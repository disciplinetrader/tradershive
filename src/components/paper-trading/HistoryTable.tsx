import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Filter, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { listTrades } from "@/lib/paper-trading.functions";
import { formatCurrency, formatNumber } from "@/lib/paper-trading/calculations";
import { findSymbol } from "@/lib/paper-trading/symbols";
import { usePaper } from "./context";
import { cn } from "@/lib/utils";
import { ShareToCommunityButton } from "@/components/sharing/ShareToCommunityButton";
import { useWorkspacePrefs, type BlotterSort } from "@/hooks/use-workspace-prefs";
import { SidePill, SkeletonRows, SortHeader, signed, useRowKeyNav } from "@/components/trading/blotter-shared";

type Closed = {
  id: string; symbol: string; market: string; direction: "long"|"short";
  entry_price: number; exit_price: number|null; rr_realized: number|null;
  pnl: number|null; status: string; opened_at: string; closed_at: string|null;
  lot_size?: number;
};

export type HistoryPreset = {
  outcome?: "win" | "loss";
  range?: "today" | "week";
};

export function HistoryTable({ preset }: { preset?: HistoryPreset } = {}) {
  const { accountId, account } = usePaper();
  const fetch = useServerFn(listTrades);
  const { prefs, update } = useWorkspacePrefs();

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["paper", "trades", accountId, "closed"],
    queryFn: () => fetch({ data: { account_id: accountId!, status: "closed", limit: 500 } }) as unknown as Promise<Closed[]>,
    enabled: !!accountId,
    // Keep prior rows visible on background failure — never clear the table.
    placeholderData: (prev) => prev,
  });

  const [q, setQ] = useState("");
  const [dir, setDir] = useState<"all" | "long" | "short">("all");

  const now = Date.now();
  const dayMs = 86_400_000;

  const rows = useMemo(() => {
    const list = data ?? [];
    const filtered = list.filter((r) => {
      if (q && !r.symbol.toLowerCase().includes(q.toLowerCase())) return false;
      if (dir !== "all" && r.direction !== dir) return false;
      if (preset?.outcome === "win" && !((r.pnl ?? 0) > 0)) return false;
      if (preset?.outcome === "loss" && !((r.pnl ?? 0) < 0)) return false;
      if (preset?.range && r.closed_at) {
        const age = now - new Date(r.closed_at).getTime();
        if (preset.range === "today" && age > dayMs) return false;
        if (preset.range === "week" && age > 7 * dayMs) return false;
      }
      return true;
    });
    return sortRows(filtered, prefs.blotterSortClosed);
  }, [data, q, dir, preset, prefs.blotterSortClosed, now]);

  const setSort = (s: BlotterSort) => update("blotterSortClosed", s);
  const rowKey = useRowKeyNav();

  const exportCsv = () => {
    const header = ["Opened","Closed","Symbol","Direction","Entry","Exit","RR","PnL"];
    const lines = rows.map((r) => [
      r.opened_at, r.closed_at ?? "", r.symbol, r.direction,
      r.entry_price, r.exit_price ?? "", r.rr_realized ?? "", r.pnl ?? "",
    ].join(","));
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `trades-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const emptyCopy = emptyStateFor(preset);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search symbol" className="h-8 pl-7" />
        </div>
        <Select value={dir} onValueChange={(v: "all"|"long"|"short") => setDir(v)}>
          <SelectTrigger className="h-8 w-32"><Filter className="mr-1 h-3.5 w-3.5" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sides</SelectItem>
            <SelectItem value="long">Long</SelectItem>
            <SelectItem value="short">Short</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={exportCsv}><Download className="mr-1.5 h-3.5 w-3.5" /> CSV</Button>
        {isError && (
          <span className="ml-auto flex items-center gap-2 text-[11px] text-warning">
            Unable to refresh
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => refetch()} disabled={isRefetching}>Retry</Button>
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHeader label="Closed" sortKey="time" state={prefs.blotterSortClosed} onChange={setSort} />
              <SortHeader label="Pair" sortKey="symbol" state={prefs.blotterSortClosed} onChange={setSort} />
              <SortHeader label="Side" sortKey="status" state={prefs.blotterSortClosed} onChange={setSort} />
              <SortHeader label="Entry" sortKey="size" state={prefs.blotterSortClosed} onChange={setSort} align="right" />
              <SortHeader label="Exit" sortKey="size" state={prefs.blotterSortClosed} onChange={setSort} align="right" />
              <SortHeader label="RR" sortKey="size" state={prefs.blotterSortClosed} onChange={setSort} align="right" />
              <SortHeader label="P/L" sortKey="pnl" state={prefs.blotterSortClosed} onChange={setSort} align="right" />
              <th className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <SkeletonRows rows={5} cols={8} />
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="p-0">
                  <EmptyState className="py-8" title={emptyCopy.title} description={emptyCopy.description} />
                </TableCell>
              </TableRow>
            ) : rows.map((r) => {
              const sym = findSymbol(r.symbol);
              const pnl = Number(r.pnl ?? 0);
              return (
                <TableRow key={r.id} tabIndex={0} onKeyDown={rowKey} className="focus-visible:bg-muted/50 focus-visible:outline-none">
                  <TableCell className="whitespace-nowrap py-1.5 text-xs text-muted-foreground">
                    {r.closed_at ? new Date(r.closed_at).toLocaleString() : "—"}
                  </TableCell>
                  <TableCell className="py-1.5 font-semibold">{r.symbol}</TableCell>
                  <TableCell className="py-1.5"><SidePill side={r.direction} /></TableCell>
                  <TableCell className="py-1.5 text-right font-mono tabular-nums">{formatNumber(Number(r.entry_price), sym?.decimals ?? 2)}</TableCell>
                  <TableCell className="py-1.5 text-right font-mono tabular-nums">{r.exit_price != null ? formatNumber(Number(r.exit_price), sym?.decimals ?? 2) : "—"}</TableCell>
                  <TableCell className={cn("py-1.5 text-right font-mono tabular-nums", (r.rr_realized ?? 0) >= 0 ? "text-success" : "text-danger")}>
                    {r.rr_realized != null ? `${Number(r.rr_realized).toFixed(2)}R` : "—"}
                  </TableCell>
                  <TableCell className={cn("py-1.5 text-right font-mono tabular-nums font-semibold", pnl >= 0 ? "text-success" : "text-danger")}>
                    {signed(pnl)}{formatCurrency(Math.abs(pnl), account?.currency)}
                  </TableCell>
                  <TableCell className="py-1.5 text-right">
                    <ShareToCommunityButton sourceType="trading_workspace" sourceId={r.id} iconOnly variant="ghost" size="sm" />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function emptyStateFor(preset?: HistoryPreset) {
  if (preset?.outcome === "win") return { title: "No winning trades yet", description: "Winning trades will show up here as you close positions in profit." };
  if (preset?.outcome === "loss") return { title: "No losing trades", description: "Losses will appear here — review them in the AI Coach to spot patterns." };
  if (preset?.range === "today") return { title: "Nothing closed today", description: "Trades closed today will appear here." };
  if (preset?.range === "week") return { title: "Nothing closed this week", description: "Trades closed in the past 7 days will appear here." };
  return { title: "No completed trades yet", description: "Close a position to build your history and analytics." };
}

function sortRows(rows: Closed[], s: BlotterSort): Closed[] {
  const mul = s.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    switch (s.key) {
      case "symbol": return a.symbol.localeCompare(b.symbol) * mul;
      case "pnl":    return ((Number(a.pnl) || 0) - (Number(b.pnl) || 0)) * mul;
      case "size":   return ((Number(a.lot_size) || 0) - (Number(b.lot_size) || 0)) * mul;
      case "status": return a.direction.localeCompare(b.direction) * mul;
      case "time":
      default: {
        const ta = a.closed_at ? new Date(a.closed_at).getTime() : 0;
        const tb = b.closed_at ? new Date(b.closed_at).getTime() : 0;
        return (ta - tb) * mul;
      }
    }
  });
}

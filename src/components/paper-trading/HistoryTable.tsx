import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Filter, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { listTrades } from "@/lib/paper-trading.functions";
import { formatCurrency, formatNumber } from "@/lib/paper-trading/calculations";
import { findSymbol } from "@/lib/paper-trading/symbols";
import { usePaper } from "./context";
import { cn } from "@/lib/utils";

type Closed = {
  id: string; symbol: string; market: string; direction: "long"|"short";
  entry_price: number; exit_price: number|null; rr_realized: number|null;
  pnl: number|null; status: string; opened_at: string; closed_at: string|null;
};

export function HistoryTable() {
  const { accountId, account } = usePaper();
  const fetch = useServerFn(listTrades);

  const { data } = useQuery({
    queryKey: ["paper", "trades", accountId, "closed"],
    queryFn: () => fetch({ data: { account_id: accountId!, status: "closed", limit: 500 } }) as unknown as Promise<Closed[]>,
    enabled: !!accountId,
  });

  const [q, setQ] = useState("");
  const [dir, setDir] = useState<"all" | "long" | "short">("all");
  const [outcome, setOutcome] = useState<"all" | "win" | "loss">("all");

  const rows = useMemo(() => {
    const list = data ?? [];
    return list.filter((r) => {
      if (q && !r.symbol.toLowerCase().includes(q.toLowerCase())) return false;
      if (dir !== "all" && r.direction !== dir) return false;
      if (outcome === "win" && !((r.pnl ?? 0) > 0)) return false;
      if (outcome === "loss" && !((r.pnl ?? 0) < 0)) return false;
      return true;
    });
  }, [data, q, dir, outcome]);

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
        <Select value={outcome} onValueChange={(v: "all"|"win"|"loss") => setOutcome(v)}>
          <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All outcomes</SelectItem>
            <SelectItem value="win">Wins</SelectItem>
            <SelectItem value="loss">Losses</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={exportCsv}><Download className="mr-1.5 h-3.5 w-3.5" /> CSV</Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState className="py-10" title="No closed trades yet" description="Close a position to build your history and analytics." />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Closed</TableHead>
                <TableHead>Pair</TableHead>
                <TableHead>Side</TableHead>
                <TableHead className="text-right">Entry</TableHead>
                <TableHead className="text-right">Exit</TableHead>
                <TableHead className="text-right">RR</TableHead>
                <TableHead className="text-right">P/L</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const sym = findSymbol(r.symbol);
                const pnl = Number(r.pnl ?? 0);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {r.closed_at ? new Date(r.closed_at).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="font-semibold">{r.symbol}</TableCell>
                    <TableCell>
                      <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                        r.direction === "long" ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300")}>
                        {r.direction}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatNumber(Number(r.entry_price), sym?.decimals ?? 2)}</TableCell>
                    <TableCell className="text-right font-mono">{r.exit_price != null ? formatNumber(Number(r.exit_price), sym?.decimals ?? 2) : "—"}</TableCell>
                    <TableCell className={cn("text-right font-mono", (r.rr_realized ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400")}>
                      {r.rr_realized != null ? `${Number(r.rr_realized).toFixed(2)}R` : "—"}
                    </TableCell>
                    <TableCell className={cn("text-right font-mono font-semibold", pnl >= 0 ? "text-emerald-400" : "text-rose-400")}>
                      {pnl >= 0 ? "+" : ""}{formatCurrency(pnl, account?.currency)}
                    </TableCell>
                    <TableCell className="text-right">
                      <ShareToCommunityButton sourceType="trading_workspace" sourceId={r.id} iconOnly variant="ghost" size="sm" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

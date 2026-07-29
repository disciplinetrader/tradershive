import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { ArrowDownRight, ArrowUpRight, BookOpen, LineChart, PlayCircle, Search, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDashboardOverview } from "@/lib/dashboard.functions";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 5;
type Status = "all" | "win" | "loss" | "breakeven";

export function RecentTrades() {
  const fetch = useServerFn(getDashboardOverview);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard_overview"],
    queryFn: () => fetch(),
    staleTime: 30_000,
  });

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const [page, setPage] = useState(0);

  const trades = data?.recentTrades ?? [];
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return trades.filter(
      (t) => (status === "all" || t.status === status) && (!term || t.pair.toLowerCase().includes(term)),
    );
  }, [trades, q, status]);

  if (isLoading) return <Skeleton className="h-72 w-full rounded-2xl" />;

  if (trades.length === 0) {
    return (
      <div className="space-y-3">
        <EmptyState
          icon={LineChart}
          title="No trades yet"
          description="Open the paper trading terminal to execute your first trade."
        />
        <div className="flex justify-center">
          <Button asChild className="gradient-primary text-primary-foreground">
            <Link to="/trading">Start trading</Link>
          </Button>
        </div>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const rows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative sm:min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Search pair" className="pl-9" aria-label="Search recent trades" />
        </div>
        <Select value={status} onValueChange={(v) => { setStatus(v as Status); setPage(0); }}>
          <SelectTrigger className="w-full sm:w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="win">Wins</SelectItem>
            <SelectItem value="loss">Losses</SelectItem>
            <SelectItem value="breakeven">Breakeven</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          compact
          icon={Search}
          title="No trades match your filters"
          description="Try clearing the search or switching status back to All."
          action={{ label: "Clear filters", onClick: () => { setQ(""); setStatus("all"); setPage(0); } }}
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border/40">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pair</TableHead>
                <TableHead>Dir</TableHead>
                <TableHead className="text-right">Entry</TableHead>
                <TableHead className="text-right">Exit</TableHead>
                <TableHead className="text-right">RR</TableHead>
                <TableHead className="text-right">P/L</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.pair}</TableCell>
                  <TableCell>
                    <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium", t.direction === "long" ? "bg-primary/10 text-primary" : "bg-danger/10 text-danger")}>
                      {t.direction === "long" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                      {t.direction}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{t.entry}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{t.exit ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{t.rr.toFixed(1)}R</TableCell>
                  <TableCell className={cn("text-right font-mono tabular-nums font-medium", t.pnl > 0 && "text-primary", t.pnl < 0 && "text-danger")}>
                    {t.pnl >= 0 ? "+" : ""}{t.pnl.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{t.duration}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("capitalize", t.status === "win" && "border-primary/30 bg-primary/10 text-primary", t.status === "loss" && "border-danger/30 bg-danger/10 text-danger")}>
                      {t.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="icon" variant="ghost" className="h-7 w-7" aria-label="Open journal">
                      <Link to="/journal"><BookOpen className="h-3.5 w-3.5" /></Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>Showing {rows.length} of {filtered.length}</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={safePage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Prev</Button>
          <span className="font-mono">{safePage + 1} / {totalPages}</span>
          <Button size="sm" variant="outline" disabled={safePage >= totalPages - 1} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}>Next</Button>
        </div>
      </div>
    </div>
  );
}

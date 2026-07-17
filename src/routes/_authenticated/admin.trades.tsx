import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAdminTrades, softDeleteTrade } from "@/lib/admin.functions";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadBlob, toCSV } from "@/lib/admin/format";
import { toast } from "sonner";
import { RotateCcw, Trash2, Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/trades")({
  component: AdminTrades,
});

function AdminTrades() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAdminTrades);
  const delFn = useServerFn(softDeleteTrade);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "open" | "closed" | "deleted">("all");
  const [page, setPage] = useState(1);

  const q = useQuery({
    queryKey: ["admin-trades", search, status, page],
    queryFn: () => listFn({ data: { search: search || null, status, page, pageSize: 25 } }),
  });

  const mut = useMutation({
    mutationFn: (v: { id: string; restore: boolean }) => delFn({ data: { tradeId: v.id, restore: v.restore } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-trades"] }); toast.success("Updated"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <div className="space-y-4">
      <GlassCard className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Input placeholder="Search symbol…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <Select value={status} onValueChange={(v: any) => setStatus(v)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
              <SelectItem value="deleted">Deleted</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">{q.data?.total ?? 0} trades</span>
          <div className="ml-auto">
            <Button size="sm" variant="outline" onClick={() => {
              const rows = (q.data?.rows ?? []).map((r: any) => ({
                id: r.id, user: r.profiles?.username, symbol: r.symbol, direction: r.direction,
                pnl: r.pnl, rr: r.rr, status: r.status, opened_at: r.opened_at, closed_at: r.closed_at,
              }));
              downloadBlob(toCSV(rows), `trades-${Date.now()}.csv`);
            }}><Download className="mr-1 h-3.5 w-3.5" /> Export</Button>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-border/60 bg-surface/40 text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="p-3 text-left">Trader</th>
                <th className="p-3 text-left">Symbol</th>
                <th className="p-3 text-left">Dir</th>
                <th className="p-3 text-right">PnL</th>
                <th className="p-3 text-right">RR</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Opened</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {q.isLoading
                ? Array.from({ length: 6 }).map((_, i) => <tr key={i}><td colSpan={8} className="p-2"><Skeleton className="h-8 w-full" /></td></tr>)
                : (q.data?.rows ?? []).map((t: any) => (
                    <tr key={t.id} className="border-b border-border/40 hover:bg-surface/50">
                      <td className="p-3 text-xs">{t.profiles?.username ?? "—"}</td>
                      <td className="p-3 font-semibold">{t.symbol}</td>
                      <td className="p-3">
                        <Badge variant="outline" className={t.direction === "long" ? "text-emerald-400" : "text-rose-400"}>{t.direction}</Badge>
                      </td>
                      <td className={"p-3 text-right font-mono " + ((t.pnl ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400")}>
                        {(t.pnl ?? 0).toFixed(2)}
                      </td>
                      <td className="p-3 text-right font-mono">{t.rr?.toFixed?.(2) ?? "—"}</td>
                      <td className="p-3"><Badge variant="outline">{t.status}</Badge></td>
                      <td className="p-3 text-xs text-muted-foreground">{t.opened_at ? new Date(t.opened_at).toLocaleString() : "—"}</td>
                      <td className="p-3 text-right">
                        {t.deleted_at ? (
                          <Button size="sm" variant="outline" onClick={() => mut.mutate({ id: t.id, restore: true })}><RotateCcw className="h-3.5 w-3.5" /></Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => mut.mutate({ id: t.id, restore: false })}><Trash2 className="h-3.5 w-3.5" /></Button>
                        )}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-border/60 p-3 text-xs">
          <span>Page {page}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</Button>
            <Button size="sm" variant="outline" disabled={(q.data?.rows?.length ?? 0) < 25} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

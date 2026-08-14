import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { cancelOrder, listOrders } from "@/lib/paper-trading.functions";
import { formatNumber } from "@/lib/paper-trading/calculations";
import { findSymbol } from "@/lib/paper-trading/symbols";
import { usePaper } from "./context";
import { cn } from "@/lib/utils";
import { useWorkspacePrefs, type BlotterSort } from "@/hooks/use-workspace-prefs";
import { ACTIONS_CELL, SidePill, SkeletonRows, SortHeader, StatusPill, useRowKeyNav } from "@/components/trading/blotter-shared";

type Order = {
  id: string; symbol: string; direction: "long"|"short"; order_type: string;
  status: string; lot_size: number; trigger_price: number; stop_loss: number|null;
  take_profit: number|null; created_at: string;
};

export function OrdersTable() {
  const qc = useQueryClient();
  const { accountId } = usePaper();
  const fetch = useServerFn(listOrders);
  const cancel = useServerFn(cancelOrder);
  const { prefs, update } = useWorkspacePrefs();

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["paper", "orders", accountId],
    queryFn: () => fetch({ data: { account_id: accountId! } }) as unknown as Promise<Order[]>,
    enabled: !!accountId,
    placeholderData: (prev) => prev,
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => cancel({ data: { id } }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["paper", "orders", accountId] });
      const prev = qc.getQueryData<Order[]>(["paper", "orders", accountId]);
      qc.setQueryData<Order[]>(["paper", "orders", accountId], (rows) => rows?.filter((r) => r.id !== id) ?? []);
      return { prev };
    },
    onSuccess: () => { toast.success("Order cancelled"); qc.invalidateQueries({ queryKey: ["paper", "orders"] }); },
    onError: (e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(["paper", "orders", accountId], ctx.prev);
      toast.error((e as Error).message);
    },
  });

  const rows = useMemo(() => sortOrders(data ?? [], prefs.blotterSortOpen), [data, prefs.blotterSortOpen]);
  const setSort = (s: BlotterSort) => update("blotterSortOpen", s);
  const rowKey = useRowKeyNav();

  return (
    <div className="overflow-x-auto">
      {isError && (
        <div className="mb-2 flex items-center justify-end gap-2 text-[11px] text-warning">
          Unable to refresh
          <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => refetch()} disabled={isRefetching}>Retry</Button>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <SortHeader label="Placed" sortKey="time" state={prefs.blotterSortOpen} onChange={setSort} />
            <SortHeader label="Pair" sortKey="symbol" state={prefs.blotterSortOpen} onChange={setSort} />
            <SortHeader label="Side" sortKey="status" state={prefs.blotterSortOpen} onChange={setSort} />
            <TableHead>Type</TableHead>
            <TableHead className="text-right">Trigger</TableHead>
            <SortHeader label="Lot" sortKey="size" state={prefs.blotterSortOpen} onChange={setSort} align="right" />
            <TableHead>Status</TableHead>
            <TableHead className={ACTIONS_CELL}>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <SkeletonRows rows={3} cols={8} />
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="p-0">
                <EmptyState className="py-8" title="No pending orders" description="Limit and stop orders you place will queue up here until they fire." />
              </TableCell>
            </TableRow>
          ) : (
          <AnimatePresence initial={false}>
            {rows.map((r) => {
              const sym = findSymbol(r.symbol);
              const isCancelling = cancelMut.isPending && cancelMut.variables === r.id;
              return (
                <motion.tr
                  key={r.id}
                  layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  exit={{ opacity: 0, x: 20, transition: { duration: 0.18 } }}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    rowKey(e);
                    if ((e.key === "Delete" || e.key === "Backspace") && r.status === "pending") {
                      cancelMut.mutate(r.id); e.preventDefault();
                    }
                  }}
                  className={cn("group border-b border-border/50 transition-colors hover:bg-muted/40 focus-visible:bg-muted/50 focus-visible:outline-none", isCancelling && "opacity-50")}
                >
                  <TableCell className="whitespace-nowrap py-1.5 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</TableCell>
                  <TableCell className="py-1.5 font-semibold">{r.symbol}</TableCell>
                  <TableCell className="py-1.5"><SidePill side={r.direction} /></TableCell>
                  <TableCell className="py-1.5 text-xs uppercase text-muted-foreground">{r.order_type.replace("_", " ")}</TableCell>
                  <TableCell className="py-1.5 text-right font-mono tabular-nums">{formatNumber(Number(r.trigger_price), sym?.decimals ?? 2)}</TableCell>
                  <TableCell className="py-1.5 text-right font-mono tabular-nums">{Number(r.lot_size).toFixed(2)}</TableCell>
                  <TableCell className="py-1.5"><StatusPill status={r.status} /></TableCell>
                  <TableCell className={ACTIONS_CELL}>
                    {r.status === "pending" && (
                      <Button
                        variant="ghost" size="icon"
                        className="h-7 w-7 cursor-pointer text-danger opacity-70 transition-all duration-150 hover:bg-danger/10 hover:opacity-100 active:scale-90 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-danger/50"
                        onClick={() => cancelMut.mutate(r.id)}
                        disabled={isCancelling}
                        aria-label="Cancel order (Delete)"
                        title="Cancel order (Delete)"
                      >
                        {isCancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                      </Button>
                    )}
                  </TableCell>
                </motion.tr>
              );
            })}
          </AnimatePresence>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function sortOrders(rows: Order[], s: BlotterSort): Order[] {
  const mul = s.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    switch (s.key) {
      case "symbol": return a.symbol.localeCompare(b.symbol) * mul;
      case "size":   return (Number(a.lot_size) - Number(b.lot_size)) * mul;
      case "status": return a.status.localeCompare(b.status) * mul;
      case "pnl":
      case "time":
      default:       return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * mul;
    }
  });
}

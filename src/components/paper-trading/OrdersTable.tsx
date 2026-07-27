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

  const { data } = useQuery({
    queryKey: ["paper", "orders", accountId],
    queryFn: () => fetch({ data: { account_id: accountId! } }) as unknown as Promise<Order[]>,
    enabled: !!accountId,
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => cancel({ data: { id } }),
    onMutate: async (id) => {
      // Optimistic remove so the row disappears instantly.
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

  const rows = data ?? [];
  if (!rows.length) {
    return <EmptyState className="py-10" title="No orders" description="Pending limit/stop orders will appear here." />;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Placed</TableHead>
            <TableHead>Pair</TableHead>
            <TableHead>Side</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">Trigger</TableHead>
            <TableHead className="text-right">Lot</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <AnimatePresence initial={false}>
            {rows.map((r) => {
              const sym = findSymbol(r.symbol);
              const isCancelling = cancelMut.isPending && cancelMut.variables === r.id;
              return (
                <motion.tr
                  key={r.id}
                  layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  exit={{ opacity: 0, x: 20, transition: { duration: 0.18 } }}
                  className={cn("group border-b border-border/50 transition-colors hover:bg-muted/40", isCancelling && "opacity-50")}
                >
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</TableCell>
                  <TableCell className="font-semibold">{r.symbol}</TableCell>
                  <TableCell>
                    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                      r.direction === "long" ? "bg-success/15 text-success" : "bg-danger/15 text-danger")}>
                      {r.direction}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs uppercase text-muted-foreground">{r.order_type.replace("_", " ")}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{formatNumber(Number(r.trigger_price), sym?.decimals ?? 2)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{Number(r.lot_size).toFixed(2)}</TableCell>
                  <TableCell>
                    <span className={cn("rounded px-1.5 py-0.5 text-[10px] uppercase",
                      r.status === "pending" && "bg-warning/15 text-warning",
                      r.status === "filled" && "bg-success/15 text-success",
                      r.status === "cancelled" && "bg-muted text-muted-foreground",
                    )}>{r.status}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    {r.status === "pending" && (
                      <Button
                        variant="ghost" size="icon"
                        className="h-7 w-7 cursor-pointer text-danger opacity-70 transition-all duration-150 hover:bg-danger/10 hover:opacity-100 active:scale-90 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-danger/50"
                        onClick={() => cancelMut.mutate(r.id)}
                        disabled={isCancelling}
                        aria-label="Cancel order"
                        title="Cancel order"
                      >
                        {isCancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                      </Button>
                    )}
                  </TableCell>
                </motion.tr>
              );
            })}
          </AnimatePresence>
        </TableBody>
      </Table>
    </div>
  );
}

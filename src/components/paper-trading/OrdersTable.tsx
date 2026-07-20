import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X } from "lucide-react";
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
    onSuccess: () => { toast.success("Order cancelled"); qc.invalidateQueries({ queryKey: ["paper", "orders"] }); },
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
          {rows.map((r) => {
            const sym = findSymbol(r.symbol);
            return (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</TableCell>
                <TableCell className="font-semibold">{r.symbol}</TableCell>
                <TableCell>
                  <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                    r.direction === "long" ? "bg-success/15 text-success" : "bg-danger/15 text-danger")}>
                    {r.direction}
                  </span>
                </TableCell>
                <TableCell className="text-xs uppercase text-muted-foreground">{r.order_type.replace("_", " ")}</TableCell>
                <TableCell className="text-right font-mono">{formatNumber(Number(r.trigger_price), sym?.decimals ?? 2)}</TableCell>
                <TableCell className="text-right font-mono">{Number(r.lot_size).toFixed(2)}</TableCell>
                <TableCell>
                  <span className={cn("rounded px-1.5 py-0.5 text-[10px] uppercase",
                    r.status === "pending" && "bg-warning/15 text-warning",
                    r.status === "filled" && "bg-success/15 text-success",
                    r.status === "cancelled" && "bg-muted text-muted-foreground",
                  )}>{r.status}</span>
                </TableCell>
                <TableCell className="text-right">
                  {r.status === "pending" && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-danger" onClick={() => cancelMut.mutate(r.id)} aria-label="Cancel">
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

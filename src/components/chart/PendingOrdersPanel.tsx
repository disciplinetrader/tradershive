/**
 * Pending Position-Tool orders — keyboard/pointer accessible action panel.
 *
 * This is the deterministic secondary path for editing and cancelling a
 * pending order: right-click on the chart canvas is convenient but must
 * never be the only way to reach these actions.
 */

import { Pencil, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ORDER_TYPE_LABELS, type PositionOrder } from "@/lib/chart/orders/model";

interface Props {
  orders: PositionOrder[];
  decimals?: number;
  onEdit: (orderId: string) => void;
  onCancel: (orderId: string) => void;
  className?: string;
}

export function PendingOrdersPanel({ orders, decimals = 4, onEdit, onCancel, className }: Props) {
  if (!orders.length) {
    return (
      <p className={cn("px-2.5 py-1.5 text-[11px] text-muted-foreground/80", className)} data-testid="pending-orders-empty">
        No pending Position Tool orders. Draw a Long or Short position and confirm the ticket.
      </p>
    );
  }

  return (
    <ul className={cn("space-y-1", className)} data-testid="pending-orders-panel">
      {orders.map((o) => (
        <li
          key={o.id}
          data-testid="pending-order-row"
          data-order-id={o.id}
          data-drawing-id={o.drawingId}
          className="flex items-center gap-2 rounded-md border border-border/50 bg-background/40 px-2 py-1.5 text-[11px]"
        >
          <span
            className={cn(
              "rounded px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-wide",
              o.direction === "buy" ? "bg-success/15 text-success" : "bg-danger/15 text-danger",
            )}
          >
            {ORDER_TYPE_LABELS[o.orderType]}
          </span>
          <span className="font-mono tabular-nums">{o.symbol}</span>
          <span className="font-mono tabular-nums text-muted-foreground">
            E {o.entry.toFixed(decimals)} · SL {o.stop.toFixed(decimals)} · TP {o.target.toFixed(decimals)}
          </span>
          <span className="ml-auto font-mono tabular-nums text-muted-foreground" data-testid="pending-order-rr">
            1 : {o.rr.toFixed(2)}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-[10px]"
            aria-label={`Edit order ${o.symbol} ${ORDER_TYPE_LABELS[o.orderType]}`}
            data-testid="pending-order-edit"
            onClick={() => onEdit(o.id)}
          >
            <Pencil className="mr-1 h-3 w-3" /> Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-[10px] text-danger hover:bg-danger/10"
            aria-label={`Cancel order ${o.symbol} ${ORDER_TYPE_LABELS[o.orderType]}`}
            data-testid="pending-order-cancel"
            onClick={() => onCancel(o.id)}
          >
            <XCircle className="mr-1 h-3 w-3" /> Cancel
          </Button>
        </li>
      ))}
    </ul>
  );
}

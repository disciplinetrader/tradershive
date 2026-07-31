/**
 * Position Tool — order confirmation panel (Phase 2).
 *
 * Opens when a Position Tool drawing is completed. Nothing is submitted
 * until Confirm is pressed; Edit returns to the chart with the drawing
 * intact, Cancel discards the pending intent (the drawing is untouched).
 */

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { AlertTriangle, ArrowDownRight, ArrowUpRight } from "lucide-react";
import {
  ORDER_TYPE_LABELS, entryDistance, orderTypesFor, validateOrder,
  type OrderDraft, type OrderType,
} from "@/lib/chart/orders/model";

interface Props {
  draft: OrderDraft | null;
  marketPrice?: number | null;
  tick?: number;
  decimals?: number;
  /** Live-inferred type, shown as a hint when the user overrides it. */
  inferredType?: OrderType | null;
  onConfirm: (draft: OrderDraft) => void;
  onEdit: () => void;
  onCancel: () => void;
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" | "muted" }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-mono font-medium tabular-nums",
          tone === "up" && "text-success",
          tone === "down" && "text-danger",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function PositionOrderDialog({
  draft, marketPrice, tick, decimals = 4, inferredType, onConfirm, onEdit, onCancel,
}: Props) {
  const [orderType, setOrderType] = useState<OrderType>(draft?.orderType ?? "market");

  useEffect(() => {
    if (draft) setOrderType(draft.orderType);
  }, [draft?.drawingId, draft?.orderType]);

  const current = useMemo<OrderDraft | null>(
    () => (draft ? { ...draft, orderType } : null),
    [draft, orderType],
  );

  const validation = useMemo(
    () => (current ? validateOrder(current, { marketPrice, tick }) : { ok: false, errors: [] }),
    [current, marketPrice, tick],
  );

  if (!draft || !current) return null;

  const fmt = (n: number) => n.toFixed(decimals);
  const risk = Math.abs(current.entry - current.stop);
  const reward = Math.abs(current.target - current.entry);
  const rr = risk > 0 ? reward / risk : 0;
  const distance = entryDistance(current, marketPrice);
  const isBuy = current.direction === "buy";

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span
              className={cn(
                "grid h-6 w-6 place-items-center rounded",
                isBuy ? "bg-success/15 text-success" : "bg-danger/15 text-danger",
              )}
            >
              {isBuy ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
            </span>
            Confirm {isBuy ? "Buy" : "Sell"} order · {current.symbol}
          </DialogTitle>
          <DialogDescription>
            Review the levels below. Nothing is submitted until you confirm.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <div className="mb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
              Order type
              {inferredType && inferredType !== orderType ? (
                <span className="ml-1 normal-case text-muted-foreground/70">
                  (auto: {ORDER_TYPE_LABELS[inferredType]})
                </span>
              ) : null}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {orderTypesFor(current.direction).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setOrderType(t)}
                  className={cn(
                    "rounded-md border px-2 py-1.5 text-[12px] font-medium transition-colors",
                    t === orderType
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  {ORDER_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border bg-muted/30 px-3 py-1">
            <Row label="Entry" value={fmt(current.entry)} />
            <Row label="Stop loss" value={fmt(current.stop)} tone="down" />
            <Row label="Take profit" value={fmt(current.target)} tone="up" />
            <Row label="Risk" value={fmt(risk)} tone="down" />
            <Row label="Reward" value={fmt(reward)} tone="up" />
            <Row label="Risk : Reward" value={`1 : ${rr.toFixed(2)}`} />
            <Row
              label="Distance to market"
              value={distance == null ? "—" : `${distance >= 0 ? "+" : ""}${fmt(distance)}`}
              tone="muted"
            />
            <Row
              label="Est. position size"
              value={current.size == null ? "Not sized" : current.size.toFixed(2)}
              tone="muted"
            />
          </div>

          {!validation.ok ? (
            <Alert variant="destructive" className="py-2">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <ul className="list-disc space-y-0.5 pl-4 text-[12px]">
                  {validation.errors.map((e) => <li key={e}>{e}</li>)}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="outline" onClick={onEdit}>Edit</Button>
          <Button
            disabled={!validation.ok}
            onClick={() => onConfirm(current)}
            className={cn(isBuy ? "bg-success hover:bg-success/90" : "bg-danger hover:bg-danger/90", "text-white")}
          >
            Confirm
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

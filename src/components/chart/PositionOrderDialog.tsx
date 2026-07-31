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
  /** "edit" retitles the panel for an existing pending order. */
  mode?: "create" | "edit";
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

function LevelField({
  label, value, onChange, step, tone, testId,
}: {
  label: string; value: string; onChange: (v: string) => void;
  step: number; tone?: "up" | "down"; testId: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        value={value}
        data-testid={testId}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-[12px] tabular-nums outline-none focus:border-primary",
          tone === "up" && "text-success",
          tone === "down" && "text-danger",
        )}
      />
    </label>
  );
}

export function PositionOrderDialog({
  draft, marketPrice, tick, decimals = 4, mode = "create", inferredType, onConfirm, onEdit, onCancel,
}: Props) {
  const [orderType, setOrderType] = useState<OrderType>(draft?.orderType ?? "market");
  const [levels, setLevels] = useState({
    entry: draft ? String(draft.entry) : "",
    stop: draft ? String(draft.stop) : "",
    target: draft ? String(draft.target) : "",
  });

  useEffect(() => {
    if (!draft) return;
    setOrderType(draft.orderType);
    setLevels({ entry: String(draft.entry), stop: String(draft.stop), target: String(draft.target) });
  }, [draft?.drawingId, draft?.orderType, draft?.entry, draft?.stop, draft?.target]);

  const parsed = useMemo(() => ({
    entry: Number(levels.entry),
    stop: Number(levels.stop),
    target: Number(levels.target),
  }), [levels]);

  const current = useMemo<OrderDraft | null>(
    () => (draft ? { ...draft, ...parsed, orderType } : null),
    [draft, parsed, orderType],
  );

  const validation = useMemo(
    () => (current ? validateOrder(current, { marketPrice, tick }) : { ok: false, errors: [] }),
    [current, marketPrice, tick],
  );

  if (!draft || !current) return null;

  const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(decimals) : "—");
  const risk = Math.abs(current.entry - current.stop);
  const reward = Math.abs(current.target - current.entry);
  const rr = risk > 0 ? reward / risk : 0;
  const distance = entryDistance(current, marketPrice);
  const isBuy = current.direction === "buy";
  const step = tick && tick > 0 ? tick : 10 ** -decimals;


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
            {mode === "edit" ? "Edit" : "Confirm"} {isBuy ? "Buy" : "Sell"} order · {current.symbol}
          </DialogTitle>
          <DialogDescription>
            {mode === "edit"
              ? "Adjust the levels below. The existing order is updated in place."
              : "Review the levels below. Nothing is submitted until you confirm."}
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
                  data-testid={`order-type-${t}`}
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

          <div className="grid grid-cols-3 gap-2">
            <LevelField
              label="Entry" testId="order-entry" step={step}
              value={levels.entry} onChange={(v) => setLevels((s) => ({ ...s, entry: v }))}
            />
            <LevelField
              label="Stop loss" testId="order-stop" step={step} tone="down"
              value={levels.stop} onChange={(v) => setLevels((s) => ({ ...s, stop: v }))}
            />
            <LevelField
              label="Take profit" testId="order-target" step={step} tone="up"
              value={levels.target} onChange={(v) => setLevels((s) => ({ ...s, target: v }))}
            />
          </div>

          <div className="rounded-lg border bg-muted/30 px-3 py-1">
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
            <Alert variant="destructive" className="py-2" data-testid="order-validation-errors">
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
          <Button variant="outline" onClick={onEdit}>Adjust on chart</Button>
          <Button
            disabled={!validation.ok}
            data-testid="order-confirm"
            onClick={() => onConfirm(current)}
            className={cn(isBuy ? "bg-success hover:bg-success/90" : "bg-danger hover:bg-danger/90", "text-white")}
          >
            {mode === "edit" ? "Save changes" : "Confirm"}
          </Button>
        </div>

      </DialogContent>
    </Dialog>
  );
}

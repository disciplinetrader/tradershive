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
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Minus, Plus } from "lucide-react";
import {
  ORDER_TYPE_LABELS, entryDistance, inferOrderType, orderTypesFor, validateOrder,
  type OrderDraft, type OrderType,
} from "@/lib/chart/orders/model";
import type { SymbolMeta } from "@/lib/paper-trading/symbols";
import { lotForRisk } from "@/lib/paper-trading/calculations";

/** Risk presets offered next to the risk input. */
const RISK_PRESETS = [0.25, 0.5, 1, 2];

interface Props {
  draft: OrderDraft | null;
  marketPrice?: number | null;
  tick?: number;
  decimals?: number;
  /** "edit" retitles the panel for an existing pending order. */
  mode?: "create" | "edit";
  /** Live-inferred type, shown as a hint when the user overrides it. */
  inferredType?: OrderType | null;
  /** Account balance used to turn risk % into a position size. */
  balance?: number;
  /** Default risk per trade, in percent of balance. */
  defaultRiskPct?: number;
  /** Symbol metadata — enables true lot sizing when available. */
  sym?: SymbolMeta | null;
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
  label, value, onChange, step, decimals, tone, testId,
}: {
  label: string; value: string; onChange: (v: string) => void;
  step: number; decimals: number; tone?: "up" | "down"; testId: string;
}) {
  const nudge = (dir: 1 | -1) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    onChange((n + dir * step).toFixed(decimals));
  };
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <div className="flex items-stretch gap-1">
        <button
          type="button" aria-label={`Decrease ${label}`} data-testid={`${testId}-dec`}
          onClick={() => nudge(-1)}
          className="grid w-6 shrink-0 place-items-center rounded-md border border-border text-muted-foreground hover:bg-muted"
        >
          <Minus className="h-3 w-3" />
        </button>
        <input
          id={testId}
          type="number"
          inputMode="decimal"
          step={step}
          value={value}
          data-testid={testId}
          aria-label={label}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "w-full min-w-0 rounded-md border border-border bg-background px-1.5 py-1.5 text-center font-mono text-[12px] tabular-nums outline-none focus:border-primary",
            tone === "up" && "text-success",
            tone === "down" && "text-danger",
          )}
        />
        <button
          type="button" aria-label={`Increase ${label}`} data-testid={`${testId}-inc`}
          onClick={() => nudge(1)}
          className="grid w-6 shrink-0 place-items-center rounded-md border border-border text-muted-foreground hover:bg-muted"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

export function PositionOrderDialog({
  draft, marketPrice, tick, decimals = 4, mode = "create",
  balance = 0, defaultRiskPct = 1, sym, onConfirm, onEdit, onCancel,
}: Props) {
  const [orderType, setOrderType] = useState<OrderType>(draft?.orderType ?? "market");
  /** Once the trader picks a type by hand we stop auto-detecting. */
  const [typeLocked, setTypeLocked] = useState(false);
  const [riskPct, setRiskPct] = useState<number>(defaultRiskPct > 0 ? defaultRiskPct : 1);
  const [levels, setLevels] = useState({
    entry: draft ? String(draft.entry) : "",
    stop: draft ? String(draft.stop) : "",
    target: draft ? String(draft.target) : "",
  });

  useEffect(() => {
    if (!draft) return;
    setOrderType(draft.orderType);
    setTypeLocked(false);
    setRiskPct(defaultRiskPct > 0 ? defaultRiskPct : 1);
    setLevels({ entry: String(draft.entry), stop: String(draft.stop), target: String(draft.target) });
  }, [draft?.drawingId, draft?.orderType, draft?.entry, draft?.stop, draft?.target, defaultRiskPct]);

  const parsed = useMemo(() => ({
    entry: Number(levels.entry),
    stop: Number(levels.stop),
    target: Number(levels.target),
  }), [levels]);

  // Instant detection: as long as the trader has not overridden the type,
  // it follows the entry level against the live market price.
  const autoType = useMemo(
    () => (draft ? inferOrderType(draft.direction, parsed.entry, marketPrice, tick ?? 0) : null),
    [draft?.direction, parsed.entry, marketPrice, tick],
  );
  useEffect(() => {
    if (!typeLocked && autoType && autoType !== orderType) setOrderType(autoType);
  }, [autoType, typeLocked, orderType]);

  const riskDistance = Math.abs(parsed.entry - parsed.stop);
  const riskAmount = (balance > 0 ? balance : 0) * (riskPct / 100);
  const size = useMemo(() => {
    if (!(riskAmount > 0) || !(riskDistance > 0)) return null;
    if (sym) {
      const lot = lotForRisk(sym, parsed.entry, parsed.stop, riskAmount);
      return lot > 0 ? lot : null;
    }
    return riskAmount / riskDistance;
  }, [riskAmount, riskDistance, sym, parsed.entry, parsed.stop]);

  const current = useMemo<OrderDraft | null>(
    () => (draft ? { ...draft, ...parsed, orderType, size: size ?? draft.size } : null),
    [draft, parsed, orderType, size],
  );

  const validation = useMemo(
    () => (current ? validateOrder(current, { marketPrice, tick }) : { ok: false, errors: [] }),
    [current, marketPrice, tick],
  );

  if (!draft || !current) return null;

  const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(decimals) : "—");
  const risk = riskDistance;
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
              {typeLocked && autoType && autoType !== orderType ? (
                <button
                  type="button"
                  onClick={() => { setTypeLocked(false); setOrderType(autoType); }}
                  className="ml-1 normal-case text-primary underline-offset-2 hover:underline"
                >
                  auto-detect: {ORDER_TYPE_LABELS[autoType]}
                </button>
              ) : (
                <span className="ml-1 normal-case text-muted-foreground/70">(auto-detected)</span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {orderTypesFor(current.direction).map((t) => (
                <button
                  key={t}
                  type="button"
                  data-testid={`order-type-${t}`}
                  onClick={() => { setTypeLocked(true); setOrderType(t); }}
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
              label="Entry" testId="order-entry" step={step} decimals={decimals}
              value={levels.entry} onChange={(v) => setLevels((s) => ({ ...s, entry: v }))}
            />
            <LevelField
              label="Stop loss" testId="order-stop" step={step} decimals={decimals} tone="down"
              value={levels.stop} onChange={(v) => setLevels((s) => ({ ...s, stop: v }))}
            />
            <LevelField
              label="Take profit" testId="order-target" step={step} decimals={decimals} tone="up"
              value={levels.target} onChange={(v) => setLevels((s) => ({ ...s, target: v }))}
            />
          </div>

          <div className="rounded-lg border bg-muted/30 px-3 py-2">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Risk per trade</span>
              <div className="flex items-center gap-1">
                {RISK_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    data-testid={`risk-preset-${p}`}
                    onClick={() => setRiskPct(p)}
                    className={cn(
                      "rounded border px-1.5 py-0.5 text-[11px] font-medium",
                      riskPct === p
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {p}%
                  </button>
                ))}
                <input
                  id="order-risk-pct"
                  type="number"
                  step={0.05}
                  min={0.01}
                  value={riskPct}
                  aria-label="Risk percent"
                  data-testid="order-risk-pct"
                  onChange={(e) => setRiskPct(Number(e.target.value))}
                  className="w-16 rounded-md border border-border bg-background px-1.5 py-0.5 text-center font-mono text-[11px] tabular-nums outline-none focus:border-primary"
                />
              </div>
            </div>
            <Row label="Risk" value={fmt(risk)} tone="down" />
            <Row label="Reward" value={fmt(reward)} tone="up" />
            <Row label="Risk : Reward" value={`1 : ${rr.toFixed(2)}`} />
            <Row
              label="Distance to market"
              value={distance == null ? "—" : `${distance >= 0 ? "+" : ""}${fmt(distance)}`}
              tone="muted"
            />
            <Row
              label={`Risk amount (${riskPct}%)`}
              value={riskAmount > 0 ? riskAmount.toFixed(2) : "—"}
              tone="muted"
            />
            <Row
              label={sym ? "Position size (lots)" : "Est. position size"}
              value={current.size == null ? "Not sized" : current.size.toFixed(sym ? 2 : 2)}
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
            {mode === "edit" ? "Save changes" : `Open ${isBuy ? "Buy" : "Sell"} Position`}
          </Button>
        </div>

      </DialogContent>
    </Dialog>
  );
}

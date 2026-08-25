/**
 * On-chart Target / Risk-Reward planning tool.
 *
 * The user clicks "Plan Trade", clicks anywhere on the chart to place
 * Entry, then drags Entry / SL / TP. A live floating stats panel shows
 * pips, points, RR, risk $, reward $, position size, lot size, expected
 * profit / loss and % of balance risked — updating every frame during
 * drag. All values are computed with the shared plan-math helpers so
 * they match the Order Panel exactly.
 *
 * "Send to Order Panel" hands the current plan back to the parent which
 * opens the trade via the existing openTrade server fn. The planner
 * itself does NOT talk to the server, keeping drag interactions instant.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Crosshair, Target, X } from "lucide-react";
import { Label } from "@/components/ui/label";

import type { ChartAdapter } from "@/lib/chart/adapter";
import type { SymbolMeta } from "@/lib/paper-trading/symbols";
import type { TradeSide } from "@/lib/paper-trading/calculations";
import { computePlan, fmtPrice } from "@/lib/trading/plan-math";
import { cn } from "@/lib/utils";

type Handle = "entry" | "sl" | "tp";
/**
 * `sl` and `tp` are null until the trader has actually placed them.
 *
 * They used to be seeded to a 20-pip / 40-pip bracket on the click that placed
 * entry, which is a 2R recommendation the tool was making on the trader's
 * behalf — and the number was arbitrary, not derived from volatility or from
 * any setting. Starting unset means the tool measures a plan instead of
 * proposing one. `PlanInputs`/`computePlan` already accept null on both, so
 * the maths needed no change to support this.
 */
type Plan = {
  side: TradeSide;
  entry: number;
  sl: number | null;
  tp: number | null;
};

/** A plan whose levels the trader has finished placing. */
type PlacedPlan = Plan & { sl: number; tp: number };

const isPlaced = (p: Plan): p is PlacedPlan => p.sl != null && p.tp != null;

interface Props {
  adapter: ChartAdapter | null;
  sym: SymbolMeta | null;
  active: boolean;
  onClose: () => void;
  balance: number;
  leverage: number;
  defaultRiskPct?: number;
  livePrice?: number;
  /**
   * Called when user clicks "Send to Order Panel". Parent opens the trade.
   *
   * Takes a PLACED plan: the button is disabled until both levels exist, so
   * the parent keeps receiving concrete numbers and needs no null handling.
   */
  onSend?: (p: PlacedPlan & { lot: number }) => void;
}

export function TradePlanner({
  adapter,
  sym,
  active,
  onClose,
  balance,
  leverage,
  defaultRiskPct = 1,
  livePrice,
  onSend,
}: Props) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [side, setSide] = useState<TradeSide>("long");
  const [riskPct, setRiskPct] = useState(defaultRiskPct);
  const dragging = useRef<{ handle: Handle } | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [, force] = useState(0);

  // Reset when tool deactivates
  useEffect(() => {
    if (!active) setPlan(null);
  }, [active]);

  // Reproject on resize
  useEffect(() => {
    if (!hostRef.current) return;
    const ro = new ResizeObserver(() => force((n) => n + 1));
    ro.observe(hostRef.current);
    return () => ro.disconnect();
  }, []);

  // Click-to-place Entry (armed only while active and no plan yet)
  const onHostClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!active || plan || !adapter || !sym) return;
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const price = adapter.yToPrice(e.clientY - rect.top);
      if (price == null || !Number.isFinite(price)) return;
      // Entry only. SL and TP are the trader's to place — see `Plan`.
      setPlan({ side, entry: price, sl: null, tp: null });
    },
    [active, plan, adapter, sym, side],
  );

  // Drag any of the three handles
  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!dragging.current || !adapter || !plan || !hostRef.current) return;
      const rect = hostRef.current.getBoundingClientRect();
      const price = adapter.yToPrice(e.clientY - rect.top);
      if (price == null || !Number.isFinite(price)) return;
      const h = dragging.current.handle;
      setPlan((p) => {
        if (!p) return p;
        if (h === "entry") {
          // Carry only the levels that exist; an unplaced one stays unplaced
          // rather than being conjured into existence by moving entry.
          const slDelta = p.sl != null ? p.sl - p.entry : null;
          const tpDelta = p.tp != null ? p.tp - p.entry : null;
          return {
            ...p,
            entry: price,
            sl: slDelta != null ? price + slDelta : null,
            tp: tpDelta != null ? price + tpDelta : null,
          };
        }
        if (h === "sl") return { ...p, sl: price };
        return { ...p, tp: price };
      });
    }
    function onUp() {
      dragging.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    if (dragging.current) {
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      return () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
    }
  });

  const result = useMemo(() => {
    if (!plan || !sym) return null;
    // Auto-lot from riskPct + current SL distance
    const preview = computePlan({
      sym, side: plan.side, entry: plan.entry, sl: plan.sl, tp: plan.tp,
      lot: sym.minLot, balance, leverage,
    });
    const lot = preview.suggestedLotForRiskPct(riskPct);
    return computePlan({
      sym, side: plan.side, entry: plan.entry, sl: plan.sl, tp: plan.tp,
      lot: Math.max(lot, sym.minLot), balance, leverage,
    });
  }, [plan, sym, riskPct, balance, leverage]);

  if (!active || !sym) return null;
  const entryY = plan && adapter ? adapter.priceToY(plan.entry) : null;
  const slY = plan?.sl != null && adapter ? adapter.priceToY(plan.sl) : null;
  const tpY = plan?.tp != null && adapter ? adapter.priceToY(plan.tp) : null;

  const flipSide = () => {
    setSide((s) => (s === "long" ? "short" : "long"));
    if (plan) {
      setPlan((p) => {
        if (!p) return p;
        const newSide: TradeSide = p.side === "long" ? "short" : "long";
        // Mirror whichever levels exist so risk/reward stays sensible.
        // Flipping an unplaced level would place it, which is the seeding
        // behaviour this tool no longer does.
        const slDist = p.sl != null ? Math.abs(p.entry - p.sl) : null;
        const tpDist = p.tp != null ? Math.abs(p.entry - p.tp) : null;
        return {
          ...p,
          side: newSide,
          sl: slDist == null ? null : newSide === "long" ? p.entry - slDist : p.entry + slDist,
          tp: tpDist == null ? null : newSide === "long" ? p.entry + tpDist : p.entry - tpDist,
        };
      });
    }
  };

  return (
    <div
      ref={hostRef}
      onClick={onHostClick}
      className={cn(
        "absolute inset-0 z-20",
        !plan && active ? "cursor-crosshair" : "pointer-events-none",
      )}
    >
      {/* Instruction banner when no plan yet */}
      <AnimatePresence>
        {active && !plan && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="pointer-events-auto absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-primary/50 bg-background/90 px-4 py-2 text-xs font-medium shadow-lg backdrop-blur"
          >
            <Crosshair className="h-3.5 w-3.5 text-primary" />
            Click the chart to place Entry —
            <button onClick={flipSide} className={cn("rounded px-2 py-0.5 text-[11px] font-bold uppercase", side === "long" ? "bg-success/20 text-success" : "bg-danger/20 text-danger")}>
              {side}
            </button>
            <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="ml-1 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Zones + handles */}
      {plan && entryY != null && (
        <>
          {/* Zones exist only where a level does — an unplaced SL or TP shades
              nothing, because there is no risk or reward to show yet. */}
          {tpY != null ? (
            <div
              className="absolute left-0 right-16 bg-success/10"
              style={{ top: Math.min(entryY, tpY), height: Math.abs(tpY - entryY) }}
            />
          ) : null}
          {slY != null ? (
            <div
              className="absolute left-0 right-16 bg-danger/10"
              style={{ top: Math.min(entryY, slY), height: Math.abs(slY - entryY) }}
            />
          ) : null}
          {(["entry", "sl", "tp"] as Handle[]).map((h) => {
            const placedY = h === "entry" ? entryY : h === "sl" ? slY : tpY;
            const price = h === "entry" ? plan.entry : h === "sl" ? plan.sl : plan.tp;
            const color = h === "entry" ? "#3b82f6" : h === "sl" ? "#ef4444" : "#22c55e";
            const label = h === "entry" ? "ENTRY" : h === "sl" ? "SL" : "TP";
            // An unplaced level parks ON the entry line: zero distance, so it
            // proposes no ratio, while staying grabbable. Rendering nothing
            // would be the honest depiction of "unset" and would also leave
            // the trader no way to set it — the handle IS the control.
            const unplaced = placedY == null;
            const y = placedY ?? entryY;
            return (
              <div key={h} className="absolute left-0 right-16 flex items-center" style={{ top: y - 10, height: 20 }}>
                {/* A dashed rail reads as "not placed yet" without inventing a level. */}
                <div
                  className={cn("flex-1", unplaced ? "border-t border-dashed" : "h-px")}
                  style={unplaced
                    ? { borderColor: color, opacity: 0.5 }
                    : { background: color, boxShadow: `0 0 6px ${color}` }}
                />
                <div
                  className={cn(
                    "pointer-events-auto ml-2 flex select-none items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase text-white",
                    unplaced && "opacity-60",
                  )}
                  style={{
                    background: color,
                    borderColor: color,
                    borderStyle: unplaced ? "dashed" : "solid",
                    cursor: "ns-resize",
                  }}
                  title={unplaced ? `Drag to place ${label}` : undefined}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    dragging.current = { handle: h };
                    force((n) => n + 1);
                  }}
                >
                  {label} · {price != null ? fmtPrice(sym, price) : "drag to place"}
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* Floating stats panel */}
      {plan && result && (() => { const placed = isPlaced(plan); return (
        <div className="pointer-events-auto absolute right-4 top-4 z-30 w-64 rounded-lg border border-border/60 bg-background/95 p-3 text-xs shadow-xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-semibold">
              <Target className="h-3.5 w-3.5 text-primary" />
              Trade Plan
            </div>
            <button onClick={onClose} aria-label="Close trade plan" className="text-muted-foreground hover:text-foreground">
              <X aria-hidden="true" className="h-3.5 w-3.5" />
            </button>

          </div>
          <div className="mb-2 flex items-center gap-2">
            <button onClick={flipSide} className={cn("flex-1 rounded px-2 py-1 text-[11px] font-bold uppercase", plan.side === "long" ? "bg-success/20 text-success" : "bg-danger/20 text-danger")}>
              {plan.side}
            </button>
            <div className="flex items-center gap-1 rounded border border-border/50 px-1.5 py-1">
              <Label htmlFor="plan-risk-pct" className="text-[10px] uppercase text-muted-foreground">Risk %</Label>
              <input
                id="plan-risk-pct"
                type="number" min={0.1} max={100} step={0.1} value={riskPct}
                onChange={(e) => setRiskPct(Math.max(0.1, Number(e.target.value) || 0.1))}
                className="w-10 bg-transparent text-right text-xs font-bold outline-none"
              />
            </div>
          </div>


          {/* An unplaced level yields rr 0, and "1 : 0.00" reads as a real
              (terrible) ratio rather than as "not set yet". Say nothing
              instead of saying something false. */}
          <StatRow
            label="RR"
            value={placed ? `1 : ${result.rr.toFixed(2)}` : "—"}
            accent={!placed ? undefined : result.rr >= 2 ? "green" : result.rr >= 1 ? "amber" : "red"}
          />
          <StatRow label="Pips risk / reward" value={`${result.pipsRisk.toFixed(1)} / ${result.pipsReward.toFixed(1)}`} />
          <StatRow label="Points" value={`${result.pointsRisk.toFixed(sym.decimals)} / ${result.pointsReward.toFixed(sym.decimals)}`} />
          <StatRow label="Lot size" value={result.lot.toFixed(2)} />
          <StatRow label="Units" value={result.units.toLocaleString()} />
          <StatRow label="Expected loss" value={`-$${result.riskAmount.toFixed(2)}`} accent="red" />
          <StatRow label="Expected profit" value={`+$${result.rewardAmount.toFixed(2)}`} accent="green" />
          <StatRow label="% of balance" value={`${result.riskPct.toFixed(2)} %`} />
          <StatRow label="Margin" value={`$${result.margin.toFixed(2)}`} />
          {livePrice != null && <StatRow label="Live" value={fmtPrice(sym, livePrice)} muted />}

          {/* Nothing is sendable until BOTH levels are placed. `rr <= 0`
              already covered this incidentally — an unset SL gives rr 0 — but
              the intent is now explicit rather than a side effect, and the
              narrowing is what lets `onSend` take a fully-placed plan. */}
          <button
            onClick={() => { if (placed) onSend?.({ ...plan, lot: result.lot }); }}
            disabled={!placed || result.lot <= 0 || result.rr <= 0}
            title={placed ? undefined : "Place a stop loss and a take profit first"}
            className="mt-2 w-full rounded-md bg-primary py-1.5 text-[11px] font-bold uppercase text-primary-foreground disabled:opacity-40"
          >
            Send to order panel
          </button>
        </div>
      ); })()}
    </div>
  );
}

function StatRow({
  label,
  value,
  accent,
  muted,
}: {
  label: string;
  value: string;
  accent?: "green" | "red" | "amber";
  muted?: boolean;
}) {
  const color =
    accent === "green" ? "text-success" :
    accent === "red" ? "text-danger" :
    accent === "amber" ? "text-warning" :
    muted ? "text-muted-foreground" : "text-foreground";
  return (
    <div className="flex items-center justify-between border-b border-border/30 py-1 last:border-b-0">
      <span className="text-[10px] uppercase text-muted-foreground">{label}</span>
      <span className={cn("font-mono text-xs font-semibold tabular-nums", color)}>{value}</span>
    </div>
  );
}

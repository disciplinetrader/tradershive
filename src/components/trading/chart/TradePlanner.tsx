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
import type { ChartAdapter } from "@/lib/chart/adapter";
import type { SymbolMeta } from "@/lib/paper-trading/symbols";
import type { TradeSide } from "@/lib/paper-trading/calculations";
import { computePlan, fmtPrice } from "@/lib/trading/plan-math";
import { cn } from "@/lib/utils";

type Handle = "entry" | "sl" | "tp";
type Plan = {
  side: TradeSide;
  entry: number;
  sl: number;
  tp: number;
};

interface Props {
  adapter: ChartAdapter | null;
  sym: SymbolMeta | null;
  active: boolean;
  onClose: () => void;
  balance: number;
  leverage: number;
  defaultRiskPct?: number;
  livePrice?: number;
  /** Called when user clicks "Send to Order Panel". Parent opens the trade. */
  onSend?: (p: Plan & { lot: number }) => void;
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
      // Default SL / TP: 20 pips risk, 40 pips reward (2R)
      const risk = sym.pipSize * 20;
      const reward = sym.pipSize * 40;
      const sl = side === "long" ? price - risk : price + risk;
      const tp = side === "long" ? price + reward : price - reward;
      setPlan({ side, entry: price, sl, tp });
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
          const slDelta = p.sl - p.entry;
          const tpDelta = p.tp - p.entry;
          return { ...p, entry: price, sl: price + slDelta, tp: price + tpDelta };
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
  const slY = plan && adapter ? adapter.priceToY(plan.sl) : null;
  const tpY = plan && adapter ? adapter.priceToY(plan.tp) : null;

  const flipSide = () => {
    setSide((s) => (s === "long" ? "short" : "long"));
    if (plan) {
      setPlan((p) => {
        if (!p) return p;
        const newSide: TradeSide = p.side === "long" ? "short" : "long";
        // Mirror SL/TP so risk/reward stays sensible
        const slDist = Math.abs(p.entry - p.sl);
        const tpDist = Math.abs(p.entry - p.tp);
        return {
          ...p,
          side: newSide,
          sl: newSide === "long" ? p.entry - slDist : p.entry + slDist,
          tp: newSide === "long" ? p.entry + tpDist : p.entry - tpDist,
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
      {plan && entryY != null && slY != null && tpY != null && (
        <>
          {/* Reward zone (entry -> tp) */}
          <div
            className="absolute left-0 right-16 bg-success/10"
            style={{ top: Math.min(entryY, tpY), height: Math.abs(tpY - entryY) }}
          />
          {/* Risk zone (entry -> sl) */}
          <div
            className="absolute left-0 right-16 bg-danger/10"
            style={{ top: Math.min(entryY, slY), height: Math.abs(slY - entryY) }}
          />
          {(["entry", "sl", "tp"] as Handle[]).map((h) => {
            const y = h === "entry" ? entryY : h === "sl" ? slY : tpY;
            const price = h === "entry" ? plan.entry : h === "sl" ? plan.sl : plan.tp;
            const color = h === "entry" ? "#3b82f6" : h === "sl" ? "#ef4444" : "#22c55e";
            const label = h === "entry" ? "ENTRY" : h === "sl" ? "SL" : "TP";
            return (
              <div key={h} className="absolute left-0 right-16 flex items-center" style={{ top: y - 10, height: 20 }}>
                <div className="h-px flex-1" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
                <div
                  className="pointer-events-auto ml-2 flex select-none items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase text-white"
                  style={{ background: color, borderColor: color, cursor: "ns-resize" }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    dragging.current = { handle: h };
                    force((n) => n + 1);
                  }}
                >
                  {label} · {fmtPrice(sym, price)}
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* Floating stats panel */}
      {plan && result && (
        <div className="pointer-events-auto absolute right-4 top-4 z-30 w-64 rounded-lg border border-border/60 bg-background/95 p-3 text-xs shadow-xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-semibold">
              <Target className="h-3.5 w-3.5 text-primary" />
              Trade Plan
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mb-2 flex items-center gap-2">
            <button onClick={flipSide} className={cn("flex-1 rounded px-2 py-1 text-[11px] font-bold uppercase", plan.side === "long" ? "bg-success/20 text-success" : "bg-danger/20 text-danger")}>
              {plan.side}
            </button>
            <label className="flex items-center gap-1 rounded border border-border/50 px-1.5 py-1">
              <span className="text-[10px] uppercase text-muted-foreground">Risk %</span>
              <input
                type="number" min={0.1} max={100} step={0.1} value={riskPct}
                onChange={(e) => setRiskPct(Math.max(0.1, Number(e.target.value) || 0.1))}
                className="w-10 bg-transparent text-right text-xs font-bold outline-none"
              />
            </label>
          </div>

          <StatRow label="RR" value={`1 : ${result.rr.toFixed(2)}`} accent={result.rr >= 2 ? "green" : result.rr >= 1 ? "amber" : "red"} />
          <StatRow label="Pips risk / reward" value={`${result.pipsRisk.toFixed(1)} / ${result.pipsReward.toFixed(1)}`} />
          <StatRow label="Points" value={`${result.pointsRisk.toFixed(sym.decimals)} / ${result.pointsReward.toFixed(sym.decimals)}`} />
          <StatRow label="Lot size" value={result.lot.toFixed(2)} />
          <StatRow label="Units" value={result.units.toLocaleString()} />
          <StatRow label="Expected loss" value={`-$${result.riskAmount.toFixed(2)}`} accent="red" />
          <StatRow label="Expected profit" value={`+$${result.rewardAmount.toFixed(2)}`} accent="green" />
          <StatRow label="% of balance" value={`${result.riskPct.toFixed(2)} %`} />
          <StatRow label="Margin" value={`$${result.margin.toFixed(2)}`} />
          {livePrice != null && <StatRow label="Live" value={fmtPrice(sym, livePrice)} muted />}

          <button
            onClick={() => onSend?.({ ...plan, lot: result.lot })}
            disabled={result.lot <= 0 || result.rr <= 0}
            className="mt-2 w-full rounded-md bg-primary py-1.5 text-[11px] font-bold uppercase text-primary-foreground disabled:opacity-40"
          >
            Send to order panel
          </button>
        </div>
      )}
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

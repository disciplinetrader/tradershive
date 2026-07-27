/**
 * Live position overlay — professional trade visualization.
 *
 * For every open position on the active symbol this component draws:
 *   • Solid, thick ENTRY line with a rich floating label (direction, size,
 *     entry price, floating R multiple, floating $ P/L, floating points).
 *   • Dashed red STOP-LOSS line with the potential $ loss.
 *   • Dashed green TAKE-PROFIT line with the potential $ reward.
 *   • Translucent red risk zone between entry ↔ SL.
 *   • Translucent green reward zone between entry ↔ TP.
 *
 * While the trader drags SL or TP a floating tooltip shows the live price,
 * updated R:R, potential profit and potential loss so the trade impact is
 * understood before releasing the mouse.
 *
 * All persistence still flows through the existing paper-trading server
 * functions (`modifyTrade`, `closeTrade`, `moveToBreakEven`,
 * `partialCloseTrade`) — visualization only, no trading-logic changes.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import type { ChartAdapter } from "@/lib/chart/adapter";
import type { SymbolMeta } from "@/lib/paper-trading/symbols";
import { modifyTrade, closeTrade, moveToBreakEven, partialCloseTrade } from "@/lib/paper-trading.functions";
import { floatingPnl, fmtPrice } from "@/lib/trading/plan-math";
import { pnl as computePnl } from "@/lib/paper-trading/calculations";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Shield, Scissors, MoreHorizontal } from "lucide-react";

export type OpenTradeLine = {
  id: string;
  direction: "long" | "short";
  entry_price: number;
  stop_loss: number | null;
  take_profit: number | null;
  lot_size: number;
};

interface Props {
  adapter: ChartAdapter | null;
  sym: SymbolMeta | null;
  trades: OpenTradeLine[];
  livePrice: number | null | undefined;
  tick?: number;
}

type DragState = { tradeId: string; handle: "sl" | "tp"; price: number };

/** Signed points delta between entry and current price, in symbol units. */
function pointsDelta(direction: "long" | "short", entry: number, current: number): number {
  return direction === "long" ? current - entry : entry - current;
}

/** Format money compactly; keeps sign for display. */
function fmtMoney(v: number, currency = "USD"): string {
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  const abs = Math.abs(v);
  const digits = abs >= 1000 ? 0 : 2;
  try {
    return sign + new Intl.NumberFormat(undefined, {
      style: "currency", currency, maximumFractionDigits: digits, minimumFractionDigits: digits,
    }).format(abs);
  } catch {
    return `${sign}$${abs.toFixed(digits)}`;
  }
}

export function PositionLinesLive({ adapter, sym, trades, livePrice, tick }: Props) {
  const qc = useQueryClient();
  const modifyFn = useServerFn(modifyTrade);
  const closeFn = useServerFn(closeTrade);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [, force] = useState(0);
  const [drag, setDrag] = useState<DragState | null>(null);

  // Local overrides during drag so UI doesn't flicker between server updates
  const [overrides, setOverrides] = useState<Record<string, { sl?: number; tp?: number }>>({});

  const modify = useMutation({
    mutationFn: async (v: { id: string; stop_loss?: number | null; take_profit?: number | null }) =>
      modifyFn({ data: v }) as unknown as Promise<{ ok: true }>,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["paper", "trades"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to modify trade"),
  });

  const close = useMutation({
    mutationFn: async (v: { id: string; exit_price: number }) =>
      closeFn({ data: { ...v, close_reason: "manual" as const } }) as unknown as Promise<unknown>,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["paper", "trades"] });
      qc.invalidateQueries({ queryKey: ["paper", "accounts"] });
    },
  });

  const beFn = useServerFn(moveToBreakEven);
  const partialFn = useServerFn(partialCloseTrade);
  const be = useMutation({
    mutationFn: async (id: string) => beFn({ data: { id } }) as unknown as Promise<{ changed: boolean }>,
    onSuccess: (r) => {
      toast.success(r.changed ? "Moved to break-even" : "Already at break-even");
      qc.invalidateQueries({ queryKey: ["paper", "trades"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const partial = useMutation({
    mutationFn: async (v: { id: string; fraction: number; exit_price: number }) =>
      partialFn({ data: v }) as unknown as Promise<{ closed_lot: number; pnl: number }>,
    onSuccess: (r) => {
      toast.success(`Closed ${r.closed_lot} lots · P/L ${r.pnl.toFixed(2)}`);
      qc.invalidateQueries({ queryKey: ["paper"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  useEffect(() => {
    if (!hostRef.current) return;
    const ro = new ResizeObserver(() => force((n) => n + 1));
    ro.observe(hostRef.current);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { force((n) => n + 1); }, [tick, trades, livePrice]);

  useEffect(() => {
    if (!drag) return;
    function onMove(e: PointerEvent) {
      if (!drag || !adapter || !hostRef.current) return;
      const rect = hostRef.current.getBoundingClientRect();
      const price = adapter.yToPrice(e.clientY - rect.top);
      if (price == null || !Number.isFinite(price)) return;
      setOverrides((o) => ({ ...o, [drag.tradeId]: { ...o[drag.tradeId], [drag.handle]: price } }));
    }
    function onUp() {
      if (!drag) return;
      const px = overrides[drag.tradeId]?.[drag.handle];
      if (px != null) {
        modify.mutate({
          id: drag.tradeId,
          [drag.handle === "sl" ? "stop_loss" : "take_profit"]: px,
        } as { id: string; stop_loss?: number; take_profit?: number });
      }
      setDrag(null);
      // Clear override after a short window so server value takes over
      setTimeout(() => setOverrides((o) => { const c = { ...o }; delete c[drag.tradeId]; return c; }), 800);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, adapter, overrides, modify]);

  const rendered = useMemo(() => {
    if (!adapter || !sym) return [];
    return trades.map((t) => {
      const ov = overrides[t.id] ?? {};
      const sl = ov.sl ?? t.stop_loss;
      const tp = ov.tp ?? t.take_profit;
      // Money math is renderer-independent — just needs symbol contract
      const riskAmt = sl != null ? Math.abs(computePnl(sym, t.direction, t.entry_price, sl, t.lot_size)) : 0;
      const rewardAmt = tp != null ? Math.abs(computePnl(sym, t.direction, t.entry_price, tp, t.lot_size)) : 0;
      const pnl = livePrice != null ? floatingPnl(sym, t.direction, t.entry_price, livePrice, t.lot_size) : 0;
      const rMult = riskAmt > 0 ? pnl / riskAmt : 0;
      const pts = livePrice != null ? pointsDelta(t.direction, t.entry_price, livePrice) : 0;
      const rr = riskAmt > 0 && rewardAmt > 0 ? rewardAmt / riskAmt : 0;
      return {
        t,
        entryY: adapter.priceToY(t.entry_price),
        slY: sl != null ? adapter.priceToY(sl) : null,
        tpY: tp != null ? adapter.priceToY(tp) : null,
        slPrice: sl,
        tpPrice: tp,
        priceY: livePrice != null ? adapter.priceToY(livePrice) : null,
        pnl, rMult, pts, riskAmt, rewardAmt, rr,
      };
    });
  }, [adapter, sym, trades, overrides, livePrice]);

  // Anti-collision: stack entry labels vertically when two positions sit
  // within 44px of each other so the rich labels stay readable.
  const labelOffsets = useMemo(() => {
    const items = rendered
      .map((r, i) => ({ i, y: r.entryY ?? Number.POSITIVE_INFINITY }))
      .sort((a, b) => a.y - b.y);
    const offsets = new Array(items.length).fill(0);
    let lastY = -Infinity;
    for (const it of items) {
      if (!Number.isFinite(it.y)) continue;
      if (it.y - lastY < 44) {
        offsets[it.i] = 44 - (it.y - lastY);
        lastY = it.y + offsets[it.i];
      } else {
        lastY = it.y;
      }
    }
    return offsets;
  }, [rendered]);

  if (!sym) return null;

  return (
    <div ref={hostRef} className="pointer-events-none absolute inset-0 z-10 select-none">
      {rendered.map((row, idx) => {
        const { t, entryY, slY, tpY, slPrice, tpPrice, pnl, rMult, pts, riskAmt, rewardAmt, rr } = row;
        if (entryY == null) return null;
        const slActive = drag?.tradeId === t.id && drag.handle === "sl";
        const tpActive = drag?.tradeId === t.id && drag.handle === "tp";
        const yOffset = labelOffsets[idx] ?? 0;
        const isLong = t.direction === "long";
        const winning = pnl >= 0;

        return (
          <div key={t.id}>
            {/* Reward zone — entry ↔ TP (green) */}
            {tpY != null && (
              <div
                className="absolute left-0 right-16 bg-success/[0.08] transition-all duration-150 ease-out animate-fade-in"
                style={{
                  top: Math.min(entryY, tpY),
                  height: Math.max(0, Math.abs(tpY - entryY)),
                }}
              />
            )}
            {/* Risk zone — entry ↔ SL (red) */}
            {slY != null && (
              <div
                className="absolute left-0 right-16 bg-danger/[0.08] transition-all duration-150 ease-out animate-fade-in"
                style={{
                  top: Math.min(entryY, slY),
                  height: Math.max(0, Math.abs(slY - entryY)),
                }}
              />
            )}

            {/* ENTRY — solid, thick, side-tinted with rich live label */}
            <div className="absolute left-0 right-16 flex items-center" style={{ top: entryY - 1, height: 2 }}>
              <div
                className="h-[2px] flex-1"
                style={{
                  background: isLong ? "#3b82f6" : "#3b82f6",
                  boxShadow: "0 0 8px rgba(59,130,246,0.55)",
                }}
              />
            </div>
            <div
              className="absolute right-16 flex items-stretch overflow-hidden rounded-md shadow-lg backdrop-blur transition-[top] duration-150 ease-out"
              style={{ top: entryY + yOffset - 12 }}
            >
              {/* Side pill */}
              <div
                className={cn(
                  "flex items-center gap-1 px-1.5 text-[10px] font-bold uppercase text-white",
                  isLong ? "bg-success" : "bg-danger",
                )}
              >
                {isLong ? "▲" : "▼"} {isLong ? "LONG" : "SHORT"} · {t.lot_size}
              </div>
              {/* Data strip */}
              <div className="pointer-events-auto flex items-center gap-2 border-y border-r border-blue-500/60 bg-background/90 px-2 py-0.5 font-mono text-[10px]">
                <span className="text-muted-foreground">Entry</span>
                <span className="tabular-nums text-foreground">{fmtPrice(sym, t.entry_price)}</span>
                <span className="text-border">│</span>
                <span
                  className={cn(
                    "tabular-nums font-bold transition-colors duration-200",
                    winning ? "text-success" : "text-danger",
                  )}
                >
                  {rMult >= 0 ? "+" : ""}{rMult.toFixed(2)}R
                </span>
                <span
                  className={cn(
                    "rounded px-1 py-[1px] font-bold tabular-nums text-white transition-colors duration-200",
                    winning ? "bg-success" : "bg-danger",
                  )}
                  style={{ willChange: "background-color" }}
                >
                  {fmtMoney(pnl)}
                </span>
                <span className={cn("tabular-nums", winning ? "text-success" : "text-danger")}>
                  {pts >= 0 ? "+" : ""}{pts.toFixed(sym.decimals)} pts
                </span>
                {rr > 0 && (
                  <>
                    <span className="text-border">│</span>
                    <span className="text-muted-foreground">R:R</span>
                    <span className="tabular-nums text-foreground">1:{rr.toFixed(2)}</span>
                  </>
                )}
                <button
                  title="Close position"
                  onClick={() => livePrice != null && close.mutate({ id: t.id, exit_price: livePrice })}
                  className="ml-1 cursor-pointer rounded bg-muted px-1 text-muted-foreground transition hover:bg-danger hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
                >×</button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button title="Quick actions" className="cursor-pointer rounded bg-muted px-1 text-muted-foreground transition hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                      <MoreHorizontal className="h-3 w-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Quick actions</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => be.mutate(t.id)}
                      disabled={t.stop_loss != null && t.stop_loss === t.entry_price}
                    >
                      <Shield className="mr-2 h-3.5 w-3.5" /> Break-even
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {[0.25, 0.5, 0.75].map((f) => (
                      <DropdownMenuItem
                        key={f}
                        disabled={livePrice == null}
                        onSelect={() => livePrice != null && partial.mutate({ id: t.id, fraction: f, exit_price: livePrice })}
                      >
                        <Scissors className="mr-2 h-3.5 w-3.5" /> Close {Math.round(f * 100)}%
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* SL — red dashed line + label with potential loss */}
            {slY != null && slPrice != null && (
              <>
                <div
                  className="pointer-events-none absolute left-0 right-16 h-px transition-shadow"
                  style={{
                    top: slY,
                    backgroundImage: "repeating-linear-gradient(to right, #ef4444 0 6px, transparent 6px 12px)",
                    boxShadow: slActive ? "0 0 10px rgba(239,68,68,0.7)" : "0 0 6px rgba(239,68,68,0.35)",
                  }}
                />
                <div
                  className="pointer-events-auto absolute left-0 right-16 flex items-center"
                  style={{ top: slY - 12, height: 24, cursor: "ns-resize", touchAction: "none" }}
                  onPointerDown={(e) => {
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    setDrag({ tradeId: t.id, handle: "sl", price: slPrice });
                  }}
                  title="Drag to move Stop Loss"
                >
                  <div className="flex-1" />
                  <div
                    className={cn(
                      "flex select-none items-stretch overflow-hidden rounded-md shadow-md transition-transform duration-150 hover:scale-105",
                      slActive && "scale-110 ring-2 ring-danger/40",
                    )}
                    style={{ willChange: "transform" }}
                  >
                    <div className="flex items-center gap-1 bg-danger px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                      SL
                    </div>
                    <div className="flex items-center gap-1.5 border-y border-r border-danger/60 bg-background/90 px-1.5 py-0.5 font-mono text-[10px]">
                      <span className="tabular-nums text-foreground">{fmtPrice(sym, slPrice)}</span>
                      <span className="text-border">│</span>
                      <span className="tabular-nums text-danger">{fmtMoney(-riskAmt)}</span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* TP — green dashed line + label with potential reward */}
            {tpY != null && tpPrice != null && (
              <>
                <div
                  className="pointer-events-none absolute left-0 right-16 h-px transition-shadow"
                  style={{
                    top: tpY,
                    backgroundImage: "repeating-linear-gradient(to right, #22c55e 0 6px, transparent 6px 12px)",
                    boxShadow: tpActive ? "0 0 10px rgba(34,197,94,0.7)" : "0 0 6px rgba(34,197,94,0.35)",
                  }}
                />
                <div
                  className="pointer-events-auto absolute left-0 right-16 flex items-center"
                  style={{ top: tpY - 12, height: 24, cursor: "ns-resize", touchAction: "none" }}
                  onPointerDown={(e) => {
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    setDrag({ tradeId: t.id, handle: "tp", price: tpPrice });
                  }}
                  title="Drag to move Take Profit"
                >
                  <div className="flex-1" />
                  <div
                    className={cn(
                      "flex select-none items-stretch overflow-hidden rounded-md shadow-md transition-transform duration-150 hover:scale-105",
                      tpActive && "scale-110 ring-2 ring-success/40",
                    )}
                    style={{ willChange: "transform" }}
                  >
                    <div className="flex items-center gap-1 bg-success px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                      TP
                    </div>
                    <div className="flex items-center gap-1.5 border-y border-r border-success/60 bg-background/90 px-1.5 py-0.5 font-mono text-[10px]">
                      <span className="tabular-nums text-foreground">{fmtPrice(sym, tpPrice)}</span>
                      <span className="text-border">│</span>
                      <span className="tabular-nums text-success">{fmtMoney(rewardAmt)}</span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Drag tooltip — floats near cursor with live impact math */}
            {(slActive || tpActive) && (
              <div
                className="pointer-events-none absolute z-30 min-w-[180px] rounded-lg border border-border/60 bg-background/95 p-2 text-[10px] font-mono shadow-2xl backdrop-blur animate-fade-in"
                style={{
                  top: ((slActive ? slY : tpY) ?? 0) + 16,
                  right: 96,
                }}
              >
                <div className="mb-1 flex items-center justify-between border-b border-border/40 pb-1">
                  <span
                    className={cn(
                      "rounded px-1.5 py-[1px] text-[9px] font-bold uppercase text-white",
                      slActive ? "bg-danger" : "bg-success",
                    )}
                  >
                    {slActive ? "Moving SL" : "Moving TP"}
                  </span>
                  <span className="tabular-nums text-foreground">
                    {fmtPrice(sym, (slActive ? slPrice : tpPrice) ?? 0)}
                  </span>
                </div>
                <Row label="R:R" value={rr > 0 ? `1 : ${rr.toFixed(2)}` : "—"} />
                <Row label="Potential profit" value={fmtMoney(rewardAmt)} tone="success" />
                <Row label="Potential loss" value={fmtMoney(-riskAmt)} tone="danger" />
                <Row label="Floating P/L" value={fmtMoney(pnl)} tone={winning ? "success" : "danger"} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "success" | "danger" }) {
  return (
    <div className="flex items-center justify-between py-[1px]">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "tabular-nums font-bold",
          tone === "success" && "text-success",
          tone === "danger" && "text-danger",
        )}
      >
        {value}
      </span>
    </div>
  );
}

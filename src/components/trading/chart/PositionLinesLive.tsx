/**
 * Live position overlay: draws Entry/SL/TP for each open trade on the
 * current symbol, plus a floating PnL badge that follows the current
 * price. SL/TP handles are draggable — releasing calls modifyTrade to
 * persist. Debounced via pointerup so the server sees one write per drag.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import type { ChartAdapter } from "@/lib/chart/adapter";
import type { SymbolMeta } from "@/lib/paper-trading/symbols";
import { modifyTrade, closeTrade, moveToBreakEven, partialCloseTrade } from "@/lib/paper-trading.functions";
import { floatingPnl, fmtPrice } from "@/lib/trading/plan-math";
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
      return {
        t,
        entryY: adapter.priceToY(t.entry_price),
        slY: sl != null ? adapter.priceToY(sl) : null,
        tpY: tp != null ? adapter.priceToY(tp) : null,
        slPrice: sl,
        tpPrice: tp,
        priceY: livePrice != null ? adapter.priceToY(livePrice) : null,
        pnl: livePrice != null ? floatingPnl(sym, t.direction, t.entry_price, livePrice, t.lot_size) : 0,
      };
    });
  }, [adapter, sym, trades, overrides, livePrice]);

  if (!sym) return null;

  return (
    <div ref={hostRef} className="pointer-events-none absolute inset-0 z-10">
      {rendered.map(({ t, entryY, slY, tpY, slPrice, tpPrice, pnl }) => {
        if (entryY == null) return null;
        return (
          <div key={t.id}>
            {/* Entry line + PnL badge */}
            <div className="absolute left-0 right-16 flex items-center" style={{ top: entryY - 10, height: 20 }}>
              <div className="h-px flex-1 bg-blue-500" style={{ boxShadow: "0 0 6px #3b82f6" }} />
              <div className="pointer-events-auto ml-2 flex select-none items-center gap-1 rounded-md border border-blue-500 bg-blue-500 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                {t.direction === "long" ? "▲" : "▼"} {t.lot_size} · {fmtPrice(sym, t.entry_price)}
                <span className={cn("ml-1 rounded px-1 py-0.5", pnl >= 0 ? "bg-success" : "bg-danger")}>
                  {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}
                </span>
                <button
                  title="Close position"
                  onClick={() => livePrice != null && close.mutate({ id: t.id, exit_price: livePrice })}
                  className="ml-1 rounded bg-white/20 px-1 hover:bg-white/40"
                >×</button>
              </div>
            </div>

            {/* SL */}
            {slY != null && slPrice != null && (
              <div className="absolute left-0 right-16 flex items-center" style={{ top: slY - 10, height: 20 }}>
                <div className="h-px flex-1 bg-danger" style={{ boxShadow: "0 0 6px #ef4444" }} />
                <div
                  className="pointer-events-auto ml-2 flex select-none items-center gap-1 rounded-md border border-danger bg-danger px-1.5 py-0.5 text-[10px] font-bold uppercase text-white"
                  style={{ cursor: "ns-resize" }}
                  onPointerDown={(e) => {
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    setDrag({ tradeId: t.id, handle: "sl", price: slPrice });
                  }}
                >
                  SL · {fmtPrice(sym, slPrice)}
                </div>
              </div>
            )}

            {/* TP */}
            {tpY != null && tpPrice != null && (
              <div className="absolute left-0 right-16 flex items-center" style={{ top: tpY - 10, height: 20 }}>
                <div className="h-px flex-1 bg-success" style={{ boxShadow: "0 0 6px #22c55e" }} />
                <div
                  className="pointer-events-auto ml-2 flex select-none items-center gap-1 rounded-md border border-success bg-success px-1.5 py-0.5 text-[10px] font-bold uppercase text-white"
                  style={{ cursor: "ns-resize" }}
                  onPointerDown={(e) => {
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    setDrag({ tradeId: t.id, handle: "tp", price: tpPrice });
                  }}
                >
                  TP · {fmtPrice(sym, tpPrice)}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

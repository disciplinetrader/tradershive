/**
 * Right-click context menu on the TradingView chart. Uses the ChartAdapter
 * coord transform to know which price/time was clicked; hands the price
 * back to the workspace so market/limit/stop orders and alerts can pre-fill.
 */
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Bell, Copy, Pencil, TrendingDown, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import type { ChartAdapter } from "@/lib/chart/adapter";
import type { SymbolMeta } from "@/lib/paper-trading/symbols";
import { fmtPrice } from "@/lib/trading/plan-math";

export type ChartOrderIntent =
  | { kind: "buy_market" }
  | { kind: "sell_market" }
  | { kind: "buy_limit"; price: number }
  | { kind: "sell_limit"; price: number }
  | { kind: "buy_stop"; price: number }
  | { kind: "sell_stop"; price: number }
  | { kind: "alert"; price: number }
  | { kind: "drawing"; price: number };

interface Props {
  adapter: ChartAdapter | null;
  sym: SymbolMeta | null;
  livePrice?: number;
  onIntent: (intent: ChartOrderIntent) => void;
}

export function ChartContextMenu({ adapter, sym, livePrice, onIntent }: Props) {
  const [state, setState] = useState<{ x: number; y: number; price: number } | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current?.parentElement;
    if (!host) return;
    function onContext(e: MouseEvent) {
      if (!adapter) return;
      const rect = host!.getBoundingClientRect();
      const price = adapter.yToPrice(e.clientY - rect.top);
      if (price == null || !Number.isFinite(price)) return;
      e.preventDefault();
      // Position menu inside the host bounds
      const x = Math.min(e.clientX - rect.left, rect.width - 210);
      const y = Math.min(e.clientY - rect.top, rect.height - 300);
      setState({ x, y, price });
    }
    function onDown(e: MouseEvent) {
      if (!state) return;
      if (!(e.target as HTMLElement).closest("[data-chart-ctx-menu]")) setState(null);
    }
    host.addEventListener("contextmenu", onContext);
    window.addEventListener("mousedown", onDown);
    return () => {
      host.removeEventListener("contextmenu", onContext);
      window.removeEventListener("mousedown", onDown);
    };
  }, [adapter, state]);

  const close = () => setState(null);
  const emit = (intent: ChartOrderIntent) => {
    onIntent(intent);
    close();
  };

  const isBuyLimit = state && livePrice != null && state.price < livePrice;
  return (
    <div ref={hostRef} className="pointer-events-none absolute inset-0 z-30">
      <AnimatePresence>
        {state && sym && (
          <motion.div
            data-chart-ctx-menu
            initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.08 }}
            style={{ left: state.x, top: state.y }}
            className="pointer-events-auto absolute w-52 overflow-hidden rounded-lg border border-border/60 bg-popover shadow-2xl"
          >
            <div className="border-b border-border/50 px-3 py-2 text-[10px] uppercase text-muted-foreground">
              At <span className="font-mono font-semibold text-foreground">{fmtPrice(sym, state.price)}</span>
            </div>
            <Row icon={<TrendingUp className="h-3.5 w-3.5 text-emerald-500" />} label="Buy Market" onClick={() => emit({ kind: "buy_market" })} />
            <Row icon={<TrendingDown className="h-3.5 w-3.5 text-rose-500" />} label="Sell Market" onClick={() => emit({ kind: "sell_market" })} />
            <Divider />
            {/* Show Limit vs Stop based on whether click is above/below live */}
            <Row icon={<ArrowDownRight className="h-3.5 w-3.5 text-emerald-500" />} label={isBuyLimit ? "Buy Limit" : "Buy Stop"} onClick={() => emit({ kind: isBuyLimit ? "buy_limit" : "buy_stop", price: state.price })} />
            <Row icon={<ArrowUpRight className="h-3.5 w-3.5 text-rose-500" />} label={isBuyLimit ? "Sell Stop" : "Sell Limit"} onClick={() => emit({ kind: isBuyLimit ? "sell_stop" : "sell_limit", price: state.price })} />
            <Divider />
            <Row icon={<Bell className="h-3.5 w-3.5" />} label="Set Alert" onClick={() => emit({ kind: "alert", price: state.price })} />
            <Row icon={<Pencil className="h-3.5 w-3.5" />} label="Create Drawing" onClick={() => emit({ kind: "drawing", price: state.price })} />
            <Row
              icon={<Copy className="h-3.5 w-3.5" />}
              label="Copy Price"
              onClick={() => {
                try {
                  navigator.clipboard.writeText(fmtPrice(sym, state.price));
                  toast.success(`Copied ${fmtPrice(sym, state.price)}`);
                } catch { /* noop */ }
                close();
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Row({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
    >
      {icon}
      {label}
    </button>
  );
}

function Divider() {
  return <div className="my-0.5 h-px bg-border/60" />;
}

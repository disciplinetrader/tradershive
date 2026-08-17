/**
 * Right-click context menu on the chart. Uses the ChartAdapter coord transform
 * to know which price was clicked and hands an intent back to the caller.
 *
 * Shared by the live Trading Workspace and Replay Studio. Deliberately
 * presentational: it knows about a chart adapter and a price, and nothing about
 * order submission, tickets or buses. Everything surface-specific lives in the
 * caller's `onIntent`, which is what lets two very different surfaces mount the
 * same menu instead of growing one each.
 */
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Bell, Copy, Pencil, TrendingDown, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import type { ChartAdapter } from "@/lib/chart/adapter";
import type { SymbolMeta } from "@/lib/paper-trading/symbols";
import { inferOrderType } from "@/lib/chart/orders/model";
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

/** Where the menu was opened, in viewport coordinates. */
export type IntentOrigin = { clientX: number; clientY: number };

interface Props {
  adapter: ChartAdapter | null;
  sym: SymbolMeta | null;
  livePrice?: number;
  /**
   * Which rows to show. Defaults to all. Replay Studio passes a subset because
   * it has drawings but no alerts — a row that cannot do anything is worse
   * than a missing one.
   */
  allow?: ChartOrderIntent["kind"][];
  /** `origin` is the click point, so callers can open UI where the user looked. */
  onIntent: (intent: ChartOrderIntent, origin: IntentOrigin) => void;
}

export function ChartContextMenu({ adapter, sym, livePrice, allow, onIntent }: Props) {
  const [state, setState] = useState<{ x: number; y: number; price: number; clientX: number; clientY: number } | null>(null);
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
      setState({ x, y, price, clientX: e.clientX, clientY: e.clientY });
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
    if (state) onIntent(intent, { clientX: state.clientX, clientY: state.clientY });
    close();
  };

  const shows = (kind: ChartOrderIntent["kind"]) => !allow || allow.includes(kind);

  /**
   * Which pending type a click at this price means, from the canonical rule.
   *
   * This used to be `state.price < livePrice` inline — a second implementation
   * of a decision the order model already owns. It agreed with
   * `inferOrderType` in the common case and differed at the edges: no
   * tolerance band, so a click exactly at market offered a stop rather than a
   * market order, and a missing `livePrice` silently defaulted to stop instead
   * of declining to guess.
   *
   * `sym.pipSize` is the tick, so the band is one tick of the instrument
   * rather than a fraction plucked out of the air.
   */
  const buyType = state
    ? inferOrderType("buy", state.price, livePrice ?? null, sym?.pipSize ?? 0)
    : "market";
  const sellType = state
    ? inferOrderType("sell", state.price, livePrice ?? null, sym?.pipSize ?? 0)
    : "market";
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
            {shows("buy_market") && (
              <Row icon={<TrendingUp className="h-3.5 w-3.5 text-success" />} label="Buy Market" onClick={() => emit({ kind: "buy_market" })} />
            )}
            {shows("sell_market") && (
              <Row icon={<TrendingDown className="h-3.5 w-3.5 text-danger" />} label="Sell Market" onClick={() => emit({ kind: "sell_market" })} />
            )}
            <Divider />
            {/* Limit vs stop comes from the canonical `inferOrderType`. A click
                within a tick of the market resolves to "market", which is why
                these rows can read "Buy Market" twice — the pending row is
                telling you the click is not far enough away to rest an order. */}
            {buyType !== "market" && shows(buyType) && (
              <Row
                icon={<ArrowDownRight className="h-3.5 w-3.5 text-success" />}
                label={buyType === "buy_limit" ? "Buy Limit" : "Buy Stop"}
                onClick={() => emit({ kind: buyType, price: state.price })}
              />
            )}
            {sellType !== "market" && shows(sellType) && (
              <Row
                icon={<ArrowUpRight className="h-3.5 w-3.5 text-danger" />}
                label={sellType === "sell_limit" ? "Sell Limit" : "Sell Stop"}
                onClick={() => emit({ kind: sellType, price: state.price })}
              />
            )}
            <Divider />
            {shows("alert") && (
              <Row icon={<Bell className="h-3.5 w-3.5" />} label="Set Alert" onClick={() => emit({ kind: "alert", price: state.price })} />
            )}
            {shows("drawing") && (
              <Row icon={<Pencil className="h-3.5 w-3.5" />} label="Create Drawing" onClick={() => emit({ kind: "drawing", price: state.price })} />
            )}
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

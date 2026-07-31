/**
 * Open Position Tool positions — live management panel (Phase 3).
 *
 * The deterministic, keyboard-accessible surface for a filled position:
 * floating P/L, live R multiple, unrealised %, distance to stop and target,
 * plus Break-even and Close actions.
 *
 * Metrics are derived on every render from the canonical order and the live
 * market price, so they update continuously with the feed without writing
 * anything to persistence on each tick.
 */

import { ShieldCheck, XCircle, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { livePositionMetrics, type PositionOrder } from "@/lib/chart/orders/model";

interface Props {
  positions: PositionOrder[];
  closed?: PositionOrder[];
  marketPrice?: number | null;
  decimals?: number;
  onBreakEven: (orderId: string) => void;
  onClose: (orderId: string) => void;
  onArchive?: (orderId: string) => void;
  className?: string;
}

function fmt(v: number, decimals: number) {
  return v.toFixed(decimals);
}

function signed(v: number, decimals: number) {
  return `${v > 0 ? "+" : ""}${v.toFixed(decimals)}`;
}

export function OpenPositionsPanel({
  positions, closed = [], marketPrice, decimals = 4, onBreakEven, onClose, onArchive, className,
}: Props) {
  if (!positions.length && !closed.length) {
    return (
      <p className={cn("px-2.5 py-1.5 text-[11px] text-muted-foreground/80", className)} data-testid="open-positions-empty">
        No open chart positions. A pending Position Tool order opens automatically when price reaches your entry.
      </p>
    );
  }

  return (
    <div className={cn("space-y-1", className)} data-testid="open-positions-panel">
      {positions.map((o) => {
        const m = livePositionMetrics(o, marketPrice);
        const fill = o.fillPrice ?? o.entry;
        const up = (m?.move ?? 0) >= 0;
        const atBreakEven = o.stop === fill;
        return (
          <div
            key={o.id}
            data-testid="open-position-row"
            data-order-id={o.id}
            data-position-id={o.positionId}
            data-drawing-id={o.drawingId}
            className="rounded-md border border-border/50 bg-background/40 px-2 py-1.5 text-[11px]"
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "rounded px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-wide",
                  o.direction === "buy" ? "bg-success/15 text-success" : "bg-danger/15 text-danger",
                )}
              >
                {o.direction === "buy" ? "Long" : "Short"} · Open
              </span>
              <span className="font-mono tabular-nums">{o.symbol}</span>
              <span className="font-mono tabular-nums text-muted-foreground">@ {fmt(fill, decimals)}</span>
              <span
                data-testid="open-position-pnl"
                className={cn("ml-auto font-mono tabular-nums font-semibold", up ? "text-success" : "text-danger")}
              >
                {m ? signed(m.pnl, decimals) : "—"}
                {m?.perUnit ? <span className="ml-0.5 text-[9px] font-normal text-muted-foreground">/unit</span> : null}
              </span>
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
              <span data-testid="open-position-r">R {m ? signed(m.r, 2) : "—"}</span>
              <span data-testid="open-position-pct">{m ? signed(m.pct, 2) : "—"}%</span>
              <span>→ SL {m ? fmt(m.toStop, decimals) : "—"}</span>
              <span>→ TP {m ? fmt(m.toTarget, decimals) : "—"}</span>
              {o.slippage ? <span title="Slippage vs requested entry">slip {signed(-o.slippage, decimals)}</span> : null}
            </div>

            <div className="mt-1.5 flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-1.5 text-[10px]"
                disabled={atBreakEven}
                aria-label={`Move stop to break-even for ${o.symbol}`}
                data-testid="open-position-breakeven"
                onClick={() => onBreakEven(o.id)}
              >
                <ShieldCheck className="mr-1 h-3 w-3" /> {atBreakEven ? "At B/E" : "Break-even"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-1.5 text-[10px] text-danger hover:bg-danger/10"
                aria-label={`Close position ${o.symbol}`}
                data-testid="open-position-close"
                onClick={() => onClose(o.id)}
              >
                <XCircle className="mr-1 h-3 w-3" /> Close
              </Button>
              <span className="ml-auto text-[9px] text-muted-foreground/70">
                Drag the Stop or Target handle on the chart to modify.
              </span>
            </div>
          </div>
        );
      })}

      {closed.map((o) => (
        <div
          key={o.id}
          data-testid="closed-position-row"
          data-order-id={o.id}
          className="flex items-center gap-2 rounded-md border border-border/30 bg-background/20 px-2 py-1 text-[10px] text-muted-foreground"
        >
          <span className="rounded bg-muted/40 px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-wide">
            Closed
          </span>
          <span className="font-mono tabular-nums">{o.symbol}</span>
          <span className="font-mono tabular-nums">
            {fmt(o.fillPrice ?? o.entry, decimals)} → {fmt(o.closePrice ?? 0, decimals)}
          </span>
          <span className="text-[9px] uppercase tracking-wide">{(o.closeReason ?? "manual").replace("_", " ")}</span>
          <span
            className={cn("ml-auto font-mono tabular-nums font-semibold", (o.realizedPnl ?? 0) >= 0 ? "text-success" : "text-danger")}
            data-testid="closed-position-pnl"
          >
            {signed(o.realizedPnl ?? 0, decimals)} · {signed(o.realizedR ?? 0, 2)}R
          </span>
          {onArchive ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-5 px-1 text-[10px]"
              aria-label={`Archive closed position ${o.symbol}`}
              data-testid="closed-position-archive"
              onClick={() => onArchive(o.id)}
            >
              <Archive className="h-3 w-3" />
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

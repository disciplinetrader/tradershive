/**
 * Open Position Tool positions — live management panel (Phase 6).
 *
 * The deterministic, keyboard-accessible surface for a live position:
 * floating and realized P/L, floating / realized / total R, remaining risk,
 * locked profit, current RR, margin used and the distances to stop and
 * target — plus the full management toolkit: partial closes (25 / 50 / 75 /
 * custom), scale in, scale out, the take-profit ladder, break-even and
 * trailing.
 *
 * Everything shown here is DERIVED on each render from the canonical order
 * and the live market price (`advancedMetrics`), so metrics update with the
 * feed without writing to persistence on every tick, and the panel can never
 * disagree with the execution tape.
 */

import { useState } from "react";
import {
  ShieldCheck, XCircle, Archive, Plus, Minus, Target, TrendingUp, History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { PositionOrder } from "@/lib/chart/orders/model";
import { advancedMetrics } from "@/lib/chart/orders/position-manager";
import { EXECUTION_LABEL, orderedExecutions } from "@/lib/chart/orders/executions";
import { TRAILING_LABEL, type TrailingConfig, type TrailingMode } from "@/lib/chart/orders/trailing";

type ManageResultLike = { ok: boolean } | null | undefined;

interface Props {
  positions: PositionOrder[];
  closed?: PositionOrder[];
  marketPrice?: number | null;
  decimals?: number;
  onBreakEven: (orderId: string) => void;
  onClose: (orderId: string) => void;
  onArchive?: (orderId: string) => void;
  /** Phase 6 — reduce by a percentage of the remaining quantity. */
  onPartialClose?: (orderId: string, percent: number) => ManageResultLike;
  /** Phase 6 — manual, non-target-driven reduction. */
  onScaleOut?: (orderId: string, percent: number) => ManageResultLike;
  /** Phase 6 — add to the position at the market. */
  onScaleIn?: (orderId: string, percent: number) => ManageResultLike;
  /** Phase 6 — install the default 25/25/50 take-profit ladder. */
  onTakeProfits?: (orderId: string) => ManageResultLike;
  /** Phase 6 — configure the trailing engine. */
  onTrailing?: (orderId: string, cfg: TrailingConfig | null) => ManageResultLike;
  /** Phase 6 — arm automatic break-even at +NR. */
  onAutoBreakEven?: (orderId: string, triggerR: number | null) => ManageResultLike;
  className?: string;
}

function fmt(v: number, decimals: number) {
  return v.toFixed(decimals);
}

function signed(v: number, decimals: number) {
  return `${v > 0 ? "+" : ""}${v.toFixed(decimals)}`;
}

const PARTIALS = [25, 50, 75] as const;
const TRAIL_MODES: TrailingMode[] = ["fixed", "atr", "ema", "swing", "prev_candle"];
const AUTO_BE_TRIGGERS = [1, 1.5, 2] as const;

export function OpenPositionsPanel({
  positions, closed = [], marketPrice, decimals = 4, onBreakEven, onClose, onArchive,
  onPartialClose, onScaleOut, onScaleIn, onTakeProfits, onTrailing, onAutoBreakEven,
  className,
}: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [custom, setCustom] = useState<Record<string, string>>({});

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
        const m = advancedMetrics(o, marketPrice);
        const fill = o.fillPrice ?? o.entry;
        const entry = m?.averageEntry ?? fill;
        const up = (m?.totalPnl ?? 0) >= 0;
        const atBreakEven = o.stop === entry || typeof o.breakEvenAt === "number";
        const scaled = (m?.originalQuantity ?? 0) > 0 && (o.executions?.filter((e) => e.kind === "scale_in").length ?? 0) > 0;
        const legs = o.takeProfits ?? [];
        const filledLegs = legs.filter((l) => l.filledAt).length;
        const open = expanded === o.id;
        const customPct = custom[o.id] ?? "";

        const run = (fn?: (id: string, n: number) => ManageResultLike, percent?: number) => () => {
          if (!fn || percent === undefined) return;
          fn(o.id, percent);
        };

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
              <span className="font-mono tabular-nums text-muted-foreground" title={scaled ? "Weighted average entry" : "Fill price"}>
                @ {fmt(entry, decimals)}{scaled ? <span className="ml-0.5 text-[9px]">avg</span> : null}
              </span>
              {m && m.closedPercent > 0 ? (
                <span
                  data-testid="open-position-remaining"
                  className="rounded bg-muted/50 px-1 py-[1px] font-mono text-[9px] tabular-nums"
                  title="Remaining size after partial closes"
                >
                  {(100 - m.closedPercent).toFixed(0)}% left
                </span>
              ) : null}
              <span
                data-testid="open-position-pnl"
                className={cn("ml-auto font-mono tabular-nums font-semibold", up ? "text-success" : "text-danger")}
              >
                {m ? signed(m.totalPnl, decimals) : "—"}
                {m?.perUnit ? <span className="ml-0.5 text-[9px] font-normal text-muted-foreground">/unit</span> : null}
              </span>
            </div>

            <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[10px] tabular-nums text-muted-foreground sm:grid-cols-4">
              <span data-testid="open-position-r" title="Floating R">Float R {m ? signed(m.floatingR, 2) : "—"}</span>
              <span data-testid="open-position-realized-r" title="Realized R from closed legs">
                Real R {m ? signed(m.realizedR, 2) : "—"}
              </span>
              <span title="Floating + realized R">Total R {m ? signed(m.totalR, 2) : "—"}</span>
              <span title="Currency still at risk if the stop is hit">Risk {m ? fmt(m.remainingRisk, 2) : "—"}</span>
              <span title="Guaranteed result if the stop is hit from here" data-testid="open-position-locked">
                Locked {m ? signed(m.lockedProfit, 2) : "—"}
              </span>
              <span title="Reward to risk from the current price">RR {m ? m.currentRR.toFixed(2) : "—"}</span>
              <span>→ SL {m ? fmt(m.distanceToStop, decimals) : "—"}</span>
              <span>→ TP {m ? fmt(m.distanceToTarget, decimals) : "—"}</span>
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {PARTIALS.map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 font-mono text-[10px]"
                  disabled={!onPartialClose}
                  aria-label={`Close ${p} percent of ${o.symbol}`}
                  data-testid={`open-position-partial-${p}`}
                  onClick={run(onPartialClose, p)}
                >
                  <Minus className="mr-0.5 h-3 w-3" />{p}%
                </Button>
              ))}
              <Input
                value={customPct}
                onChange={(e) => setCustom((c) => ({ ...c, [o.id]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  const pct = Number(customPct);
                  if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return;
                  onPartialClose?.(o.id, pct);
                  setCustom((c) => ({ ...c, [o.id]: "" }));
                }}
                placeholder="%"
                inputMode="decimal"
                aria-label={`Custom close percent for ${o.symbol}`}
                data-testid="open-position-partial-custom"
                className="h-6 w-12 px-1 text-center font-mono text-[10px]"
              />
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-1.5 text-[10px]"
                disabled={!onScaleIn}
                aria-label={`Scale into ${o.symbol}`}
                data-testid="open-position-scale-in"
                onClick={run(onScaleIn, 50)}
              >
                <Plus className="mr-0.5 h-3 w-3" /> Scale in
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-1.5 text-[10px]"
                disabled={!onScaleOut}
                aria-label={`Scale out of ${o.symbol}`}
                data-testid="open-position-scale-out"
                onClick={run(onScaleOut, 33)}
              >
                <Minus className="mr-0.5 h-3 w-3" /> Scale out
              </Button>
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-1">
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
                className="h-6 px-1.5 text-[10px]"
                disabled={!onTakeProfits}
                aria-label={`Set take-profit ladder for ${o.symbol}`}
                data-testid="open-position-tp-ladder"
                onClick={() => onTakeProfits?.(o.id)}
              >
                <Target className="mr-1 h-3 w-3" />
                {legs.length ? `TP ${filledLegs}/${legs.length}` : "TP ladder"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className={cn("h-6 px-1.5 text-[10px]", o.trailing?.active && "text-primary")}
                disabled={!onTrailing}
                aria-label={`Toggle trailing stop for ${o.symbol}`}
                data-testid="open-position-trailing"
                onClick={() => onTrailing?.(
                  o.id,
                  o.trailing?.active
                    ? null
                    : { mode: "atr", active: true, atrMultiple: 2, period: 14 },
                )}
              >
                <TrendingUp className="mr-1 h-3 w-3" />
                {o.trailing?.active ? TRAILING_LABEL[o.trailing.mode] : "Trail"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className={cn("h-6 px-1.5 text-[10px]", o.autoBreakEvenR ? "text-primary" : undefined)}
                disabled={!onAutoBreakEven}
                aria-label={`Toggle automatic break-even for ${o.symbol}`}
                data-testid="open-position-auto-be"
                onClick={() => onAutoBreakEven?.(o.id, o.autoBreakEvenR ? null : AUTO_BE_TRIGGERS[0])}
              >
                <ShieldCheck className="mr-1 h-3 w-3" />
                {o.autoBreakEvenR ? `Auto B/E ${o.autoBreakEvenR}R` : "Auto B/E"}
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
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto h-6 px-1.5 text-[10px]"
                aria-expanded={open}
                aria-label={`Toggle execution history for ${o.symbol}`}
                data-testid="open-position-history-toggle"
                onClick={() => setExpanded(open ? null : o.id)}
              >
                <History className="mr-1 h-3 w-3" /> {(o.executions?.length ?? 0)} fills
              </Button>
            </div>

            {open ? (
              <ul
                className="mt-1.5 space-y-0.5 border-t border-border/40 pt-1.5 font-mono text-[10px] tabular-nums text-muted-foreground"
                data-testid="open-position-history"
              >
                {orderedExecutions(o.executions ?? []).map((e) => (
                  <li key={e.id} className="flex items-center gap-2" data-testid="execution-row">
                    <span className="w-[86px] shrink-0 text-[9px] uppercase tracking-wide">
                      {EXECUTION_LABEL[e.kind]}
                    </span>
                    <span>{fmt(e.price, decimals)}</span>
                    <span className="text-muted-foreground/70">×{e.quantity.toFixed(2)}</span>
                    {typeof e.realizedPnl === "number" ? (
                      <span className={cn(e.realizedPnl >= 0 ? "text-success" : "text-danger")}>
                        {signed(e.realizedPnl, decimals)}
                      </span>
                    ) : null}
                    <span className="ml-auto text-[9px] text-muted-foreground/60">
                      {new Date(e.time).toLocaleTimeString()}
                    </span>
                  </li>
                ))}
                {!(o.executions?.length) ? <li>No execution history recorded.</li> : null}
              </ul>
            ) : null}

            <p className="mt-1 text-[9px] text-muted-foreground/70">
              Drag the Stop or Target handle on the chart to modify.
            </p>
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

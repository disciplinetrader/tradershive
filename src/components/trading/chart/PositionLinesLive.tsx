/**
 * Live position overlay — TradingView-style on-chart position management.
 *
 * Each open position renders as:
 *   • Solid ENTRY line with a compact axis chip; hovering expands it to show
 *     side, size, floating P/L and R, plus inline actions (break-even,
 *     partial close, close).
 *   • Dashed red STOP-LOSS and green TAKE-PROFIT lines with the same
 *     hover-to-expand chips, draggable to re-price.
 *   • Very faint risk / reward tint between entry and each level.
 *   • Grey ghost line at the original level while dragging.
 *
 * All persistence still flows through the existing paper-trading server
 * functions (`modifyTrade`, `closeTrade`, `moveToBreakEven`,
 * `partialCloseTrade`) — visualization only, no trading-logic changes.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import type { ChartAdapter } from "@/lib/chart/adapter";
import type { SymbolMeta } from "@/lib/paper-trading/symbols";
import {
  modifyTrade, closeTrade, moveToBreakEven, partialCloseTrade,
  listExitsForTrades, updateExitLeg,
} from "@/lib/paper-trading.functions";
import { floatingPnl, fmtPrice } from "@/lib/trading/plan-math";
import { pnl as computePnl } from "@/lib/paper-trading/calculations";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Shield, Scissors, MoreHorizontal, X } from "lucide-react";
import { OrderLine, OrderLabel, LineAction, DragTooltip, AXIS_INSET } from "./order-line-ui";
import { useChartGeometry } from "./use-chart-geometry";

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

type ExitLegRow = {
  id: string; trade_id: string; kind: string; idx: number;
  price: number | string; percent: number | string; action: string; status: string;
};

/**
 * Where an unset stop or target sits until the trader places it.
 *
 * A position without protection still gets a handle, revealed the moment the
 * pointer comes near the position and draggable on sight. That is the
 * TradingView interaction: hover, grab, drop — one motion, no separate "add"
 * step, and the handle you grab is the line you end up with.
 *
 * 0.5% of entry rather than a fixed pip count, so the default is sensible on
 * both a 64,000 crypto price and a 1.10 FX rate. The precise number matters
 * far less than being on the correct side of entry and immediately draggable.
 */
function defaultLevel(
  sym: SymbolMeta, direction: "long" | "short", entry: number, kind: "sl" | "tp",
): number {
  const offset = Math.abs(entry) * 0.005;
  // The stop sits against the trade, the target with it.
  const against = direction === "long" ? -1 : 1;
  const raw = kind === "sl" ? entry + against * offset : entry - against * offset;
  const p = Math.pow(10, sym.decimals);
  return Math.max(1 / p, Math.round(raw * p) / p);
}

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
  const [hover, setHover] = useState<string | null>(null);
  /** Position the pointer is currently over — reveals its unset level handles. */
  const [hoveredTrade, setHoveredTrade] = useState<string | null>(null);

  // Local overrides during drag so UI doesn't flicker between server updates
  const [overrides, setOverrides] = useState<Record<string, { sl?: number; tp?: number }>>({});

  const modify = useMutation({
    mutationFn: async (v: { id: string; stop_loss?: number | null; take_profit?: number | null }) =>
      modifyFn({ data: v }) as unknown as Promise<{ ok: true }>,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["paper", "trades"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to modify trade"),
  });

  // Staged exits for every position drawn here. `paper_trades.take_profit`
  // holds only the primary level, so without this a laddered position shows
  // one target line on the chart while the ticket lists several (CH-1).
  const exitsFn = useServerFn(listExitsForTrades);
  const legFn = useServerFn(updateExitLeg);
  const tradeIds = useMemo(() => trades.map((t) => t.id).sort(), [trades]);
  const { data: allExits } = useQuery({
    queryKey: ["paper", "exits", "byTrades", tradeIds.join(",")],
    queryFn: () => exitsFn({ data: { trade_ids: tradeIds } }) as unknown as Promise<ExitLegRow[]>,
    enabled: tradeIds.length > 0,
    refetchInterval: 10_000,
  });

  /** Pending take-profit legs per trade, in ladder order. */
  const legsByTrade = useMemo(() => {
    const m = new Map<string, ExitLegRow[]>();
    for (const e of allExits ?? []) {
      if (e.kind !== "take_profit" || e.status !== "pending") continue;
      const list = m.get(e.trade_id) ?? [];
      list.push(e);
      m.set(e.trade_id, list);
    }
    for (const list of m.values()) list.sort((a, b) => a.idx - b.idx);
    return m;
  }, [allExits]);

  const syncLeg = useMutation({
    mutationFn: async (v: { id: string; price: number }) =>
      legFn({ data: v }) as unknown as Promise<{ ok: true }>,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["paper", "exits"] }),
    // Deliberately quiet: the drag itself already succeeded against
    // `paper_trades`. A failed ladder sync is worth a console note, not a
    // toast that implies the drag did not take.
    onError: (e) => console.warn("[PositionLinesLive] leg 1 sync failed:", e),
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

  // Every pixel coordinate below is derived from `adapter.priceToY`, which is
  // only valid for the axis as it stood when it ran. `geometry` changes on
  // zoom, pan, price-scale drag, timeframe switch and resize, and MUST stay in
  // the `rendered` dependency list — without it the memo serves stale
  // coordinates and the lines detach from the prices they claim to mark.
  const geometry = useChartGeometry(adapter, hostRef);
  useEffect(() => { force((n) => n + 1); }, [tick, trades, livePrice, geometry]);

  /**
   * Reveal a position's level handles while the pointer is near it.
   *
   * Deliberately a pointer listener rather than an invisible hover band in the
   * DOM: a band wide enough to be useful would sit on top of the plot and
   * swallow crosshair movement, drawing-tool clicks and chart panning at that
   * height. Measuring the pointer instead leaves the chart completely
   * untouched. `HOVER_BAND_PX` is generous because the target is a 1px line.
   */
  useEffect(() => {
    const el = hostRef.current;
    if (!el || !adapter || !sym) return;
    /** Padding beyond the outermost level, so the band is easy to stay inside. */
    const HOVER_PAD_PX = 28;
    const onMove = (e: PointerEvent) => {
      if (drag) return;                    // keep handles up for the whole drag
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
        setHoveredTrade((h) => (h === null ? h : null));
        return;
      }
      let best: string | null = null;
      let bestDist = Infinity;
      for (const t of trades) {
        // The band spans the whole position — entry AND both levels, including
        // the default positions the unset handles occupy. Measuring from the
        // entry line alone made the handles unreachable: they are drawn 0.5%
        // away, which is well outside any sane band, so moving the pointer
        // toward a handle to grab it made that handle disappear.
        const ys: number[] = [];
        const push = (p: number | null | undefined) => {
          if (p == null || !Number.isFinite(p)) return;
          const v = adapter.priceToY(p);
          if (v != null && Number.isFinite(v)) ys.push(v);
        };
        const entry = Number(t.entry_price);
        push(entry);
        push(t.stop_loss ?? defaultLevel(sym, t.direction, entry, "sl"));
        push(t.take_profit ?? defaultLevel(sym, t.direction, entry, "tp"));
        if (!ys.length) continue;

        const lo = Math.min(...ys) - HOVER_PAD_PX;
        const hi = Math.max(...ys) + HOVER_PAD_PX;
        if (y < lo || y > hi) continue;

        // Overlapping positions: prefer whichever entry line is nearest.
        const ey = adapter.priceToY(entry) ?? y;
        const d = Math.abs(ey - y);
        if (d < bestDist) { bestDist = d; best = t.id; }
      }
      setHoveredTrade((h) => (h === best ? h : best));
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [adapter, sym, trades, drag, geometry]);

  /**
   * Start a drag on a level handle.
   *
   * `seed` writes the starting price into `overrides` up front, which is what
   * makes a placeholder commit on a plain click: `onUp` persists whatever the
   * override holds, so a click with no movement lands the level at its default
   * instead of doing nothing. Real levels are not seeded — a stray click on an
   * existing line should not re-issue a write for the price it already has.
   */
  const beginDrag = (tradeId: string, handle: "sl" | "tp", price: number, seed: boolean) => {
    if (seed) {
      setOverrides((o) => ({ ...o, [tradeId]: { ...o[tradeId], [handle]: price } }));
    }
    setDrag({ tradeId, handle, price });
  };

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

        // The primary target line and ladder leg 1 are the same level shown
        // once. Writing only the scalar column would leave the leg holding a
        // price the chart no longer displays — invisible drift into the table
        // reports will read.
        if (drag.handle === "tp") {
          const leg1 = legsByTrade.get(drag.tradeId)?.[0];
          if (leg1) syncLeg.mutate({ id: leg1.id, price: px });
        }
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
  }, [drag, adapter, overrides, modify, legsByTrade, syncLeg]);

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
      // `null`, not 0, when there is no stop. R is P&L measured in units of
      // risk, so with no risk basis it is undefined — and a `: 0` fallback
      // rendered "+0.00R" next to a non-zero P&L, which is arithmetically
      // impossible and read as a real measurement.
      const rMult = riskAmt > 0 ? pnl / riskAmt : null;
      const pts = livePrice != null ? pointsDelta(t.direction, t.entry_price, livePrice) : 0;
      // Legs beyond the first. Leg 1 is the same level as `take_profit` and is
      // already drawn as the draggable Target line, so drawing it again would
      // stack two lines on one price.
      const ladder = legsByTrade.get(t.id) ?? [];
      const extraLegs = ladder.slice(1).map((leg) => {
        const price = Number(leg.price);
        const share = Number(leg.percent) / 100;
        return {
          id: leg.id,
          idx: leg.idx,
          price,
          percent: Number(leg.percent),
          action: leg.action,
          y: adapter.priceToY(price),
          // Reward for this leg alone — it closes only its own share of the
          // position, so the full-size figure would overstate it.
          reward: Math.abs(computePnl(sym, t.direction, t.entry_price, price, t.lot_size * share)),
        };
      });

      // With a ladder, the primary target closes only ITS share of the
      // position, not all of it — so the full-size reward figure that is
      // correct for a single target overstates leg 1. Without a ladder the
      // share is 1 and every number below is unchanged.
      const primaryShare = ladder.length > 1 ? Number(ladder[0].percent) / 100 : 1;
      const rewardPrimary = rewardAmt * primaryShare;
      // The plan's total reward is the whole ladder, which is what R:R should
      // be read against — not leg 1 alone and not leg 1 at full size.
      const rewardTotal = rewardPrimary + extraLegs.reduce((sum, l) => sum + l.reward, 0);
      const rr = riskAmt > 0 && rewardTotal > 0 ? rewardTotal / riskAmt : 0;

      // Unset levels still get a handle, at the default distance, so every
      // open position carries a stop and a target control at all times.
      const slPlaceholder = sl == null ? defaultLevel(sym, t.direction, t.entry_price, "sl") : null;
      const tpPlaceholder = tp == null ? defaultLevel(sym, t.direction, t.entry_price, "tp") : null;

      return {
        t,
        ladderSize: ladder.length,
        extraLegs,
        rewardPrimary,
        rewardTotal,
        slPlaceholder,
        tpPlaceholder,
        slPlaceholderY: slPlaceholder != null ? adapter.priceToY(slPlaceholder) : null,
        tpPlaceholderY: tpPlaceholder != null ? adapter.priceToY(tpPlaceholder) : null,
        entryY: adapter.priceToY(t.entry_price),
        slY: sl != null ? adapter.priceToY(sl) : null,
        tpY: tp != null ? adapter.priceToY(tp) : null,
        slGhostY: ov.sl != null && t.stop_loss != null ? adapter.priceToY(t.stop_loss) : null,
        tpGhostY: ov.tp != null && t.take_profit != null ? adapter.priceToY(t.take_profit) : null,
        slPrice: sl,
        tpPrice: tp,
        priceY: livePrice != null ? adapter.priceToY(livePrice) : null,
        pnl, rMult, pts, riskAmt, rewardAmt, rr,
      };
    });
    // `geometry` is load-bearing: it is what re-projects every line when the
    // axis moves. Removing it silently detaches the overlay from the chart.
  }, [adapter, sym, trades, overrides, livePrice, legsByTrade, geometry]);

  if (!sym) return null;

  // `overflow-hidden` below is load-bearing, not cosmetic.
  //
  // Every child here is positioned by `adapter.priceToY`, and lightweight-charts
  // EXTRAPOLATES that coordinate for prices outside the visible range — a level
  // below the viewport returns a y greater than the chart's height, not null.
  // Un-clipped, those badges paint wherever they land: after dragging the
  // chart/blotter divider the SL and TP price pills rendered on top of the
  // Positions table, far outside the chart. Clipping to the host makes that
  // structurally impossible for every overlay child, current and future,
  // rather than needing a bounds check at each of the eight label sites.
  return (
    <div ref={hostRef} className="pointer-events-none absolute inset-0 z-10 select-none overflow-hidden">
      {rendered.map((row) => {
        const {
          t, entryY, slY, tpY, slGhostY, tpGhostY, slPrice, tpPrice,
          pnl, rMult, pts, riskAmt, rewardAmt, rr, ladderSize, extraLegs,
          rewardPrimary, rewardTotal,
          slPlaceholder, tpPlaceholder, slPlaceholderY, tpPlaceholderY,
        } = row;
        if (entryY == null) return null;
        const slActive = drag?.tradeId === t.id && drag.handle === "sl";
        const tpActive = drag?.tradeId === t.id && drag.handle === "tp";
        const isLong = t.direction === "long";
        const winning = pnl >= 0;
        const entryTone = isLong ? "buy" : "sell";
        const entryExpanded = hover === `${t.id}:entry`;
        // Unset-level handles are revealed by hovering the position, and stay
        // up for the duration of a drag even once the pointer leaves the band.
        const levelsVisible = hoveredTrade === t.id || drag?.tradeId === t.id;

        return (
          <div key={t.id} data-position-line={t.id}>
            {/* Reward zone — entry ↔ TP */}
            {tpY != null && (
              <div
                className="absolute bg-success/[0.05]"
                style={{
                  left: 0,
                  right: AXIS_INSET,
                  top: Math.min(entryY, tpY),
                  height: Math.max(0, Math.abs(tpY - entryY)),
                }}
              />
            )}
            {/* Risk zone — entry ↔ SL */}
            {slY != null && (
              <div
                className="absolute bg-danger/[0.05]"
                style={{
                  left: 0,
                  right: AXIS_INSET,
                  top: Math.min(entryY, slY),
                  height: Math.max(0, Math.abs(slY - entryY)),
                }}
              />
            )}

            {/* ENTRY */}
            <OrderLine y={entryY} tone={entryTone} solid />
            <OrderLabel
              y={entryY}
              tone={entryTone}
              expanded={entryExpanded}
              draggable={false}
              testId={`entry-line-${t.id}`}
              title={`${isLong ? "Long" : "Short"} ${t.lot_size}`}
              onMouseEnter={() => setHover(`${t.id}:entry`)}
              onMouseLeave={() => setHover((h) => (h === `${t.id}:entry` ? null : h))}
              label={
                <>
                  <span className="font-semibold text-foreground">
                    {isLong ? "Long" : "Short"} {t.lot_size}
                  </span>
                  <span className={cn("font-bold tabular-nums", winning ? "text-success" : "text-danger")}>
                    {fmtMoney(pnl)}
                  </span>
                  <span
                    className={cn(
                      "tabular-nums",
                      rMult == null ? "text-muted-foreground" : winning ? "text-success" : "text-danger",
                    )}
                    title={rMult == null ? "No stop loss set — R cannot be measured" : undefined}
                  >
                    {rMult == null ? "—R" : `${rMult >= 0 ? "+" : ""}${rMult.toFixed(2)}R`}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {pts >= 0 ? "+" : ""}{pts.toFixed(sym.decimals)}
                  </span>
                  {rr > 0 && <span className="tabular-nums text-muted-foreground">1:{rr.toFixed(2)}</span>}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        data-line-action
                        type="button"
                        title="Quick actions"
                        className="grid h-[15px] w-[15px] place-items-center rounded-[2px] bg-muted text-muted-foreground transition hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                      >
                        <MoreHorizontal className="h-2.5 w-2.5" />
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
                  {/* Keyboard-reachable path to the same defaults the ghost
                      handles offer. The handles are pointer-only, so these
                      stay as the accessible equivalent rather than as the
                      primary way in. */}
                  {t.stop_loss == null && (
                    <LineAction
                      wide
                      label="Add stop loss — drag the line to adjust"
                      onClick={() => modify.mutate({
                        id: t.id,
                        stop_loss: defaultLevel(sym, t.direction, t.entry_price, "sl"),
                      })}
                    >
                      +SL
                    </LineAction>
                  )}
                  {t.take_profit == null && (
                    <LineAction
                      wide
                      label="Add take profit — drag the line to adjust"
                      onClick={() => modify.mutate({
                        id: t.id,
                        take_profit: defaultLevel(sym, t.direction, t.entry_price, "tp"),
                      })}
                    >
                      +TP
                    </LineAction>
                  )}
                  <LineAction
                    label="Close position"
                    danger
                    onClick={() => livePrice != null && close.mutate({ id: t.id, exit_price: livePrice })}
                  >
                    <X className="h-2.5 w-2.5" />
                  </LineAction>
                </>
              }
              axis={<span className="tabular-nums">{fmtPrice(sym, t.entry_price)}</span>}
            />

            {/* STOP LOSS */}
            {slY != null && slPrice != null && (
              <>
                {slActive && slGhostY != null && <GhostLine y={slGhostY} />}
                <OrderLine y={slY} tone="stop" active={slActive} />
                <OrderLabel
                  y={slY}
                  tone="stop"
                  expanded={slActive || hover === `${t.id}:sl`}
                  testId={`sl-line-${t.id}`}
                  title="Drag to move Stop Loss"
                  onMouseEnter={() => setHover(`${t.id}:sl`)}
                  onMouseLeave={() => setHover((h) => (h === `${t.id}:sl` ? null : h))}
                  onPointerDown={(e) => {
                    if ((e.target as HTMLElement).closest("[data-line-action]")) return;
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    beginDrag(t.id, "sl", slPrice, false);
                  }}
                  label={
                    <>
                      <span className="font-semibold text-foreground">Stop</span>
                      <span className="tabular-nums text-danger">{fmtMoney(-riskAmt)}</span>
                      <LineAction
                        label="Remove stop loss"
                        danger
                        onClick={() => modify.mutate({ id: t.id, stop_loss: null })}
                      >
                        <X className="h-2.5 w-2.5" />
                      </LineAction>
                    </>
                  }
                  axis={<span className="tabular-nums">{fmtPrice(sym, slPrice)}</span>}
                />
              </>
            )}

            {/* TAKE PROFIT */}
            {tpY != null && tpPrice != null && (
              <>
                {tpActive && tpGhostY != null && <GhostLine y={tpGhostY} />}
                <OrderLine y={tpY} tone="profit" active={tpActive} />
                <OrderLabel
                  y={tpY}
                  tone="profit"
                  expanded={tpActive || hover === `${t.id}:tp`}
                  testId={`tp-line-${t.id}`}
                  title="Drag to move Take Profit"
                  onMouseEnter={() => setHover(`${t.id}:tp`)}
                  onMouseLeave={() => setHover((h) => (h === `${t.id}:tp` ? null : h))}
                  onPointerDown={(e) => {
                    if ((e.target as HTMLElement).closest("[data-line-action]")) return;
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    beginDrag(t.id, "tp", tpPrice, false);
                  }}
                  label={
                    <>
                      <span className="font-semibold text-foreground">
                        {ladderSize > 1 ? "TP1" : "Target"}
                      </span>
                      <span className="tabular-nums text-success">{fmtMoney(rewardPrimary)}</span>
                      <LineAction
                        label="Remove take profit"
                        danger
                        onClick={() => modify.mutate({ id: t.id, take_profit: null })}
                      >
                        <X className="h-2.5 w-2.5" />
                      </LineAction>
                    </>
                  }
                  axis={<span className="tabular-nums">{fmtPrice(sym, tpPrice)}</span>}
                />
              </>
            )}

            {/* UNSET LEVEL HANDLES — revealed by hovering the position, then
                immediately draggable. One motion: hover, grab, drop.

                These were briefly always on screen. That was built to a
                mis-stated spec and it cluttered the chart — TradingView keeps
                them hidden until the position is hovered, which is what
                `levelsVisible` reproduces. A level that IS set stays drawn at
                all times above, because it is a live resting order.

                No click reveals anything and no line spawns somewhere else:
                the handle you grab is the line you get. */}
            {levelsVisible && slY == null && slPlaceholderY != null && slPlaceholder != null && (
              <>
                <OrderLine y={slPlaceholderY} tone="stop" ghost />
                <OrderLabel
                  y={slPlaceholderY}
                  tone="stop"
                  expanded={hover === `${t.id}:sl-add`}
                  ghost
                  testId={`sl-add-${t.id}`}
                  title="Drag to set a stop loss, or click to place it here"
                  onMouseEnter={() => setHover(`${t.id}:sl-add`)}
                  onMouseLeave={() => setHover((h) => (h === `${t.id}:sl-add` ? null : h))}
                  onPointerDown={(e) => {
                    if ((e.target as HTMLElement).closest("[data-line-action]")) return;
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    beginDrag(t.id, "sl", slPlaceholder, true);
                  }}
                  label={
                    <>
                      <span className="font-semibold text-muted-foreground">Add stop</span>
                      <span className="tabular-nums text-muted-foreground">drag to place</span>
                    </>
                  }
                  axis={<span className="tabular-nums opacity-80">+ SL</span>}
                />
              </>
            )}
            {levelsVisible && tpY == null && tpPlaceholderY != null && tpPlaceholder != null && (
              <>
                <OrderLine y={tpPlaceholderY} tone="profit" ghost />
                <OrderLabel
                  y={tpPlaceholderY}
                  tone="profit"
                  expanded={hover === `${t.id}:tp-add`}
                  ghost
                  testId={`tp-add-${t.id}`}
                  title="Drag to set a take profit, or click to place it here"
                  onMouseEnter={() => setHover(`${t.id}:tp-add`)}
                  onMouseLeave={() => setHover((h) => (h === `${t.id}:tp-add` ? null : h))}
                  onPointerDown={(e) => {
                    if ((e.target as HTMLElement).closest("[data-line-action]")) return;
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    beginDrag(t.id, "tp", tpPlaceholder, true);
                  }}
                  label={
                    <>
                      <span className="font-semibold text-muted-foreground">Add target</span>
                      <span className="tabular-nums text-muted-foreground">drag to place</span>
                    </>
                  }
                  axis={<span className="tabular-nums opacity-80">+ TP</span>}
                />
              </>
            )}

            {/* STAGED EXITS — TP2…TPn (CH-1) */}
            {extraLegs.map((leg) => leg.y == null ? null : (
              <div key={leg.id}>
                <OrderLine y={leg.y} tone="profit" />
                <OrderLabel
                  y={leg.y}
                  tone="profit"
                  expanded={hover === `${t.id}:leg:${leg.id}`}
                  title={`Take profit ${leg.idx} — ${leg.percent}% of the position. Edit in the order ticket.`}
                  onMouseEnter={() => setHover(`${t.id}:leg:${leg.id}`)}
                  onMouseLeave={() => setHover((h) => (h === `${t.id}:leg:${leg.id}` ? null : h))}
                  label={
                    <>
                      <span className="font-semibold text-foreground">TP{leg.idx}</span>
                      <span className="tabular-nums text-muted-foreground">{leg.percent}%</span>
                      <span className="tabular-nums text-success">{fmtMoney(leg.reward)}</span>
                      {leg.action !== "none" && (
                        <span className="text-muted-foreground">
                          {leg.action === "break_even" ? "→ BE" : "→ trail"}
                        </span>
                      )}
                    </>
                  }
                  axis={<span className="tabular-nums">{fmtPrice(sym, leg.price)}</span>}
                />
              </div>
            ))}

            {/* Drag tooltip — live impact math */}
            {(slActive || tpActive) && (
              <DragTooltip
                y={(slActive ? slY : tpY) ?? 0}
                tone={slActive ? "stop" : "profit"}
                title={slActive ? "Moving Stop" : "Moving Target"}
              >
                <Row label="Price" value={fmtPrice(sym, (slActive ? slPrice : tpPrice) ?? 0)} />
                <Row label="R:R" value={rr > 0 ? `1 : ${rr.toFixed(2)}` : "—"} />
                <Row
                  label={ladderSize > 1 ? "Potential profit (all legs)" : "Potential profit"}
                  value={fmtMoney(rewardTotal)}
                  tone="success"
                />
                <Row label="Potential loss" value={fmtMoney(-riskAmt)} tone="danger" />
                <Row label="Floating P/L" value={fmtMoney(pnl)} tone={winning ? "success" : "danger"} />
              </DragTooltip>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Grey reference line showing the pre-drag level. */
function GhostLine({ y }: { y: number }) {
  return (
    <div
      className="pointer-events-none absolute h-px opacity-50"
      style={{
        top: y,
        left: 0,
        right: AXIS_INSET,
        backgroundImage:
          "repeating-linear-gradient(to right, hsl(var(--muted-foreground)) 0 4px, transparent 4px 8px)",
      }}
    />
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

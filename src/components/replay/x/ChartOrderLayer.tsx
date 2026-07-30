/**
 * REPLAY STUDIO X — Phase 2 · ChartOrderLayer.
 *
 * A DOM overlay painted on top of the replay chart that turns the chart
 * itself into the order-entry surface:
 *
 *   • armed draft   → draggable Entry / SL / TP with shaded risk & reward
 *                     zones and a live R:R read-out
 *   • open position → draggable SL / TP, live P/L, and an inline ribbon
 *                     (Close · Break-even · Reverse · Partial)
 *   • pending order → trigger line with a cancel affordance
 *
 * The layer is renderer-agnostic: every price ↔ pixel conversion goes
 * through `ChartAdapter.priceToY` / `yToPrice`, so swapping the chart
 * engine requires no change here.
 *
 * Performance notes:
 *   – reprojection is driven by `adapter.subscribeGeometry` + a
 *     ResizeObserver and coalesced into one rAF per frame
 *   – pointer drags mutate a ref and repaint through the same rAF, so a
 *     drag never blocks or pauses playback
 *   – execution is delegated to the replay context, untouched
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Ban, CircleDot, Minimize2, RefreshCw, Shield, X } from "lucide-react";
import type { ChartAdapter } from "@/lib/chart/adapter";
import { cn } from "@/lib/utils";
import { useReplay } from "../context";
import { useChartTrading } from "./chart-trading-context";
import {
  computeTradeMetrics,
  formatMoney,
  formatPrice,
  formatRR,
  openPnl,
  openR,
  priceDigits,
  validateDraft,
  validateLevel,
  type ChartSide,
  type LevelKind,
} from "@/lib/replay/chart-trading";
import type { ReplayTrade } from "@/lib/replay/types";

const C = {
  entry: "var(--rx-accent)",
  long: "var(--rx-long)",
  short: "var(--rx-short)",
  warn: "var(--rx-warn)",
};

/** Right gutter kept clear so lines never run under the price scale. */
const SCALE_GUTTER = 76;

type DragState = { kind: LevelKind; target: "draft" | string; price: number } | null;

export function ChartOrderLayer({
  adapter,
  enabled = true,
}: {
  adapter: ChartAdapter | null;
  enabled?: boolean;
}) {
  const {
    openTrades,
    pendingOrders,
    cancelPendingOrder,
    modifyTrade,
    closeTrade,
    partialClose,
    moveToBreakEven,
    reversePosition,
    settings,
  } = useReplay();
  const { price, draft, moveLevel, cancel, confirm, busy, selectedId, select, armAt } = useChartTrading();

  const hostRef = useRef<HTMLDivElement | null>(null);
  const [, repaint] = useState(0);
  const frame = useRef<number | null>(null);
  const schedule = useCallback(() => {
    if (frame.current != null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      repaint((n) => n + 1);
    });
  }, []);

  // ── Reprojection: geometry changes, resize, candle pushes ───────────
  useEffect(() => {
    if (!adapter) return;
    const off = adapter.subscribeGeometry?.(schedule);
    return () => off?.();
  }, [adapter, schedule]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    return () => ro.disconnect();
  }, [schedule]);

  useEffect(schedule, [schedule, price, openTrades, pendingOrders, draft]);

  // ── Drag plumbing ───────────────────────────────────────────────────
  const dragRef = useRef<DragState>(null);
  const [dragTag, setDragTag] = useState<string | null>(null);

  const yToPrice = useCallback(
    (clientY: number) => {
      const rect = hostRef.current?.getBoundingClientRect();
      if (!rect || !adapter) return null;
      const p = adapter.yToPrice(clientY - rect.top);
      return p != null && Number.isFinite(p) && p > 0 ? p : null;
    },
    [adapter],
  );

  const startDrag = useCallback(
    (e: React.PointerEvent, target: "draft" | string, kind: LevelKind, current: number) => {
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      dragRef.current = { kind, target, price: current };
      setDragTag(`${target}:${kind}`);
    },
    [],
  );

  useEffect(() => {
    if (!dragTag) return;

    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const next = yToPrice(e.clientY);
      if (next == null) return;
      d.price = next;
      if (d.target === "draft") moveLevel(d.kind, next);
      else schedule();
    };

    const onUp = async () => {
      const d = dragRef.current;
      dragRef.current = null;
      setDragTag(null);
      if (!d || d.target === "draft") return;
      const trade = openTrades.find((t) => t.id === d.target);
      if (!trade) return;
      const ok = validateLevel(trade.direction as ChartSide, d.kind, trade.entry_price, d.price);
      if (!ok) {
        toast.error(d.kind === "sl" ? "Stop would sit on the wrong side of entry" : "Target would sit on the wrong side of entry");
        schedule();
        return;
      }
      try {
        await modifyTrade(trade.id, d.kind === "sl" ? { stop_loss: d.price } : { take_profit: d.price });
      } catch {
        toast.error("Could not update the level");
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragTag, yToPrice, moveLevel, openTrades, modifyTrade, schedule]);

  /** Live value for a level while it is being dragged. */
  const liveLevel = useCallback((target: string, kind: LevelKind, fallback: number | null) => {
    const d = dragRef.current;
    if (d && d.target === target && d.kind === kind) return d.price;
    return fallback;
  }, []);

  const yOf = useCallback((p: number | null | undefined) => {
    if (p == null || !adapter) return null;
    const y = adapter.priceToY(p);
    return y != null && Number.isFinite(y) ? y : null;
  }, [adapter]);

  const digits = useMemo(() => priceDigits(price || 1), [price]);

  // Alt-click on empty chart space arms a draft right where you clicked.
  const onBackgroundDown = useCallback(
    (e: React.PointerEvent) => {
      if (!e.altKey) return;
      const p = yToPrice(e.clientY);
      if (p == null) return;
      armAt(p >= price ? "short" : "long", p);
    },
    [armAt, price, yToPrice],
  );

  if (!enabled) return null;

  const draftMetrics = draft
    ? computeTradeMetrics({
        side: draft.side,
        entry: draft.entry,
        sl: draft.sl,
        tp: draft.tp,
        lot: draft.lot,
        commissionPerLot: settings.commissionPerLot,
      })
    : null;
  const draftCheck = draft ? validateDraft(draft) : null;

  return (
    <div
      ref={hostRef}
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
      onPointerDown={onBackgroundDown}
      style={{ pointerEvents: draft ? "auto" : "none" }}
      data-testid="chart-order-layer"
    >
      {/* ── Open positions ─────────────────────────────────────── */}
      {openTrades.map((t) => (
        <PositionArtifact
          key={t.id}
          trade={t}
          price={price}
          digits={digits}
          selected={selectedId === t.id}
          onSelect={() => select(selectedId === t.id ? null : t.id)}
          yOf={yOf}
          sl={liveLevel(t.id, "sl", t.stop_loss)}
          tp={liveLevel(t.id, "tp", t.take_profit)}
          onDragLevel={(e, kind, current) => startDrag(e, t.id, kind, current)}
          onClose={() => closeTrade(t.id).catch(() => toast.error("Close failed"))}
          onBreakEven={() => moveToBreakEven(t.id).catch(() => toast.error("Break-even failed"))}
          onReverse={() => reversePosition(t.id).catch(() => toast.error("Reverse failed"))}
          onPartial={(f) => partialClose(t.id, f).catch(() => toast.error("Partial close failed"))}
        />
      ))}

      {/* ── Pending orders ─────────────────────────────────────── */}
      {pendingOrders.map((o) => {
        const y = yOf(o.entryPrice);
        if (y == null) return null;
        return (
          <div key={o.id} className="absolute left-0 flex items-center" style={{ top: y - 9, right: SCALE_GUTTER }}>
            <Line color={C.warn} dashed />
            <Chip color={C.warn}>
              {o.direction === "long" ? "BUY" : "SELL"} {o.orderType.toUpperCase()} {o.lotSize} @ {formatPrice(o.entryPrice, digits)}
            </Chip>
            <button
              type="button"
              aria-label="Cancel pending order"
              onClick={() => cancelPendingOrder(o.id)}
              className="pointer-events-auto ml-1 grid h-[18px] w-[18px] place-items-center rounded-[var(--rx-radius-sm)] border border-[var(--rx-line-strong)] bg-[var(--rx-surface-1)] text-[var(--rx-text-dim)] hover:text-[var(--rx-text)]"
            >
              <Ban className="h-3 w-3" />
            </button>
          </div>
        );
      })}

      {/* ── Draft order ────────────────────────────────────────── */}
      {draft && draftMetrics ? (
        <DraftArtifact
          side={draft.side}
          entry={draft.entry}
          sl={draft.sl}
          tp={draft.tp}
          lot={draft.lot}
          orderType={draft.orderType}
          digits={digits}
          metrics={draftMetrics}
          invalidReason={draftCheck?.ok ? null : draftCheck?.reason ?? null}
          busy={busy}
          yOf={yOf}
          onDragLevel={(e, kind, current) => startDrag(e, "draft", kind, current)}
          onCancel={cancel}
          onConfirm={() => void confirm()}
        />
      ) : null}
    </div>
  );
}

/* ══ Position ══════════════════════════════════════════════════ */

function PositionArtifact({
  trade,
  price,
  digits,
  selected,
  onSelect,
  yOf,
  sl,
  tp,
  onDragLevel,
  onClose,
  onBreakEven,
  onReverse,
  onPartial,
}: {
  trade: ReplayTrade;
  price: number;
  digits: number;
  selected: boolean;
  onSelect: () => void;
  yOf: (p: number | null | undefined) => number | null;
  sl: number | null;
  tp: number | null;
  onDragLevel: (e: React.PointerEvent, kind: LevelKind, current: number) => void;
  onClose: () => void;
  onBreakEven: () => void;
  onReverse: () => void;
  onPartial: (fraction: number) => void;
}) {
  const isLong = trade.direction === "long";
  const side = isLong ? C.long : C.short;
  const yEntry = yOf(trade.entry_price);
  const ySl = yOf(sl);
  const yTp = yOf(tp);
  const pnl = openPnl(trade, price);
  const r = openR({ ...trade, stop_loss: sl }, price);

  if (yEntry == null) return null;

  return (
    <>
      <Zone from={yEntry} to={ySl} tone="short" />
      <Zone from={yEntry} to={yTp} tone="long" />

      {/* Entry */}
      <div className="absolute left-0 flex items-center" style={{ top: yEntry - 9, right: SCALE_GUTTER }}>
        <Line color={side} />
        <button
          type="button"
          onClick={onSelect}
          className="pointer-events-auto"
          aria-label={`${trade.direction} position ${trade.lot_size} lots`}
        >
          <Chip color={side} strong>
            {isLong ? "LONG" : "SHORT"} {trade.lot_size} · {formatPrice(trade.entry_price, digits)}
          </Chip>
        </button>
        <span
          className="ml-1 rounded-[var(--rx-radius-sm)] border border-[var(--rx-line)] bg-[var(--rx-surface-1)] px-1 text-[10px] font-semibold tabular-nums"
          style={{ color: pnl >= 0 ? C.long : C.short }}
        >
          {formatMoney(pnl)}
          {r != null ? ` · ${formatRR(r)}` : ""}
        </span>
      </div>

      {/* Stop */}
      {ySl != null && sl != null ? (
        <Level
          y={ySl}
          color={C.short}
          label="SL"
          value={formatPrice(sl, digits)}
          onPointerDown={(e) => onDragLevel(e, "sl", sl)}
        />
      ) : null}

      {/* Target */}
      {yTp != null && tp != null ? (
        <Level
          y={yTp}
          color={C.long}
          label="TP"
          value={formatPrice(tp, digits)}
          onPointerDown={(e) => onDragLevel(e, "tp", tp)}
        />
      ) : null}

      {/* Ribbon */}
      {selected ? (
        <div
          className="pointer-events-auto absolute flex items-center gap-1 rounded-[var(--rx-radius-md)] border border-[var(--rx-line-strong)] bg-[var(--rx-overlay)] p-1 shadow-[var(--rx-shadow-float)]"
          style={{ top: yEntry + 14, right: SCALE_GUTTER }}
        >
          <RibbonBtn onClick={onClose} label="Close position (X)"><X className="h-3 w-3" /> Close</RibbonBtn>
          <RibbonBtn onClick={onBreakEven} label="Move stop to break-even (E)"><Shield className="h-3 w-3" /> BE</RibbonBtn>
          <RibbonBtn onClick={onReverse} label="Reverse position (R)"><RefreshCw className="h-3 w-3" /> Reverse</RibbonBtn>
          <RibbonBtn onClick={() => onPartial(0.25)} label="Close 25%"><Minimize2 className="h-3 w-3" /> 25%</RibbonBtn>
          <RibbonBtn onClick={() => onPartial(0.5)} label="Close 50%"><Minimize2 className="h-3 w-3" /> 50%</RibbonBtn>
        </div>
      ) : null}
    </>
  );
}

/* ══ Draft ═════════════════════════════════════════════════════ */

function DraftArtifact({
  side,
  entry,
  sl,
  tp,
  lot,
  orderType,
  digits,
  metrics,
  invalidReason,
  busy,
  yOf,
  onDragLevel,
  onCancel,
  onConfirm,
}: {
  side: ChartSide;
  entry: number;
  sl: number | null;
  tp: number | null;
  lot: number;
  orderType: string;
  digits: number;
  metrics: ReturnType<typeof computeTradeMetrics>;
  invalidReason: string | null;
  busy: boolean;
  yOf: (p: number | null | undefined) => number | null;
  onDragLevel: (e: React.PointerEvent, kind: LevelKind, current: number) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const yEntry = yOf(entry);
  const ySl = yOf(sl);
  const yTp = yOf(tp);
  if (yEntry == null) return null;

  const boxTop = Math.max(8, Math.min((ySl ?? yEntry) + 8, (yTp ?? yEntry) + 8, yEntry + 8));

  return (
    <>
      <Zone from={yEntry} to={ySl} tone="short" />
      <Zone from={yEntry} to={yTp} tone="long" />

      <Level
        y={yEntry}
        color={C.entry}
        label={`${side === "long" ? "BUY" : "SELL"} ${orderType.toUpperCase()}`}
        value={formatPrice(entry, digits)}
        onPointerDown={(e) => onDragLevel(e, "entry", entry)}
        strong
      />
      {ySl != null && sl != null ? (
        <Level y={ySl} color={C.short} label="SL" value={formatPrice(sl, digits)} onPointerDown={(e) => onDragLevel(e, "sl", sl)} />
      ) : null}
      {yTp != null && tp != null ? (
        <Level y={yTp} color={C.long} label="TP" value={formatPrice(tp, digits)} onPointerDown={(e) => onDragLevel(e, "tp", tp)} />
      ) : null}

      {/* Live R:R read-out */}
      <div
        className="pointer-events-auto absolute w-[186px] rounded-[var(--rx-radius-md)] border border-[var(--rx-line-strong)] bg-[var(--rx-overlay)] p-1.5 text-[10px] shadow-[var(--rx-shadow-float)]"
        style={{ top: boxTop, left: 12 }}
      >
        <div className="mb-1 flex items-center justify-between">
          <span
            className="rounded-[var(--rx-radius-sm)] px-1 py-[1px] text-[9px] font-bold uppercase tracking-wider text-black"
            style={{ background: side === "long" ? C.long : C.short }}
          >
            {side === "long" ? "Long" : "Short"} {lot}
          </span>
          <span className="font-semibold tabular-nums">{formatRR(metrics.rr)}</span>
        </div>
        <Row label="Risk" value={formatMoney(metrics.expectedLoss)} tone="short" />
        <Row label="Reward" value={formatMoney(metrics.expectedProfit)} tone="long" />
        <Row label="Stop dist" value={formatPrice(metrics.riskDistance, digits)} />
        <Row label="Target dist" value={formatPrice(metrics.rewardDistance, digits)} />
        {metrics.commission > 0 ? <Row label="Commission" value={formatMoney(metrics.commission)} /> : null}
        {invalidReason ? (
          <div className="mt-1 rounded-[var(--rx-radius-sm)] px-1 py-[2px] text-[9px] font-medium" style={{ color: C.warn }}>
            {invalidReason}
          </div>
        ) : null}
        <div className="mt-1.5 flex gap-1">
          <button
            type="button"
            disabled={busy || !!invalidReason}
            onClick={onConfirm}
            className="h-[22px] flex-1 rounded-[var(--rx-radius-sm)] text-[10px] font-bold uppercase tracking-wider text-black disabled:opacity-40"
            style={{ background: side === "long" ? C.long : C.short }}
          >
            {busy ? "Sending…" : "Confirm ⏎"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="h-[22px] rounded-[var(--rx-radius-sm)] border border-[var(--rx-line-strong)] px-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--rx-text-dim)] hover:text-[var(--rx-text)]"
          >
            Esc
          </button>
        </div>
      </div>
    </>
  );
}

/* ══ Atoms ═════════════════════════════════════════════════════ */

function Line({ color, dashed }: { color: string; dashed?: boolean }) {
  return dashed ? (
    <div
      className="h-px flex-1"
      style={{ backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 5px, transparent 5px 10px)` }}
    />
  ) : (
    <div className="h-px flex-1" style={{ background: color }} />
  );
}

function Chip({
  children,
  color,
  strong,
}: {
  children: React.ReactNode;
  color: string;
  strong?: boolean;
}) {
  return (
    <span
      className={cn(
        "ml-1.5 inline-flex h-[18px] items-center whitespace-nowrap rounded-[var(--rx-radius-sm)] px-1.5 text-[10px] font-semibold uppercase tracking-wider tabular-nums",
        strong ? "text-black" : "",
      )}
      style={strong ? { background: color } : { border: `1px solid ${color}`, color }}
    >
      {children}
    </span>
  );
}

function Level({
  y,
  color,
  label,
  value,
  onPointerDown,
  strong,
}: {
  y: number;
  color: string;
  label: string;
  value: string;
  onPointerDown: (e: React.PointerEvent) => void;
  strong?: boolean;
}) {
  return (
    <div className="absolute left-0 flex items-center" style={{ top: y - 9, right: SCALE_GUTTER }}>
      <Line color={color} dashed={!strong} />
      <span
        role="slider"
        tabIndex={0}
        aria-label={`${label} level`}
        aria-valuenow={Number(value) || 0}
        aria-valuemin={0}
        aria-valuemax={Number.MAX_SAFE_INTEGER}
        onPointerDown={onPointerDown}
        className="pointer-events-auto ml-1.5 inline-flex h-[18px] cursor-ns-resize select-none items-center gap-1 rounded-[var(--rx-radius-sm)] px-1.5 text-[10px] font-semibold uppercase tracking-wider tabular-nums text-black"
        style={{ background: color }}
      >
        <CircleDot className="h-2.5 w-2.5 opacity-70" />
        {label} {value}
      </span>
    </div>
  );
}

function Zone({ from, to, tone }: { from: number; to: number | null; tone: "long" | "short" }) {
  if (to == null) return null;
  const top = Math.min(from, to);
  const height = Math.abs(to - from);
  if (height < 1) return null;
  return (
    <div
      className="absolute left-0 rounded-[1px]"
      style={{
        top,
        height,
        right: SCALE_GUTTER,
        background: tone === "long" ? "oklch(0.74 0.17 152 / 0.10)" : "oklch(0.66 0.2 22 / 0.10)",
      }}
    />
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "long" | "short" }) {
  return (
    <div className="flex items-center justify-between py-[1px]">
      <span className="text-[var(--rx-text-faint)]">{label}</span>
      <span className="font-medium tabular-nums" style={{ color: tone === "long" ? C.long : tone === "short" ? C.short : undefined }}>
        {value}
      </span>
    </div>
  );
}

function RibbonBtn({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="inline-flex h-[20px] items-center gap-1 rounded-[var(--rx-radius-sm)] border border-[var(--rx-line)] bg-[var(--rx-surface-1)] px-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--rx-text-dim)] hover:border-[var(--rx-line-strong)] hover:text-[var(--rx-text)]"
    >
      {children}
    </button>
  );
}

/**
 * Shared TradingView-style on-chart order line primitives.
 *
 * TradingView renders orders as a thin line spanning the plot with a compact
 * pill pinned to the price axis. The descriptive text and the action buttons
 * (modify / cancel) only appear while the row is hovered or dragged, so the
 * chart stays clean.
 *
 * Presentation only — no trading logic lives here.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Horizontal inset (px) reserved for the price scale on the right. */
export const AXIS_INSET = 64;

export type LineTone = "buy" | "sell" | "stop" | "profit";

export const TONE_COLOR: Record<LineTone, string> = {
  buy: "#2962ff",
  sell: "#f23645",
  stop: "#f23645",
  profit: "#089981",
};

/** Thin horizontal order line. Dashed for resting orders, solid for entries. */
export function OrderLine({
  y,
  tone,
  solid,
  active,
  ghost,
}: {
  y: number;
  tone: LineTone;
  solid?: boolean;
  active?: boolean;
  ghost?: boolean;
}) {
  const color = TONE_COLOR[tone];
  return (
    <div
      className="pointer-events-none absolute h-px"
      style={{
        top: y,
        left: 0,
        right: AXIS_INSET,
        opacity: ghost ? 0.45 : 1,
        backgroundImage: solid
          ? undefined
          : `repeating-linear-gradient(to right, ${color} 0 5px, transparent 5px 10px)`,
        backgroundColor: solid ? color : undefined,
        boxShadow: active ? `0 0 6px ${color}` : undefined,
      }}
    />
  );
}

/**
 * Axis-anchored pill. `label` shows only on hover/drag (TradingView behaviour),
 * `axis` is the always-visible compact chip, `actions` are the hover controls.
 */
export function OrderLabel({
  y,
  tone,
  expanded,
  label,
  axis,
  actions,
  onPointerDown,
  title,
  draggable = true,
  onMouseEnter,
  onMouseLeave,
}: {
  y: number;
  tone: LineTone;
  expanded: boolean;
  label: ReactNode;
  axis: ReactNode;
  actions?: ReactNode;
  onPointerDown?: (e: React.PointerEvent) => void;
  title?: string;
  draggable?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const color = TONE_COLOR[tone];
  return (
    <div
      data-dense
      className="pointer-events-auto absolute flex items-center justify-end"
      style={{
        top: y - 10,
        left: 0,
        right: AXIS_INSET,
        height: 20,
        cursor: draggable ? "ns-resize" : "default",
        touchAction: "none",
      }}
      onPointerDown={onPointerDown}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      title={title}
    >
      <div className="flex items-stretch overflow-hidden rounded-[3px] text-[10px] leading-none">
        {/* Descriptive text + actions — hover only */}
        <div
          className={cn(
            "flex items-center overflow-hidden whitespace-nowrap transition-all duration-150 ease-out",
            expanded ? "max-w-[420px] opacity-100" : "max-w-0 opacity-0",
          )}
        >
          <div
            className="flex items-center gap-1.5 rounded-l-[3px] border border-r-0 bg-background/95 px-1.5 py-[3px] font-mono backdrop-blur"
            style={{ borderColor: color }}
          >
            {label}
            {actions}
          </div>
        </div>
        {/* Always-visible axis chip */}
        <div
          className="flex items-center px-1.5 py-[3px] font-mono font-semibold text-white"
          style={{ backgroundColor: color }}
        >
          {axis}
        </div>
      </div>
    </div>
  );
}

/** Small square hover control used inside the expanded label. */
export function LineAction({
  onClick,
  label,
  children,
  danger,
  /** Text actions ("+SL") need room; icon actions stay square. */
  wide,
}: {
  onClick: () => void;
  label: string;
  children: ReactNode;
  danger?: boolean;
  wide?: boolean;
}) {
  return (
    <button
      data-line-action
      type="button"
      aria-label={label}
      title={label}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
      className={cn(
        "grid h-[15px] place-items-center rounded-[2px] bg-muted text-muted-foreground transition focus-visible:outline-none focus-visible:ring-2",
        wide ? "w-auto px-1 text-[9px] font-semibold leading-none" : "w-[15px]",
        danger
          ? "hover:bg-danger hover:text-white focus-visible:ring-danger/40"
          : "hover:bg-primary hover:text-primary-foreground focus-visible:ring-primary/40",
      )}
    >
      {children}
    </button>
  );
}

/** Tooltip that follows a drag, showing the live target price. */
export function DragTooltip({
  y,
  tone,
  title,
  children,
}: {
  y: number;
  tone: LineTone;
  title: string;
  children: ReactNode;
}) {
  return (
    <div
      className="pointer-events-none absolute z-30 min-w-[170px] rounded-md border border-border/60 bg-background/95 p-2 font-mono text-[10px] shadow-2xl backdrop-blur"
      style={{ top: y + 14, right: AXIS_INSET + 8 }}
    >
      <div className="mb-1 flex items-center justify-between border-b border-border/40 pb-1">
        <span
          className="rounded px-1.5 py-[1px] text-[9px] font-bold uppercase text-white"
          style={{ backgroundColor: TONE_COLOR[tone] }}
        >
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

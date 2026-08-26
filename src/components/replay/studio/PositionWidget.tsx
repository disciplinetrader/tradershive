/**
 * The position widget — everything you can do to an open position, on one row,
 * anchored to its entry line.
 *
 *     LONG  ◄TP  ◄SL   +12.40   —   2.00   ✕
 *
 * WHY THIS EXISTS, AND WHAT IT REPLACES
 *
 * Studio used to offer an absent stop or target as a GHOST LINE: a dashed
 * full-width line parked 0.5% from the entry, draggable into place. It was
 * ported from `PositionLinesLive`, and on a real chart it is actively
 * misleading — a horizontal line at a specific price reads as a level that has
 * been SET, which is the exact appearance the optional-levels pivot existed to
 * remove. A trader glancing at the chart saw protection that was not there.
 *
 * So: an unset level draws NOTHING. The only thing on screen is this widget,
 * and the controls on it are buttons, not prices. A line appears when, and only
 * when, the trader drags one outward and creates a real level.
 *
 * WHY IT IS NOT `order-line-ui`'s `OrderLabel`
 *
 * `OrderLabel` collapses its content to `max-w-0 opacity-0` unless hovered,
 * leaving only the price chip. That is right for a LEVEL — price is what you
 * need at a glance — and wrong for a position, whose P/L, size and close button
 * should not require a hover to discover. The X close has existed in Studio all
 * along; it was invisible behind that collapse, which is why it read as
 * missing. `OrderLabel` is shared with Trading Workspace, whose behaviour is
 * confirmed good, so it is left untouched and this is Studio's own.
 *
 * WHY THE BUTTONS ARE NOT `LineAction`
 *
 * `LineAction` calls `e.stopPropagation()` on pointer-down (order-line-ui.tsx)
 * — correct for a click target sitting on a draggable line, and fatal for a
 * control whose whole purpose IS to start a drag. Reusing it would have meant
 * changing the shared component. These buttons are local, and deliberately
 * larger than `LineAction`'s 15px square: they are drag origins, and a 15px
 * drag origin on a line that moves with the chart is a poor target for a real
 * mouse.
 */
import type { ReactNode } from "react";
import { X } from "lucide-react";

import { AXIS_INSET } from "@/components/trading/chart/order-line-ui";
import { cn } from "@/lib/utils";

export interface PositionWidgetProps {
  /** Vertical position of the entry line, in host pixels. */
  y: number;
  direction: "buy" | "sell";
  /** Remaining position size, already resolved. `null` renders an em-dash. */
  qty: number | null;
  /** Floating P/L in account currency. */
  pnl: number;
  /** Pre-formatted R, or an em-dash when there is no stop to measure against. */
  rText: string;
  /** True while the session is live — a finished session shows no controls. */
  live: boolean;
  /** Absent levels get a control; present ones already have a draggable line. */
  hasStop: boolean;
  hasTarget: boolean;
  /**
   * Begin creating a level.
   *
   * The widget does NOT decide where the level goes: it hands back the gesture
   * and the drag decides. There is no honest default distance, and a
   * zero-distance level is rejected by `validateOrder` — so a click that never
   * moves creates nothing at all.
   */
  onStartLevel: (handle: "stop" | "target") => (e: React.PointerEvent) => void;
  onClose: () => void;
  testId?: string;
}

function money(v: number): string {
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${Math.abs(v).toFixed(2)}`;
}

function Cell({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <span className={cn("px-1 py-[5px] tabular-nums", className)} title={title}>
      {children}
    </span>
  );
}

/**
 * A control on the widget row.
 *
 * 18px tall with real horizontal padding rather than `LineAction`'s 15px
 * square. These are grabbed and dragged, not tapped, and the row they sit on
 * tracks a price line that moves under the pointer as the chart advances.
 */
function WidgetButton({
  children, label, testId, danger, onClick, onPointerDown,
}: {
  children: ReactNode;
  label: string;
  testId?: string;
  danger?: boolean;
  onClick?: () => void;
  onPointerDown?: (e: React.PointerEvent) => void;
}) {
  return (
    <button
      data-line-action
      data-testid={testId}
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      onPointerDown={onPointerDown}
      className={cn(
        "grid h-[18px] min-w-[22px] place-items-center rounded-[2px] bg-muted px-1 text-[9px] font-semibold leading-none text-muted-foreground transition focus-visible:outline-none focus-visible:ring-2",
        onPointerDown ? "cursor-ns-resize" : "cursor-pointer",
        danger
          ? "hover:bg-danger hover:text-white focus-visible:ring-danger/40"
          : "hover:bg-primary hover:text-primary-foreground focus-visible:ring-primary/40",
      )}
    >
      {children}
    </button>
  );
}

export function PositionWidget({
  y, direction, qty, pnl, rText, live, hasStop, hasTarget,
  onStartLevel, onClose, testId,
}: PositionWidgetProps) {
  const isLong = direction === "buy";

  return (
    <div
      data-testid={testId}
      data-dense
      className="pointer-events-auto absolute flex items-center justify-end"
      style={{ top: y - 13, left: 0, right: AXIS_INSET, height: 26, touchAction: "none" }}
    >
      <div
        className={cn(
          "flex items-center gap-1 overflow-hidden rounded-[3px] border bg-background/95 px-1 font-mono text-[10px] leading-none backdrop-blur",
          isLong ? "border-success/70" : "border-danger/70",
        )}
      >
        <Cell className="font-semibold" title={`${isLong ? "Long" : "Short"} position`}>
          {isLong ? "LONG" : "SHORT"}
        </Cell>

        {live && !hasTarget ? (
          <WidgetButton
            label="Drag away from the entry to set a take profit"
            testId={testId ? `${testId}-tp` : undefined}
            onPointerDown={onStartLevel("target")}
          >
            ◄TP
          </WidgetButton>
        ) : null}
        {live && !hasStop ? (
          <WidgetButton
            label="Drag away from the entry to set a stop loss"
            testId={testId ? `${testId}-sl` : undefined}
            onPointerDown={onStartLevel("stop")}
          >
            ◄SL
          </WidgetButton>
        ) : null}

        <Cell className={pnl >= 0 ? "text-success" : "text-danger"} title="Floating profit and loss">
          {money(pnl)}
        </Cell>

        {/* No stop means no risk to measure against, so there is no R — never
            "0.00R", which reads as a real (flat) result. */}
        <Cell className="text-muted-foreground" title="Floating R">{rText}</Cell>

        <Cell className="text-muted-foreground" title="Position size in units">
          {qty == null || !Number.isFinite(qty) ? "—" : qty.toFixed(2)}
        </Cell>

        {live ? (
          <WidgetButton
            danger
            label="Close this position now"
            testId={testId ? `${testId}-close` : undefined}
            onClick={onClose}
          >
            <X className="h-2.5 w-2.5" />
          </WidgetButton>
        ) : null}
      </div>
    </div>
  );
}

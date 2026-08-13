/**
 * Margin usage — how much of the account's funds are committed once this order
 * is placed.
 *
 * A normal paper account rejects on one condition only: required margin above
 * available funds. That block is invisible until you hit it, so this bar is the
 * warning system in front of it — it fills toward red as committed margin
 * approaches equity, and reaching the end IS the rejection point.
 *
 * Informational. It never blocks anything.
 */
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/paper-trading/calculations";

export function MarginUsageBar({
  usedMargin,
  requiredMargin,
  equity,
  currency = "USD",
  className,
}: {
  /** Margin already committed by open positions. */
  usedMargin: number;
  /** Margin this order would additionally commit. */
  requiredMargin: number;
  /** Account equity the two are measured against. */
  equity: number;
  currency?: string;
  className?: string;
}) {
  if (!(equity > 0)) return null;

  const usedPct = Math.max(0, (usedMargin / equity) * 100);
  const orderPct = Math.max(0, (requiredMargin / equity) * 100);
  const totalPct = usedPct + orderPct;

  // Over 100% is exactly the state the margin gate refuses, so it gets the
  // danger treatment rather than being silently clipped to a full bar.
  const tone =
    totalPct >= 100 ? "danger" : totalPct >= 80 ? "danger" : totalPct >= 50 ? "warning" : "ok";

  const barColor =
    tone === "danger" ? "bg-danger" : tone === "warning" ? "bg-warning" : "bg-primary";
  const textColor =
    tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-muted-foreground";

  // Widths are clamped for layout; the numbers above stay truthful.
  const usedW = Math.min(100, usedPct);
  const orderW = Math.min(Math.max(0, 100 - usedW), orderPct);

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground">Margin usage</span>
        <span className={cn("font-mono tabular-nums font-medium", textColor)}>
          {totalPct.toFixed(1)}%
        </span>
      </div>
      <div
        className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={Math.round(totalPct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Margin usage after this order"
      >
        {/* Already committed */}
        <div className="h-full bg-muted-foreground/40" style={{ width: `${usedW}%` }} />
        {/* This order */}
        <div className={cn("h-full transition-all", barColor)} style={{ width: `${orderW}%` }} />
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>
          Open {formatCurrency(usedMargin, currency)} · This order{" "}
          {formatCurrency(requiredMargin, currency)}
        </span>
        <span>of {formatCurrency(equity, currency)}</span>
      </div>
      {totalPct >= 100 && (
        <div className="text-[10px] font-medium text-danger">
          Exceeds available funds — this order will be rejected.
        </div>
      )}
    </div>
  );
}

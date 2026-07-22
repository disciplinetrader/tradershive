import { formatCurrency, formatNumber } from "@/lib/paper-trading/calculations";
import type { computeChartMetrics } from "@/lib/chart-trading/math";
import { cn } from "@/lib/utils";

type Metrics = ReturnType<typeof computeChartMetrics>;

interface Props {
  metrics: Metrics;
  side: "long" | "short";
  currency?: string;
  className?: string;
}

/**
 * Compact floating R/R panel — shown while dragging Entry / SL / TP or
 * while building a draft order.
 */
export function RiskRewardBox({ metrics, side, currency = "USD", className }: Props) {
  const isLong = side === "long";
  const rr = metrics.rr;
  return (
    <div
      className={cn(
        "pointer-events-none absolute z-30 w-[220px] rounded-md border bg-background/95 p-2 text-[11px] shadow-lg backdrop-blur",
        className,
      )}
    >
      <div className="mb-1 flex items-center justify-between">
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-white",
            isLong ? "bg-success" : "bg-danger",
          )}
        >
          {isLong ? "Long" : "Short"}
        </span>
        <span className="font-mono text-muted-foreground">RR {formatNumber(rr, 2)}</span>
      </div>
      <Row label="Risk" value={formatCurrency(metrics.riskAmount, currency)} tone="danger" />
      <Row label="Reward" value={formatCurrency(metrics.rewardAmount, currency)} tone="success" />
      <Row label="Risk %" value={`${formatNumber(metrics.riskPct, 2)}%`} />
      <Row label="Margin" value={formatCurrency(metrics.margin, currency)} />
      <Row label="Notional" value={formatCurrency(metrics.notional, currency)} />
      <Row label="Commission" value={formatCurrency(metrics.commission, currency)} />
      <Row label="Spread cost" value={formatCurrency(metrics.spreadCost, currency)} />
      <div className="my-1 h-px bg-border" />
      <Row
        label="Potential profit"
        value={formatCurrency(metrics.potentialProfit, currency)}
        tone="success"
        strong
      />
      <Row
        label="Potential loss"
        value={formatCurrency(metrics.potentialLoss, currency)}
        tone="danger"
        strong
      />
    </div>
  );
}

function Row({
  label,
  value,
  tone,
  strong,
}: {
  label: string;
  value: string;
  tone?: "success" | "danger";
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-[1px]">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-mono",
          strong && "font-bold",
          tone === "success" && "text-success",
          tone === "danger" && "text-danger",
        )}
      >
        {value}
      </span>
    </div>
  );
}

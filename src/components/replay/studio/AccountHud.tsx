/**
 * Phase A · Replay Studio account HUD.
 *
 * A read-only projection: realized P&L comes from the canonical closed-trade
 * store, open P&L from `positionMetricsFor`. Nothing here prices or executes.
 * Peak equity is tracked locally only to render the drawdown figure.
 */
import { useEffect, useRef, useState } from "react";
import { positionMetricsFor } from "@/lib/chart/orders/service";
import { cn } from "@/lib/utils";
import { useReplayStudio } from "./context";

function money(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down" | "warn";
}) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-mono text-[12px] tabular-nums",
          tone === "up" && "text-emerald-500",
          tone === "down" && "text-destructive",
          tone === "warn" && "text-amber-500",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function AccountHud({ className }: { className?: string }) {
  const { startingBalance, trades, positions, price } = useReplayStudio();

  const realized = trades.reduce((sum, t) => sum + (Number.isFinite(t.netPnl) ? t.netPnl : 0), 0);
  const open = positions.reduce((sum, p) => sum + (positionMetricsFor(p, price)?.totalPnl ?? 0), 0);

  const balance = startingBalance == null ? null : startingBalance + realized;
  const equity = balance == null ? null : balance + open;

  // Peak equity is presentation-only state for the drawdown readout.
  const peakRef = useRef<number | null>(null);
  const [peak, setPeak] = useState<number | null>(null);
  useEffect(() => {
    if (equity == null) return;
    if (peakRef.current == null || equity > peakRef.current) {
      peakRef.current = equity;
      setPeak(equity);
    }
  }, [equity]);

  const drawdown = peak != null && equity != null && peak > 0 ? Math.max(0, (peak - equity) / peak) : null;

  return (
    <div className={cn("flex items-center gap-4 md:gap-5", className)}>
      <Stat label="Balance" value={money(balance)} />
      <Stat label="Equity" value={money(equity)} tone={equity != null && balance != null && equity < balance ? "down" : undefined} />
      <Stat label="Open P&L" value={money(open)} tone={open > 0 ? "up" : open < 0 ? "down" : undefined} />
      <Stat label="Realized" value={money(realized)} tone={realized > 0 ? "up" : realized < 0 ? "down" : undefined} />
      <Stat
        label="Drawdown"
        value={drawdown == null ? "—" : `${(drawdown * 100).toFixed(2)}%`}
        tone={drawdown != null && drawdown > 0.05 ? "warn" : undefined}
      />
      <Stat label="Trades" value={`${trades.length}`} />
    </div>
  );
}

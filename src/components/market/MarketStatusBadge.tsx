import { useEffect, useState } from "react";
import { useMarketStatus } from "@/lib/market-data/hooks";
import type { MarketKind } from "@/lib/market-data/types";
import { cn } from "@/lib/utils";

const LABEL: Record<string, string> = {
  open: "OPEN", closed: "CLOSED", pre_market: "PRE-MARKET",
  after_hours: "AFTER HOURS", holiday: "HOLIDAY", maintenance: "MAINT",
};
const TONE: Record<string, string> = {
  open: "bg-success/15 text-success border-success/30",
  closed: "bg-danger/10 text-danger border-danger/25",
  pre_market: "bg-warning/10 text-warning border-warning/25",
  after_hours: "bg-info/10 text-info border-info/25",
  holiday: "bg-primary/10 text-primary border-primary/25",
  maintenance: "bg-muted text-muted-foreground border-border",
};

export function MarketStatusBadge({ market, className }: { market: MarketKind; className?: string }) {
  const status = useMarketStatus(market);
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
      TONE[status] ?? TONE.closed, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full",
        status === "open" ? "bg-emerald-400 animate-pulse" : "bg-current opacity-60")} />
      {LABEL[status] ?? status}
    </span>
  );
}

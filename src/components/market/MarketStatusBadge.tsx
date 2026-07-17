import { useEffect, useState } from "react";
import { useMarketStatus } from "@/lib/market-data/hooks";
import type { MarketKind } from "@/lib/market-data/types";
import { cn } from "@/lib/utils";

const LABEL: Record<string, string> = {
  open: "OPEN", closed: "CLOSED", pre_market: "PRE-MARKET",
  after_hours: "AFTER HOURS", holiday: "HOLIDAY", maintenance: "MAINT",
};
const TONE: Record<string, string> = {
  open: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  closed: "bg-rose-500/10 text-rose-300 border-rose-500/25",
  pre_market: "bg-amber-500/10 text-amber-300 border-amber-500/25",
  after_hours: "bg-blue-500/10 text-blue-300 border-blue-500/25",
  holiday: "bg-purple-500/10 text-purple-300 border-purple-500/25",
  maintenance: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
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

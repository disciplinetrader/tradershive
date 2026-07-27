import { useEffect, useState } from "react";
import { marketData } from "@/lib/market-data/engine";
import type { ProviderStatus } from "@/lib/market-data/types";
import { cn } from "@/lib/utils";

// Consolidated 3-state indicator: 🟢 Live / 🟡 Updating / 🔴 Disconnected.
type Simplified = "live" | "updating" | "disconnected";

function simplify(s: ProviderStatus): Simplified {
  if (s === "connected") return "live";
  if (s === "connecting") return "updating";
  return "disconnected";
}

const LABEL: Record<Simplified, string> = {
  live: "Live",
  updating: "Updating",
  disconnected: "Disconnected",
};
const DOT: Record<Simplified, string> = {
  live: "bg-success",
  updating: "bg-warning animate-pulse",
  disconnected: "bg-danger",
};
const TEXT: Record<Simplified, string> = {
  live: "text-success",
  updating: "text-warning",
  disconnected: "text-danger",
};

export function ProviderStatusStrip({ className }: { className?: string }) {
  const [rows, setRows] = useState(() => marketData.health());
  useEffect(() => {
    marketData.init();
    const tick = () => setRows(marketData.health());
    tick();
    const t = setInterval(tick, 2000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {rows
        .filter((r) => r.status !== "disabled")
        .map((r) => {
          const s = simplify(r.status);
          return (
            <div
              key={r.code}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card/40 px-2 py-1 text-[11px]",
                TEXT[s],
              )}
              title={`${r.name}: ${LABEL[s]}`}
            >
              <span className={cn("h-2 w-2 rounded-full", DOT[s])} />
              <span className="font-medium">{r.name}</span>
              <span className="text-[10px] uppercase opacity-70">{LABEL[s]}</span>
            </div>
          );
        })}
    </div>
  );
}

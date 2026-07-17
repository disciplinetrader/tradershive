import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { marketData } from "@/lib/market-data/engine";
import type { ProviderStatus } from "@/lib/market-data/types";

type Row = { code: string; name: string; status: ProviderStatus };

const COLORS: Record<ProviderStatus, string> = {
  connected: "text-emerald-400",
  connecting: "text-amber-400",
  disconnected: "text-muted-foreground",
  error: "text-rose-400",
  disabled: "text-muted-foreground/60",
};

export function MarketStatusPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    marketData.init();
    const tick = () => setRows(marketData.health());
    tick();
    const id = setInterval(tick, 1500);
    return () => clearInterval(id);
  }, []);

  const stats = marketData.cacheStats();

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Activity className="h-3.5 w-3.5" /> Market Data Engine
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Stat label="Subscriptions" value={String(stats.subscriptions)} />
        <Stat label="Cached quotes" value={String(stats.quotes)} />
        <Stat label="Cached candles" value={String(stats.candles)} />
      </div>
      <table className="w-full text-xs">
        <thead className="text-muted-foreground">
          <tr>
            <th className="text-left font-medium">Provider</th>
            <th className="text-left font-medium">Code</th>
            <th className="text-right font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.code} className="border-t border-border/40">
              <td className="py-1.5">{r.name}</td>
              <td className="text-muted-foreground">{r.code}</td>
              <td className={`text-right font-medium ${COLORS[r.status]}`}>{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-card/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { MarketStatusBadge } from "@/components/market/MarketStatusBadge";
import { SessionsBar } from "@/components/market/SessionsBar";
import { ProviderStatusStrip } from "@/components/market/ProviderStatusStrip";
import { QuoteTicker } from "@/components/market/QuoteTicker";
import { marketData } from "@/lib/market-data/engine";
import { listFavorites, listRecent } from "@/lib/market-data.functions";
import type { MarketKind } from "@/lib/market-data/types";

export const Route = createFileRoute("/_authenticated/market/")({
  component: MarketDashboard,
});

const POPULAR: { symbol: string; market: MarketKind }[] = [
  { symbol: "EURUSD", market: "forex" }, { symbol: "GBPUSD", market: "forex" },
  { symbol: "USDJPY", market: "forex" }, { symbol: "XAUUSD", market: "metals" },
  { symbol: "BTCUSDT", market: "crypto" }, { symbol: "ETHUSDT", market: "crypto" },
  { symbol: "SOLUSDT", market: "crypto" }, { symbol: "QQQ", market: "indices" },
];

function MarketDashboard() {
  useEffect(() => { marketData.init(); }, []);
  const favsFn = useServerFn(listFavorites);
  const recentFn = useServerFn(listRecent);
  const { data: favs = [] } = useQuery({ queryKey: ["market", "favs"], queryFn: () => favsFn() });
  const { data: recent = [] } = useQuery({ queryKey: ["market", "recent"], queryFn: () => recentFn() });

  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 2000); return () => clearInterval(t); }, []);
  const live = marketData.cacheStats();

  return (
    <div className="space-y-4">
      <PageHeader title="Market Data" description="A single engine feeds every chart, trade, replay and insight in TradersHIVE Arena." />

      <GlassCard className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold">Providers</div>
          <ProviderStatusStrip />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold">Sessions</div>
          <SessionsBar />
        </div>
      </GlassCard>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(["forex","crypto","metals","indices"] as MarketKind[]).map((m) => (
          <GlassCard key={m} className="p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold capitalize">{m}</div>
              <MarketStatusBadge market={m} />
            </div>
          </GlassCard>
        ))}
      </div>

      <GlassCard className="p-4">
        <div className="mb-3 text-sm font-semibold">Popular symbols · live</div>
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {POPULAR.map((p) => (
            <div key={p.symbol} className="flex items-center justify-between rounded-md border border-border/60 bg-card/40 px-3 py-2">
              <div>
                <div className="font-mono text-sm font-semibold">{p.symbol}</div>
                <div className="text-[10px] uppercase text-muted-foreground">{p.market}</div>
              </div>
              <QuoteTicker symbol={p.symbol} />
            </div>
          ))}
        </div>
      </GlassCard>

      <div className="grid gap-3 lg:grid-cols-3">
        <GlassCard className="p-4">
          <div className="mb-2 text-sm font-semibold">Favorites</div>
          {favs.length === 0 ? <div className="text-xs text-muted-foreground">Star symbols to pin them here.</div> : (
            <ul className="space-y-1.5">
              {favs.map((f: any) => (
                <li key={f.id} className="flex items-center justify-between text-sm">
                  <span className="font-mono">{f.symbol}</span>
                  <QuoteTicker symbol={f.symbol} />
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
        <GlassCard className="p-4">
          <div className="mb-2 text-sm font-semibold">Recently viewed</div>
          {recent.length === 0 ? <div className="text-xs text-muted-foreground">No recent symbols yet.</div> : (
            <ul className="space-y-1.5">
              {recent.slice(0, 8).map((r: any) => (
                <li key={r.id} className="flex items-center justify-between text-sm">
                  <span className="font-mono">{r.symbol}</span>
                  <QuoteTicker symbol={r.symbol} />
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
        <GlassCard className="p-4">
          <div className="mb-2 text-sm font-semibold">Engine cache</div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Quotes" value={live.quotes} />
            <Stat label="Candles" value={live.candles} />
            <Stat label="Streams" value={live.subscriptions} />
          </div>
          <div className="mt-2 text-[10px] text-muted-foreground">Client-side TTL cache · updates every 2s</div>
        </GlassCard>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border/60 bg-card/30 p-2">
      <div className="text-lg font-bold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
    </div>
  );
}

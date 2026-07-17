import { createFileRoute } from "@tanstack/react-router";
import { LineChart, TrendingDown, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/paper-trading")({
  head: () => ({ meta: [{ title: "Paper Trading — TradersHIVE Arena" }] }),
  component: PaperTradingPage,
});

const WATCHLIST = [
  { symbol: "BTCUSD", price: 68420.5, change: 2.48 },
  { symbol: "ETHUSD", price: 3821.1, change: 1.12 },
  { symbol: "EURUSD", price: 1.0842, change: -0.24 },
  { symbol: "SPX500", price: 5482.0, change: 0.68 },
  { symbol: "XAUUSD", price: 2418.3, change: 0.42 },
];

function PaperTradingPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Paper Trading"
        description="Practice with live market data. Zero risk, real reps."
        actions={
          <Button className="gradient-primary text-primary-foreground shadow-elegant">
            New order
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <GlassCard className="min-h-[420px] overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <LineChart className="h-4 w-4 text-primary" />
              BTCUSD · 1H
            </div>
            <div className="hidden gap-2 text-xs md:flex">
              {["1m", "5m", "15m", "1H", "4H", "1D"].map((tf) => (
                <button
                  key={tf}
                  className="rounded-md px-2 py-1 text-muted-foreground transition hover:bg-accent hover:text-foreground data-[active]:bg-accent data-[active]:text-foreground"
                  data-active={tf === "1H" ? "" : undefined}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>
          <div className="p-6">
            <EmptyState
              icon={LineChart}
              title="Chart module coming soon"
              description="TradingView-grade charts with drawings, indicators, and one-click execution ship in the next release."
            />
          </div>
        </GlassCard>

        <div className="space-y-4">
          <GlassCard className="p-5">
            <h3 className="mb-3 text-sm font-semibold">Watchlist</h3>
            <ul className="divide-y divide-border/60">
              {WATCHLIST.map((row) => {
                const up = row.change >= 0;
                return (
                  <li key={row.symbol} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="text-sm font-semibold">{row.symbol}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {row.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-semibold ${
                        up ? "text-primary" : "text-danger"
                      }`}
                    >
                      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {up ? "+" : ""}
                      {row.change.toFixed(2)}%
                    </span>
                  </li>
                );
              })}
            </ul>
          </GlassCard>

          <GlassCard className="p-5">
            <Tabs defaultValue="positions">
              <TabsList className="w-full">
                <TabsTrigger value="positions" className="flex-1">Positions</TabsTrigger>
                <TabsTrigger value="orders" className="flex-1">Orders</TabsTrigger>
                <TabsTrigger value="history" className="flex-1">History</TabsTrigger>
              </TabsList>
              <TabsContent value="positions">
                <EmptyState className="py-10" title="No open positions" description="Place your first paper trade to see it here." />
              </TabsContent>
              <TabsContent value="orders">
                <EmptyState className="py-10" title="No pending orders" />
              </TabsContent>
              <TabsContent value="history">
                <EmptyState className="py-10" title="No trades yet" />
              </TabsContent>
            </Tabs>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

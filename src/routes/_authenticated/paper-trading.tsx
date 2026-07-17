import { createFileRoute } from "@tanstack/react-router";
import { GlassCard } from "@/components/ui/glass-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/page-header";
import { AccountSummary } from "@/components/paper-trading/AccountSummary";
import { ChartArea } from "@/components/paper-trading/ChartArea";
import { HistoryTable } from "@/components/paper-trading/HistoryTable";
import { OrderPanel } from "@/components/paper-trading/OrderPanel";
import { OrdersTable } from "@/components/paper-trading/OrdersTable";
import { PositionsTable } from "@/components/paper-trading/PositionsTable";
import { TopToolbar } from "@/components/paper-trading/TopToolbar";
import { WatchlistPanel } from "@/components/paper-trading/WatchlistPanel";
import { PaperTradingProvider } from "@/components/paper-trading/context";

export const Route = createFileRoute("/_authenticated/paper-trading")({
  head: () => ({
    meta: [
      { title: "Paper Trading — TradersHIVE Arena" },
      { name: "description", content: "Practice with a realistic paper trading simulator. Multiple accounts, risk-first order panel, and instant journal integration." },
    ],
  }),
  component: PaperTradingPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-sm text-rose-300">Failed to load Paper Trading: {(error as Error).message}</div>
  ),
});

function PaperTradingPage() {
  return (
    <PaperTradingProvider>
      <div className="space-y-4">
        <PageHeader
          title="Paper Trading"
          description="Zero risk, real reps. Every trade flows into your journal, stats, and challenges."
        />

        <TopToolbar />
        <AccountSummary />

        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)_340px] xl:grid-cols-[300px_minmax(0,1fr)_360px]">
          <GlassCard className="order-2 h-[520px] p-3 lg:order-1 lg:h-auto lg:min-h-[520px]">
            <WatchlistPanel />
          </GlassCard>

          <div className="order-1 lg:order-2">
            <ChartArea />
          </div>

          <GlassCard className="order-3 p-4 lg:sticky lg:top-4 lg:h-fit lg:self-start">
            <OrderPanel />
          </GlassCard>
        </div>

        <GlassCard className="p-4">
          <Tabs defaultValue="positions">
            <TabsList>
              <TabsTrigger value="positions">Open positions</TabsTrigger>
              <TabsTrigger value="orders">Orders</TabsTrigger>
              <TabsTrigger value="history">Trade history</TabsTrigger>
            </TabsList>
            <TabsContent value="positions" className="mt-4">
              <PositionsTable />
            </TabsContent>
            <TabsContent value="orders" className="mt-4">
              <OrdersTable />
            </TabsContent>
            <TabsContent value="history" className="mt-4">
              <HistoryTable />
            </TabsContent>
          </Tabs>
        </GlassCard>
      </div>
    </PaperTradingProvider>
  );
}

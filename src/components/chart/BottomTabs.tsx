import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listAlerts } from "@/lib/chart/storage";
import type { ChartAlertRow } from "@/lib/chart/types";
import { PositionsTable } from "@/components/paper-trading/PositionsTable";
import { OrdersTable } from "@/components/paper-trading/OrdersTable";
import { HistoryTable } from "@/components/paper-trading/HistoryTable";
import { QuickJournalPanel } from "@/components/trading/QuickJournalPanel";
import { AiInsightsPanel } from "@/components/trading/AiInsightsPanel";
import { MarketStatusPanel } from "@/components/trading/MarketStatusPanel";

/**
 * Trading Workspace bottom tabs — real paper trades, alerts, quick journal,
 * AI insights and market-data status all in one strip.
 */
export function BottomTabs({ symbol }: { symbol?: string }) {
  const [alerts, setAlerts] = useState<ChartAlertRow[]>([]);
  useEffect(() => { listAlerts().then(setAlerts).catch(() => setAlerts([])); }, []);

  return (
    <Tabs defaultValue="positions" className="flex h-full flex-col">
      <TabsList className="h-9 justify-start rounded-none border-b border-border/60 bg-transparent px-2 overflow-x-auto">
        <TabsTrigger value="positions" className="h-7">Positions</TabsTrigger>
        <TabsTrigger value="orders" className="h-7">Orders</TabsTrigger>
        <TabsTrigger value="history" className="h-7">History</TabsTrigger>
        <TabsTrigger value="journal" className="h-7">Journal</TabsTrigger>
        <TabsTrigger value="ai" className="h-7">AI Insights</TabsTrigger>
        <TabsTrigger value="alerts" className="h-7">Alerts ({alerts.filter((a) => a.is_active).length})</TabsTrigger>
        <TabsTrigger value="market" className="h-7">Market Status</TabsTrigger>
      </TabsList>
      <div className="min-h-0 flex-1 overflow-auto p-3 text-sm">
        <TabsContent value="positions" className="mt-0"><PositionsTable /></TabsContent>
        <TabsContent value="orders" className="mt-0"><OrdersTable /></TabsContent>
        <TabsContent value="history" className="mt-0"><HistoryTable /></TabsContent>
        <TabsContent value="journal" className="mt-0"><QuickJournalPanel symbol={symbol} /></TabsContent>
        <TabsContent value="ai" className="mt-0"><AiInsightsPanel symbol={symbol} /></TabsContent>
        <TabsContent value="alerts" className="mt-0">
          {alerts.length ? (
            <table className="w-full text-xs">
              <thead className="text-muted-foreground"><tr><th className="text-left font-medium">Symbol</th><th className="text-left font-medium">Type</th><th className="text-left font-medium">Condition</th><th className="text-right font-medium">Price</th><th className="text-right font-medium">Status</th></tr></thead>
              <tbody>
                {alerts.map((a) => (
                  <tr key={a.id} className="border-t border-border/40">
                    <td className="py-1.5">{a.symbol}</td>
                    <td>{a.alert_type}</td>
                    <td>{a.condition}</td>
                    <td className="text-right tabular-nums">{a.target_price ?? "—"}</td>
                    <td className="text-right">{a.is_active ? "Active" : "Off"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No alerts. Create one from the toolbar.</div>}
        </TabsContent>
        <TabsContent value="market" className="mt-0"><MarketStatusPanel /></TabsContent>
      </div>
    </Tabs>
  );
}

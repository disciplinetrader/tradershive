import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listAlerts } from "@/lib/chart/storage";
import type { ChartAlertRow } from "@/lib/chart/types";

/**
 * Bottom tabs: Positions / Orders / History / Alerts / Logs.
 * Positions & orders are owned by the Paper Trading module — this shell
 * only surfaces alerts (chart-native) and logs.
 */
export function BottomTabs() {
  const [alerts, setAlerts] = useState<ChartAlertRow[]>([]);
  useEffect(() => { listAlerts().then(setAlerts).catch(() => setAlerts([])); }, []);

  return (
    <Tabs defaultValue="positions" className="flex h-full flex-col">
      <TabsList className="h-9 justify-start rounded-none border-b border-border/60 bg-transparent px-2">
        <TabsTrigger value="positions" className="h-7">Open Positions</TabsTrigger>
        <TabsTrigger value="orders" className="h-7">Orders</TabsTrigger>
        <TabsTrigger value="history" className="h-7">History</TabsTrigger>
        <TabsTrigger value="alerts" className="h-7">Alerts ({alerts.filter((a) => a.is_active).length})</TabsTrigger>
        <TabsTrigger value="logs" className="h-7">Logs</TabsTrigger>
      </TabsList>
      <div className="min-h-0 flex-1 overflow-auto p-3 text-sm">
        <TabsContent value="positions"><EmptyRow label="No open positions. Trade from the panel on the right." /></TabsContent>
        <TabsContent value="orders"><EmptyRow label="No working orders." /></TabsContent>
        <TabsContent value="history"><EmptyRow label="Closed trades appear here after Paper Trading closes them." /></TabsContent>
        <TabsContent value="alerts">
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
          ) : <EmptyRow label="No alerts. Create one from the toolbar." />}
        </TabsContent>
        <TabsContent value="logs"><EmptyRow label="Chart Engine logs stream here." /></TabsContent>
      </div>
    </Tabs>
  );
}

function EmptyRow({ label }: { label: string }) {
  return <div className="flex h-full items-center justify-center text-xs text-muted-foreground">{label}</div>;
}

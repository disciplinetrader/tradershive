/**
 * Phase 8B · session sidebar — positions, pending orders, closed trades and
 * the audit feed. Every number is read from the canonical execution stores;
 * this file computes no P/L, no R, no risk.
 */
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { positionMetricsFor } from "@/lib/chart/orders/service";
import { useReplayStudio } from "./context";
import { ReflectionPanel } from "./ReflectionPanel";

function Empty({ text }: { text: string }) {
  return <div className="px-3 py-6 text-center text-xs text-muted-foreground">{text}</div>;
}

export function SessionSidebar({ className }: { className?: string }) {
  const { positions, pending, trades, view, price, closePositionNow, cancelOrder, placeMarketOrder } = useReplayStudio();
  const live = view?.transport.lifecycle !== "completed";

  return (
    <aside className={cn("flex w-full shrink-0 flex-col border-l border-border/60 bg-card/30 md:w-[320px]", className)}>

      <div className="grid grid-cols-2 gap-2 border-b border-border/60 p-2">
        <Button size="sm" onClick={() => placeMarketOrder("buy")} disabled={!live || price == null}>
          Buy market
        </Button>
        <Button size="sm" variant="secondary" onClick={() => placeMarketOrder("sell")} disabled={!live || price == null}>
          Sell market
        </Button>
      </div>

      <Tabs defaultValue="positions" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-2 mt-2 grid grid-cols-5">
          <TabsTrigger value="positions" className="text-[11px]">Pos {positions.length || ""}</TabsTrigger>
          <TabsTrigger value="orders" className="text-[11px]">Ord {pending.length || ""}</TabsTrigger>
          <TabsTrigger value="trades" className="text-[11px]">Trades</TabsTrigger>
          <TabsTrigger value="log" className="text-[11px]">Log</TabsTrigger>
          <TabsTrigger value="review" className="text-[11px]">Review</TabsTrigger>
        </TabsList>

        <TabsContent value="positions" className="min-h-0 flex-1">
          <ScrollArea className="h-full">
            {positions.length === 0 ? (
              <Empty text="No open positions. Place a market order to start practising." />
            ) : (
              positions.map((p) => {
                const m = positionMetricsFor(p, price);
                return (
                  <div key={p.id} className="flex items-center justify-between border-b border-border/40 px-3 py-2 text-xs">
                    <div>
                      <div className="font-medium">
                        {p.direction === "buy" ? "Long" : "Short"} {p.symbol}
                      </div>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        entry {p.entry} · stop {p.stop}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`font-mono ${(m?.totalPnl ?? 0) >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                        {(m?.totalPnl ?? 0).toFixed(2)}
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => closePositionNow(p.id)}>Close</Button>
                    </div>
                  </div>
                );
              })
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="orders" className="min-h-0 flex-1">
          <ScrollArea className="h-full">
            {pending.length === 0 ? (
              <Empty text="No working orders." />
            ) : (
              pending.map((o) => (
                <div key={o.id} className="flex items-center justify-between border-b border-border/40 px-3 py-2 text-xs">
                  <div>
                    <div className="font-medium">{o.orderType} {o.direction === "buy" ? "long" : "short"}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">@ {o.entry}</div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => cancelOrder(o.id)}>Cancel</Button>
                </div>
              ))
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="trades" className="min-h-0 flex-1">
          <ScrollArea className="h-full">
            {trades.length === 0 ? (
              <Empty text="Closed trades appear here as the session runs." />
            ) : (
              trades.map((t) => (
                <div key={t.id} className="flex items-center justify-between border-b border-border/40 px-3 py-2 text-xs">
                  <div>
                    <div className="font-medium">{t.symbol} {t.direction === "buy" ? "long" : "short"}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">{t.closeReason}</div>
                  </div>
                  <span className={`font-mono ${t.netPnl >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                    {t.netPnl.toFixed(2)}
                  </span>
                </div>
              ))
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="review" className="min-h-0 flex-1">
          <ReflectionPanel />
        </TabsContent>

        <TabsContent value="log" className="min-h-0 flex-1">
          <ScrollArea className="h-full">
            {!view || view.events.length === 0 ? (
              <Empty text="Execution events are recorded here, in order." />
            ) : (
              view.events.map((e) => (
                <div key={e.seq} className="flex items-center justify-between border-b border-border/40 px-3 py-1.5 text-[11px]">
                  <Badge variant="outline" className="font-mono">{e.type}</Badge>
                  <span className="font-mono text-muted-foreground">
                    #{e.cursor} · {e.marketTime ? new Date(e.marketTime).toISOString().slice(11, 16) : "—"}
                  </span>
                </div>
              ))
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </aside>
  );
}

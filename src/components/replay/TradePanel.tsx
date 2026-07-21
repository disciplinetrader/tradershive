import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GlassCard } from "@/components/ui/glass-card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useReplay } from "./context";
import { cn } from "@/lib/utils";
import type { OrderType } from "@/lib/replay/types";

export function TradePanel() {
  const { openTrade, openTrades, closeTrade, pendingOrders, cancelPendingOrder, candles, cursorIdx } = useReplay();
  const current = candles[cursorIdx]?.close ?? 0;
  const [tab, setTab] = useState<"market" | "pending">("market");
  const [orderType, setOrderType] = useState<Exclude<OrderType, "market">>("limit");
  const [entry, setEntry] = useState("");
  const [lot, setLot] = useState("1");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [risk, setRisk] = useState("1");
  const [busy, setBusy] = useState(false);

  const submit = async (direction: "long" | "short") => {
    setBusy(true);
    try {
      await openTrade({
        direction,
        orderType: tab === "market" ? "market" : orderType,
        lotSize: Number(lot) || 1,
        stopLoss: sl ? Number(sl) : null,
        takeProfit: tp ? Number(tp) : null,
        riskPct: risk ? Number(risk) : null,
        entryPrice: tab === "pending" && entry ? Number(entry) : null,
      });
      if (tab === "pending") setEntry("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassCard className="p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">New Order</div>
        <div className="text-lg font-bold tabular-nums text-primary">{current ? current.toFixed(current < 10 ? 5 : 2) : "—"}</div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "market" | "pending")} className="w-full">
        <TabsList className="grid w-full grid-cols-2 h-8">
          <TabsTrigger value="market" className="text-xs">Market</TabsTrigger>
          <TabsTrigger value="pending" className="text-xs">Pending</TabsTrigger>
        </TabsList>

        <TabsContent value="market" className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-[10px]">Lot Size</Label><Input value={lot} onChange={(e) => setLot(e.target.value)} inputMode="decimal" /></div>
            <div><Label className="text-[10px]">Risk %</Label><Input value={risk} onChange={(e) => setRisk(e.target.value)} inputMode="decimal" /></div>
            <div><Label className="text-[10px]">Stop Loss</Label><Input value={sl} onChange={(e) => setSl(e.target.value)} inputMode="decimal" placeholder="price" /></div>
            <div><Label className="text-[10px]">Take Profit</Label><Input value={tp} onChange={(e) => setTp(e.target.value)} inputMode="decimal" placeholder="price" /></div>
          </div>
        </TabsContent>

        <TabsContent value="pending" className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-1">
            {(["limit", "stop"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setOrderType(k)}
                className={cn(
                  "rounded-md px-2 py-1 text-[11px] font-medium border transition",
                  orderType === k
                    ? "bg-primary text-primary-foreground border-primary"
                    : "text-muted-foreground border-border/50 hover:text-foreground",
                )}
              >{k.toUpperCase()}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <Label className="text-[10px]">Entry Price</Label>
              <Input value={entry} onChange={(e) => setEntry(e.target.value)} inputMode="decimal" placeholder={String(current || "price")} />
            </div>
            <div><Label className="text-[10px]">Lot Size</Label><Input value={lot} onChange={(e) => setLot(e.target.value)} inputMode="decimal" /></div>
            <div><Label className="text-[10px]">Risk %</Label><Input value={risk} onChange={(e) => setRisk(e.target.value)} inputMode="decimal" /></div>
            <div><Label className="text-[10px]">Stop Loss</Label><Input value={sl} onChange={(e) => setSl(e.target.value)} inputMode="decimal" placeholder="price" /></div>
            <div><Label className="text-[10px]">Take Profit</Label><Input value={tp} onChange={(e) => setTp(e.target.value)} inputMode="decimal" placeholder="price" /></div>
          </div>
        </TabsContent>
      </Tabs>

      <div className="grid grid-cols-2 gap-2">
        <Button disabled={busy || (tab === "pending" && !entry)} onClick={() => submit("long")} className="bg-success hover:bg-success/90">BUY / LONG</Button>
        <Button disabled={busy || (tab === "pending" && !entry)} onClick={() => submit("short")} className="bg-danger hover:bg-danger/90">SELL / SHORT</Button>
      </div>

      {pendingOrders.length > 0 && (
        <div className="pt-3 border-t border-border/40 space-y-2">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Pending ({pendingOrders.length})</div>
          {pendingOrders.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-xs">
              <div>
                <span className={cn("mr-1 font-medium", p.direction === "long" ? "text-success" : "text-danger")}>
                  {p.direction.toUpperCase()} {p.orderType.toUpperCase()}
                </span>
                @ {p.entryPrice.toFixed(p.entryPrice < 10 ? 5 : 2)} · {p.lotSize} lots
              </div>
              <Button size="sm" variant="ghost" onClick={() => cancelPendingOrder(p.id)}>Cancel</Button>
            </div>
          ))}
        </div>
      )}

      <div className="pt-3 border-t border-border/40 space-y-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Open Positions ({openTrades.length})</div>
        {openTrades.length === 0 ? (
          <div className="text-xs text-muted-foreground">No open positions.</div>
        ) : (
          openTrades.map((t) => {
            const upnl = (t.direction === "long" ? current - t.entry_price : t.entry_price - current) * t.lot_size;
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-xs"
              >
                <div>
                  <div className="font-medium">
                    <span className={cn("mr-1", t.direction === "long" ? "text-success" : "text-danger")}>
                      {t.direction === "long" ? "▲" : "▼"}
                    </span>
                    {t.lot_size} @ {t.entry_price.toFixed(t.entry_price < 10 ? 5 : 2)}
                  </div>
                  <div className={cn("tabular-nums", upnl >= 0 ? "text-success" : "text-danger")}>
                    {upnl >= 0 ? "+" : ""}{upnl.toFixed(2)}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => closeTrade(t.id)}>Close</Button>
              </motion.div>
            );
          })
        )}
      </div>
    </GlassCard>
  );
}

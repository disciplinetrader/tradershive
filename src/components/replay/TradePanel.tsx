import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GlassCard } from "@/components/ui/glass-card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useReplay } from "./context";
import { cn } from "@/lib/utils";
import type { OrderType } from "@/lib/replay/types";
import { Layers, Repeat2 } from "lucide-react";

/**
 * Replay TradePanel
 * ----------------------------------------------------------------------------
 * One-click execution — no confirmation dialogs. The active Trading Mode
 * (Netting / Hedging) is surfaced as a compact badge and drives whether
 * opposite market orders net down existing exposure or open new positions.
 */
export function TradePanel() {
  const {
    openTrade,
    openTrades,
    closeTrade,
    pendingOrders,
    cancelPendingOrder,
    candles,
    cursorIdx,
    tradingMode,
    settings,
    closeAllPositions,
    partialClose,
    moveToBreakEven,
    setTrailingStop,
    reversePosition,
    trailingStops,
  } = useReplay();
  const current = candles[cursorIdx]?.close ?? 0;
  const [tab, setTab] = useState<"market" | "pending">("market");
  const [orderType, setOrderType] = useState<Exclude<OrderType, "market">>("limit");
  const [entry, setEntry] = useState("");
  const [lot, setLot] = useState(String(settings.defaultLotSize));
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [risk, setRisk] = useState(String(settings.defaultRiskPct));
  const [busy, setBusy] = useState(false);

  // Keep prefilled defaults in sync when the user updates Replay Settings.
  useEffect(() => { setLot((cur) => (cur === "" ? String(settings.defaultLotSize) : cur)); }, [settings.defaultLotSize]);
  useEffect(() => { setRisk((cur) => (cur === "" ? String(settings.defaultRiskPct) : cur)); }, [settings.defaultRiskPct]);

  const submit = async (direction: "long" | "short") => {
    setBusy(true);
    try {
      await openTrade({
        direction,
        orderType: tab === "market" ? "market" : orderType,
        lotSize: Number(lot) || settings.defaultLotSize,
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

  const fmt = (p: number) => p.toFixed(p < 10 ? 5 : 2);

  return (
    <GlassCard className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">New Order</div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-[3px] border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              tradingMode === "netting"
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border/60 bg-background/40 text-muted-foreground",
            )}
            title={tradingMode === "netting" ? "One net position per symbol" : "Multiple positions allowed"}
          >
            <Layers className="h-3 w-3" /> {tradingMode}
          </span>
          <div className="text-lg font-bold tabular-nums text-primary">{current ? fmt(current) : "—"}</div>
        </div>
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
                @ {fmt(p.entryPrice)} · {p.lotSize} lots
              </div>
              <Button size="sm" variant="ghost" onClick={() => cancelPendingOrder(p.id)}>Cancel</Button>
            </div>
          ))}
        </div>
      )}

      <div className="pt-3 border-t border-border/40 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Open Positions ({openTrades.length})</div>
          {openTrades.length > 0 && (
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => closeAllPositions()}>Close All</Button>
          )}
        </div>
        {openTrades.length === 0 ? (
          <div className="text-xs text-muted-foreground">No open positions.</div>
        ) : (
          openTrades.map((t) => {
            const upnl = (t.direction === "long" ? current - t.entry_price : t.entry_price - current) * t.lot_size;
            const isTrailing = !!trailingStops[t.id];
            const distanceDefault = t.stop_loss ? Math.abs(t.entry_price - t.stop_loss) : Math.max(0.0001, current * 0.001);
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-xs space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">
                      <span className={cn("mr-1", t.direction === "long" ? "text-success" : "text-danger")}>
                        {t.direction === "long" ? "▲" : "▼"}
                      </span>
                      {t.lot_size} @ {fmt(t.entry_price)}
                      {t.stop_loss != null && <span className="ml-2 text-muted-foreground">SL {fmt(t.stop_loss)}</span>}
                      {t.take_profit != null && <span className="ml-2 text-muted-foreground">TP {fmt(t.take_profit)}</span>}
                    </div>
                    <div className={cn("tabular-nums", upnl >= 0 ? "text-success" : "text-danger")}>
                      {upnl >= 0 ? "+" : ""}{upnl.toFixed(2)}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => closeTrade(t.id)}>Close</Button>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => partialClose(t.id, 0.5)}>½ Close</Button>
                  <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => partialClose(t.id, 0.25)}>¼ Close</Button>
                  <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => moveToBreakEven(t.id)}>Break-Even</Button>
                  <Button
                    size="sm"
                    variant={isTrailing ? "default" : "outline"}
                    className="h-6 px-2 text-[10px]"
                    onClick={() => setTrailingStop(t.id, isTrailing ? null : distanceDefault)}
                  >
                    Trail {isTrailing ? "On" : ""}
                  </Button>
                  {tradingMode === "netting" && (
                    <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => reversePosition(t.id)}>
                      <Repeat2 className="mr-1 h-3 w-3" />Reverse
                    </Button>
                  )}
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </GlassCard>
  );
}

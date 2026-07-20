import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GlassCard } from "@/components/ui/glass-card";
import { useReplay } from "./context";
import { cn } from "@/lib/utils";

export function TradePanel() {
  const { openTrade, openTrades, closeTrade, candles, cursorIdx } = useReplay();
  const current = candles[cursorIdx]?.close ?? 0;
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
        orderType: "market",
        lotSize: Number(lot) || 1,
        stopLoss: sl ? Number(sl) : null,
        takeProfit: tp ? Number(tp) : null,
        riskPct: risk ? Number(risk) : null,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassCard className="p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Market Order</div>
        <div className="text-lg font-bold tabular-nums text-primary">{current ? current.toFixed(current < 10 ? 5 : 2) : "—"}</div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px]">Lot Size</Label>
          <Input value={lot} onChange={(e) => setLot(e.target.value)} inputMode="decimal" />
        </div>
        <div>
          <Label className="text-[10px]">Risk %</Label>
          <Input value={risk} onChange={(e) => setRisk(e.target.value)} inputMode="decimal" />
        </div>
        <div>
          <Label className="text-[10px]">Stop Loss</Label>
          <Input value={sl} onChange={(e) => setSl(e.target.value)} inputMode="decimal" placeholder="price" />
        </div>
        <div>
          <Label className="text-[10px]">Take Profit</Label>
          <Input value={tp} onChange={(e) => setTp(e.target.value)} inputMode="decimal" placeholder="price" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button disabled={busy} onClick={() => submit("long")} className="bg-success hover:bg-success">BUY / LONG</Button>
        <Button disabled={busy} onClick={() => submit("short")} className="bg-danger hover:bg-danger">SELL / SHORT</Button>
      </div>

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

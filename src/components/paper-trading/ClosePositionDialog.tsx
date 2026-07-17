import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { closeTrade } from "@/lib/paper-trading.functions";
import { findSymbol } from "@/lib/paper-trading/symbols";
import { pnl as computePnl, formatCurrency, formatNumber } from "@/lib/paper-trading/calculations";
import { useLivePrice } from "@/lib/paper-trading/mock-prices";
import { usePaper } from "./context";
import { cn } from "@/lib/utils";

type Trade = {
  id: string; symbol: string; direction: "long"|"short"; entry_price: number;
  lot_size: number; stop_loss: number|null; take_profit: number|null;
  opened_at: string; commission: number; swap: number;
};

export function ClosePositionDialog({ trade, onClose }: { trade: Trade; onClose: () => void }) {
  const qc = useQueryClient();
  const { account } = usePaper();
  const sym = findSymbol(trade.symbol);
  const live = useLivePrice(trade.symbol);
  const [exit, setExit] = useState<string>(live != null ? String(live) : String(trade.entry_price));

  const exitNum = Number(exit) || 0;
  const pnl = sym ? computePnl(sym, trade.direction, Number(trade.entry_price), exitNum, Number(trade.lot_size)) - Number(trade.commission ?? 0) - Number(trade.swap ?? 0) : 0;
  const risk = sym && trade.stop_loss ? Math.abs(computePnl(sym, trade.direction, Number(trade.entry_price), Number(trade.stop_loss), Number(trade.lot_size))) : 0;
  const rr = risk > 0 ? pnl / risk : 0;
  const durMs = Date.now() - new Date(trade.opened_at).getTime();
  const durMin = Math.max(1, Math.round(durMs / 60000));

  const closeFn = useServerFn(closeTrade);
  const mut = useMutation({
    mutationFn: () => closeFn({ data: { id: trade.id, exit_price: exitNum, close_reason: "manual" } }),
    onSuccess: () => {
      toast.success("Position closed — draft added to journal");
      qc.invalidateQueries({ queryKey: ["paper"] });
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close {trade.symbol}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Exit price</Label>
            <Input value={exit} onChange={(e) => setExit(e.target.value)} className="mt-1 font-mono" inputMode="decimal" />
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/60 bg-background/40 p-3 text-sm">
            <Row label="Entry" value={formatNumber(Number(trade.entry_price), sym?.decimals ?? 2)} />
            <Row label="Exit"  value={formatNumber(exitNum, sym?.decimals ?? 2)} />
            <Row label="Lot"   value={Number(trade.lot_size).toFixed(2)} />
            <Row label="Duration" value={`${durMin} min`} />
            <Row label="RR"    value={rr ? `${rr.toFixed(2)}R` : "—"} accent={rr >= 0 ? "emerald" : "rose"} />
            <Row label="P / L" value={`${pnl >= 0 ? "+" : ""}${formatCurrency(pnl, account?.currency)}`} accent={pnl >= 0 ? "emerald" : "rose"} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || exitNum <= 0}
            className={cn(pnl >= 0 ? "bg-emerald-500 hover:bg-emerald-500/90" : "bg-rose-500 hover:bg-rose-500/90", "text-white")}
          >
            Confirm close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, accent }: { label: string; value: React.ReactNode; accent?: "emerald" | "rose" }) {
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("text-right font-mono tabular-nums",
        accent === "emerald" && "text-emerald-400",
        accent === "rose" && "text-rose-400")}>{value}</span>
    </>
  );
}

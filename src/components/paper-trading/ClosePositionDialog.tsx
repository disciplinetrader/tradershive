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
import { useLivePrice } from "@/lib/paper-trading/live-quotes";
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
        <form
          onSubmit={(e) => { e.preventDefault(); if (!mut.isPending && exitNum > 0) mut.mutate(); }}
          className="space-y-3"
        >
          <div>
            <div className="flex items-center justify-between">
              <Label>Exit price</Label>
              {live != null && (
                <button
                  type="button"
                  onClick={() => setExit(String(live))}
                  className="text-[10px] font-semibold uppercase tracking-wider text-primary transition-colors hover:text-primary/80"
                >
                  Use live · {formatNumber(live, sym?.decimals ?? 2)}
                </button>
              )}
            </div>
            <Input autoFocus value={exit} onChange={(e) => setExit(e.target.value)} className="mt-1 font-mono" inputMode="decimal" />
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/60 bg-background/40 p-3 text-sm">
            <Row label="Entry" value={formatNumber(Number(trade.entry_price), sym?.decimals ?? 2)} />
            <Row label="Exit"  value={formatNumber(exitNum, sym?.decimals ?? 2)} />
            <Row label="Lot"   value={Number(trade.lot_size).toFixed(2)} />
            <Row label="Duration" value={`${durMin} min`} />
            <Row label="RR"    value={rr ? `${rr.toFixed(2)}R` : "—"} accent={rr >= 0 ? "emerald" : "rose"} />
            <Row label="P / L" value={`${pnl >= 0 ? "+" : ""}${formatCurrency(pnl, account?.currency)}`} accent={pnl >= 0 ? "emerald" : "rose"} />
          </div>
          <p className="text-[10px] text-muted-foreground">Tip — <kbd className="rounded bg-muted px-1">Enter</kbd> to confirm, <kbd className="rounded bg-muted px-1">Esc</kbd> to cancel.</p>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button
              type="submit"
              disabled={mut.isPending || exitNum <= 0}
              className={cn(pnl >= 0 ? "bg-success hover:bg-success/90" : "bg-danger hover:bg-danger/90", "min-w-[130px] text-white transition-all active:scale-95")}
            >
              {mut.isPending ? "Closing…" : "Confirm close"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, accent }: { label: string; value: React.ReactNode; accent?: "emerald" | "rose" }) {
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("text-right font-mono tabular-nums",
        accent === "emerald" && "text-success",
        accent === "rose" && "text-danger")}>{value}</span>
    </>
  );
}

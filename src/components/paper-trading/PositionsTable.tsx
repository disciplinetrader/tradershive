import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion, AnimatePresence } from "framer-motion";
import { Pencil, X, Split, Sliders, Shield, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  closeTrade, listTrades, modifyTrade, partialCloseTrade, moveToBreakEven,
} from "@/lib/paper-trading.functions";
import { findSymbol } from "@/lib/paper-trading/symbols";
import { pnl as computePnl, formatCurrency, formatNumber } from "@/lib/paper-trading/calculations";
import { useLiveQuotes } from "@/lib/paper-trading/mock-prices";
import { usePaper } from "./context";
import { ClosePositionDialog } from "./ClosePositionDialog";
import { PostTradeSummary, type ClosedTrade } from "./PostTradeSummary";
import { SessionBadge } from "./SessionBadge";
import { cn } from "@/lib/utils";


type Trade = {
  id: string; symbol: string; direction: "long"|"short"; entry_price: number;
  lot_size: number; stop_loss: number|null; take_profit: number|null;
  opened_at: string; commission: number; swap: number; account_id: string; notes: string|null;
};

export function PositionsTable() {
  const { accountId, account } = usePaper();
  const quotes = useLiveQuotes();
  const fetch = useServerFn(listTrades);
  const closeFn = useServerFn(closeTrade);
  const partialFn = useServerFn(partialCloseTrade);
  const beFn = useServerFn(moveToBreakEven);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["paper", "trades", accountId, "open"],
    queryFn: () => fetch({ data: { account_id: accountId!, status: "open" } }) as unknown as Promise<Trade[]>,
    enabled: !!accountId,
    refetchInterval: 2000,
  });

  const [closing, setClosing] = useState<Trade | null>(null);
  const [modifying, setModifying] = useState<Trade | null>(null);
  const [closingIds, setClosingIds] = useState<Set<string>>(new Set());
  const [summary, setSummary] = useState<ClosedTrade | null>(null);

  const instantClose = async (t: Trade) => {
    const sym = findSymbol(t.symbol);
    const current = quotes[t.symbol]?.price ?? sym?.refPrice ?? Number(t.entry_price);
    if (!current || current <= 0) { toast.error("No live price available"); return; }
    setClosingIds((s) => new Set(s).add(t.id));
    try {
      const result = await closeFn({ data: { id: t.id, exit_price: current, close_reason: "manual" } }) as { pnl: number; rr_realized: number | null };
      toast.success(`Closed ${t.symbol} @ ${current}`);
      qc.invalidateQueries({ queryKey: ["paper"] });
      // Show post-trade summary immediately with server-authoritative P/L.
      setSummary({
        id: t.id, symbol: t.symbol, direction: t.direction,
        entry_price: t.entry_price, exit_price: current, lot_size: t.lot_size,
        pnl: result.pnl, rr_realized: result.rr_realized,
        opened_at: t.opened_at, closed_at: new Date().toISOString(),
        close_reason: "manual", commission: t.commission, swap: t.swap,
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setClosingIds((s) => { const n = new Set(s); n.delete(t.id); return n; });
    }
  };

  const partialClose = async (t: Trade, fraction: number) => {
    const sym = findSymbol(t.symbol);
    const current = quotes[t.symbol]?.price ?? sym?.refPrice ?? Number(t.entry_price);
    if (!current || current <= 0) { toast.error("No live price available"); return; }
    try {
      const r = await partialFn({ data: { id: t.id, fraction, exit_price: current } }) as { pnl: number; closed_lot: number };
      toast.success(`Closed ${Math.round(fraction * 100)}% (${r.closed_lot} lots) · P/L ${formatCurrency(r.pnl, account?.currency)}`);
      qc.invalidateQueries({ queryKey: ["paper"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const breakEven = async (t: Trade) => {
    try {
      const r = await beFn({ data: { id: t.id } }) as { changed: boolean };
      toast.success(r.changed ? "Stop-loss moved to entry" : "Stop-loss already at entry");
      qc.invalidateQueries({ queryKey: ["paper"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const rows = data ?? [];

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading positions…</div>;
  if (!rows.length) {
    return (
      <>
        <EmptyState
          className="py-10"
          title="No open positions"
          description="Place your first paper trade from the order panel to see it here."
        />
        <PostTradeSummary trade={summary} open={!!summary} onClose={() => setSummary(null)} currency={account?.currency} />
      </>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pair</TableHead>
              <TableHead>Side</TableHead>
              <TableHead>Session</TableHead>
              <TableHead className="text-right">Entry</TableHead>
              <TableHead className="text-right">Current</TableHead>
              <TableHead className="text-right">Lot</TableHead>
              <TableHead className="text-right">SL</TableHead>
              <TableHead className="text-right">TP</TableHead>
              <TableHead className="text-right">RR (live)</TableHead>
              <TableHead className="text-right">Floating P/L</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead className="sticky right-0 z-10 bg-background/95 text-right shadow-[-8px_0_12px_-8px_rgba(0,0,0,0.4)]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <AnimatePresence initial={false}>
              {rows.map((t) => {
                const sym = findSymbol(t.symbol);
                const current = quotes[t.symbol]?.price ?? sym?.refPrice ?? Number(t.entry_price);
                const floating = sym ? computePnl(sym, t.direction, Number(t.entry_price), current, Number(t.lot_size)) : 0;
                const risk = sym && t.stop_loss ? Math.abs(computePnl(sym, t.direction, Number(t.entry_price), Number(t.stop_loss), Number(t.lot_size))) : 0;
                const rr = risk > 0 ? floating / risk : 0;
                const duration = formatDuration(new Date(t.opened_at));
                const up = floating >= 0;
                const beDisabled = Number(t.stop_loss ?? NaN) === Number(t.entry_price);
                return (
                  <motion.tr
                    key={t.id}
                    layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="border-b border-border/50"
                  >
                    <TableCell className="font-semibold">{t.symbol}</TableCell>
                    <TableCell>
                      <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                        t.direction === "long" ? "bg-success/15 text-success" : "bg-danger/15 text-danger")}>
                        {t.direction}
                      </span>
                    </TableCell>
                    <TableCell><SessionBadge at={t.opened_at} /></TableCell>
                    <TableCell className="text-right font-mono">{formatNumber(Number(t.entry_price), sym?.decimals ?? 2)}</TableCell>
                    <TableCell className="text-right font-mono">{formatNumber(current, sym?.decimals ?? 2)}</TableCell>
                    <TableCell className="text-right font-mono">{Number(t.lot_size).toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">{t.stop_loss ? formatNumber(Number(t.stop_loss), sym?.decimals ?? 2) : "—"}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">{t.take_profit ? formatNumber(Number(t.take_profit), sym?.decimals ?? 2) : "—"}</TableCell>
                    <TableCell className={cn("text-right font-mono tabular-nums", rr >= 0 ? "text-success" : "text-danger")}>
                      {rr ? `${rr.toFixed(2)}R` : "—"}
                    </TableCell>
                    <TableCell className={cn("text-right font-mono tabular-nums font-semibold", up ? "text-success" : "text-danger")}>
                      {up ? "+" : ""}{formatCurrency(floating, account?.currency)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{duration}</TableCell>
                    <TableCell className="sticky right-0 z-10 bg-background/95 text-right shadow-[-8px_0_12px_-8px_rgba(0,0,0,0.4)]">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => breakEven(t)} disabled={beDisabled}
                          aria-label="Move stop-loss to break-even"
                          title={beDisabled ? "Already at break-even" : "Move SL to entry (break-even)"}
                        >
                          <Shield className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setModifying(t)} aria-label="Modify SL/TP" title="Modify SL/TP">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setClosing(t)} aria-label="Close with custom price" title="Close at custom price…">
                          <Sliders className="h-3.5 w-3.5" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Partial close" title="Partial close">
                              <Split className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Partial close</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => partialClose(t, 0.25)}>Close 25%</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => partialClose(t, 0.5)}>Close 50%</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => partialClose(t, 0.75)}>Close 75%</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                          variant="default"
                          size="sm"
                          className="h-7 gap-1 bg-danger/90 px-2 text-[11px] font-semibold text-white hover:bg-danger"
                          onClick={() => instantClose(t)}
                          disabled={closingIds.has(t.id)}
                          aria-label="Close at market"
                          title="Close at market (instant)"
                        >
                          <X className="h-3.5 w-3.5" />
                          {closingIds.has(t.id) ? "…" : "Close"}
                        </Button>
                      </div>
                    </TableCell>
                  </motion.tr>
                );
              })}
            </AnimatePresence>
          </TableBody>
        </Table>
      </div>

      {closing && <ClosePositionDialog trade={closing} onClose={() => setClosing(null)} />}
      {modifying && <ModifyDialog trade={modifying} onClose={() => setModifying(null)} />}
      <PostTradeSummary trade={summary} open={!!summary} onClose={() => setSummary(null)} currency={account?.currency} />
    </>
  );

}

function ModifyDialog({ trade, onClose }: { trade: Trade; onClose: () => void }) {
  const qc = useQueryClient();
  const [sl, setSl] = useState(trade.stop_loss ? String(trade.stop_loss) : "");
  const [tp, setTp] = useState(trade.take_profit ? String(trade.take_profit) : "");
  const modify = useServerFn(modifyTrade);
  const mut = useMutation({
    mutationFn: () => modify({ data: { id: trade.id, stop_loss: sl ? Number(sl) : null, take_profit: tp ? Number(tp) : null } }),
    onSuccess: () => { toast.success("Trade updated"); qc.invalidateQueries({ queryKey: ["paper"] }); onClose(); },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Modify {trade.symbol}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Stop loss</Label><Input value={sl} onChange={(e) => setSl(e.target.value)} className="font-mono" /></div>
          <div><Label>Take profit</Label><Input value={tp} onChange={(e) => setTp(e.target.value)} className="font-mono" /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatDuration(start: Date): string {
  const s = Math.max(0, Math.floor((Date.now() - start.getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 24) return `${h}h ${rm}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

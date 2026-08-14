import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion, AnimatePresence } from "framer-motion";
import { Pencil, X, Split, Sliders, Shield, Loader2, MoreHorizontal } from "lucide-react";
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
import { useLiveQuotes } from "@/lib/paper-trading/live-quotes";
import { usePaper } from "./context";
import { ClosePositionDialog } from "./ClosePositionDialog";
import { PostTradeSummary, type ClosedTrade } from "./PostTradeSummary";
import { SessionBadge } from "./SessionBadge";
import { cn } from "@/lib/utils";
import { useWorkspacePrefs, type BlotterSort } from "@/hooks/use-workspace-prefs";
import { ACTIONS_CELL, FlashCell, SidePill, SkeletonRows, SortHeader, signed, useRowKeyNav } from "@/components/trading/blotter-shared";


type Trade = {
  id: string; symbol: string; direction: "long"|"short"; entry_price: number;
  lot_size: number; stop_loss: number|null; take_profit: number|null;
  opened_at: string; commission: number; swap: number; account_id: string; notes: string|null;
};

export function PositionsTable() {
  const { accountId, account } = usePaper();
  const fetch = useServerFn(listTrades);
  const closeFn = useServerFn(closeTrade);
  const partialFn = useServerFn(partialCloseTrade);
  const beFn = useServerFn(moveToBreakEven);
  const qc = useQueryClient();

  const { prefs, update } = useWorkspacePrefs();

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["paper", "trades", accountId, "open"],
    queryFn: () => fetch({ data: { account_id: accountId!, status: "open" } }) as unknown as Promise<Trade[]>,
    enabled: !!accountId,
    refetchInterval: 2000,
    placeholderData: (prev) => prev,
  });

  const quotes = useLiveQuotes(data?.map((t) => t.symbol));

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
      // Drop the row before the refetch lands. `invalidateQueries` alone left
      // the closed position on screen until the next 2s poll, so it sat there
      // behind the summary modal that was reporting its close. Writing the
      // cache directly updates every table bound to this key at once — the
      // right rail and the bottom blotter both render `PositionsTable`.
      qc.setQueryData(
        ["paper", "trades", accountId, "open"],
        (prev: Trade[] | undefined) => prev?.filter((row) => row.id !== t.id),
      );
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

  // Compute enriched rows once, then sort — memoized to avoid re-work per hover.
  const enriched = useMemo(() => (data ?? []).map((t) => {
    const sym = findSymbol(t.symbol);
    const current = quotes[t.symbol]?.price ?? sym?.refPrice ?? Number(t.entry_price);
    const floating = sym ? computePnl(sym, t.direction, Number(t.entry_price), current, Number(t.lot_size)) : 0;
    const risk = sym && t.stop_loss ? Math.abs(computePnl(sym, t.direction, Number(t.entry_price), Number(t.stop_loss), Number(t.lot_size))) : 0;
    // `null` means "no stop, so R is not measurable" — distinct from a real
    // 0.00R at break-even. The cell used to test `rr` for truthiness, which
    // collapsed those two into the same dash and hid a genuine zero.
    const rr = risk > 0 ? floating / risk : null;
    return { t, sym, current, floating, rr };
  }), [data, quotes]);

  const rows = useMemo(() => sortEnriched(enriched, prefs.blotterSortOpen), [enriched, prefs.blotterSortOpen]);
  const setSort = (s: BlotterSort) => update("blotterSortOpen", s);
  const rowKey = useRowKeyNav();

  return (
    <>
      <div className="overflow-x-auto">
        {isError && (
          <div className="mb-2 flex items-center justify-end gap-2 text-[11px] text-warning">
            Unable to refresh
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => refetch()} disabled={isRefetching}>Retry</Button>
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <SortHeader label="Pair" sortKey="symbol" state={prefs.blotterSortOpen} onChange={setSort} />
              <SortHeader label="Side" sortKey="status" state={prefs.blotterSortOpen} onChange={setSort} />
              <TableHead>Session</TableHead>
              <TableHead className="text-right">Entry</TableHead>
              <TableHead className="text-right">Current</TableHead>
              <SortHeader label="Lot" sortKey="size" state={prefs.blotterSortOpen} onChange={setSort} align="right" />
              <TableHead className="text-right">SL</TableHead>
              <TableHead className="text-right">TP</TableHead>
              <TableHead className="text-right">RR</TableHead>
              <SortHeader label="P/L" sortKey="pnl" state={prefs.blotterSortOpen} onChange={setSort} align="right" />
              <SortHeader label="Duration" sortKey="time" state={prefs.blotterSortOpen} onChange={setSort} />
              <TableHead className={ACTIONS_CELL}>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <SkeletonRows rows={4} cols={12} />
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className="p-0">
                  <EmptyState
                    className="py-8"
                    title="No open positions"
                    description="Place your first paper trade from the order panel to see it here."
                  />
                </TableCell>
              </TableRow>
            ) : (
            <AnimatePresence initial={false}>
              {rows.map(({ t, sym, current, floating, rr }) => {
                const duration = formatDuration(new Date(t.opened_at));
                const up = floating >= 0;
                const beDisabled = Number(t.stop_loss ?? NaN) === Number(t.entry_price);
                return (
                  <motion.tr
                    key={t.id}
                    layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    exit={{ opacity: 0, x: 20, transition: { duration: 0.18 } }}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      rowKey(e);
                      if (e.key === "Enter") { setModifying(t); e.preventDefault(); }
                      if (e.key === "Delete" || e.key === "Backspace") { instantClose(t); e.preventDefault(); }
                    }}
                    className={cn(
                      "group border-b border-border/50 transition-colors hover:bg-muted/40 focus-visible:bg-muted/50 focus-visible:outline-none",
                      closingIds.has(t.id) && "opacity-50",
                    )}
                  >
                    <TableCell className="py-1.5 font-semibold">{t.symbol}</TableCell>
                    <TableCell className="py-1.5"><SidePill side={t.direction} /></TableCell>
                    <TableCell className="py-1.5"><SessionBadge at={t.opened_at} /></TableCell>
                    <TableCell className="py-1.5 text-right font-mono tabular-nums">{formatNumber(Number(t.entry_price), sym?.decimals ?? 2)}</TableCell>
                    <TableCell className="py-1.5 text-right font-mono tabular-nums">{formatNumber(current, sym?.decimals ?? 2)}</TableCell>
                    <TableCell className="py-1.5 text-right font-mono tabular-nums">{Number(t.lot_size).toFixed(2)}</TableCell>
                    <TableCell className="py-1.5 text-right font-mono tabular-nums text-muted-foreground">{t.stop_loss ? formatNumber(Number(t.stop_loss), sym?.decimals ?? 2) : "—"}</TableCell>
                    <TableCell className="py-1.5 text-right font-mono tabular-nums text-muted-foreground">{t.take_profit ? formatNumber(Number(t.take_profit), sym?.decimals ?? 2) : "—"}</TableCell>
                    <TableCell
                      className={cn(
                        "py-1.5 text-right font-mono tabular-nums",
                        rr == null ? "text-muted-foreground" : rr >= 0 ? "text-success" : "text-danger",
                      )}
                      title={rr == null ? "No stop loss set — R cannot be measured" : undefined}
                    >
                      {rr == null ? "—" : `${rr.toFixed(2)}R`}
                    </TableCell>
                    <FlashCell value={floating} up={up}>
                      {signed(floating)}{formatCurrency(Math.abs(floating), account?.currency)}
                    </FlashCell>
                    <TableCell className="py-1.5 text-xs text-muted-foreground">{duration}</TableCell>
                    {/* Two primary actions and an overflow, matching TradingView's
                        open-position row. Break-even, custom-price close and
                        partial close were inline icons too — five controls in a
                        column narrower than they needed, which is what pushed
                        the red Close button past the panel's right edge. They
                        are all still one click away, just not all competing for
                        the same strip. Width is fixed and non-shrinking so the
                        cell cannot be squeezed by the columns to its left. */}
                    <TableCell className={ACTIONS_CELL}>
                      <div className="flex items-center justify-end gap-1 whitespace-nowrap opacity-70 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7 shrink-0 cursor-pointer transition-transform duration-150 hover:bg-accent active:scale-90 focus-visible:ring-2 focus-visible:ring-primary/50"
                          onClick={() => setModifying(t)}
                          aria-label="Modify SL/TP" title="Modify SL/TP (E)"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          className="h-7 min-w-[68px] shrink-0 cursor-pointer justify-center gap-1 bg-danger/90 px-2 text-[11px] font-semibold text-white shadow-sm transition-all duration-150 hover:bg-danger active:scale-95 focus-visible:ring-2 focus-visible:ring-danger/60"
                          onClick={() => instantClose(t)}
                          disabled={closingIds.has(t.id)}
                          aria-label="Close at market"
                          title="Close at market (instant)"
                        >
                          {closingIds.has(t.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                          {closingIds.has(t.id) ? "Closing" : "Close"}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost" size="icon"
                              className="h-7 w-7 shrink-0 cursor-pointer transition-transform duration-150 hover:bg-accent active:scale-90 focus-visible:ring-2 focus-visible:ring-primary/50"
                              aria-label="More actions" title="More actions"
                            >
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem
                              className="cursor-pointer"
                              disabled={beDisabled}
                              onSelect={() => breakEven(t)}
                            >
                              <Shield className="mr-2 h-3.5 w-3.5" />
                              {beDisabled ? "Already at break-even" : "Move SL to break-even"}
                            </DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer" onSelect={() => setClosing(t)}>
                              <Sliders className="mr-2 h-3.5 w-3.5" />
                              Close at custom price…
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              <Split className="mr-1 inline h-3 w-3" />
                              Partial close
                            </DropdownMenuLabel>
                            <DropdownMenuItem className="cursor-pointer" onSelect={() => partialClose(t, 0.25)}>Close 25%</DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer" onSelect={() => partialClose(t, 0.5)}>Close 50%</DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer" onSelect={() => partialClose(t, 0.75)}>Close 75%</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </motion.tr>
                );
              })}
            </AnimatePresence>
            )}
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
  const sym = findSymbol(trade.symbol);
  const step = sym ? Math.pow(10, -(sym.decimals ?? 2)) * 10 : 0.0001; // ~1 pip
  const [sl, setSl] = useState(trade.stop_loss ? String(trade.stop_loss) : "");
  const [tp, setTp] = useState(trade.take_profit ? String(trade.take_profit) : "");
  const modify = useServerFn(modifyTrade);
  const mut = useMutation({
    mutationFn: () => modify({ data: { id: trade.id, stop_loss: sl ? Number(sl) : null, take_profit: tp ? Number(tp) : null } }),
    onSuccess: () => { toast.success("Trade updated"); qc.invalidateQueries({ queryKey: ["paper"] }); onClose(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const decimals = sym?.decimals ?? 2;
  const nudge = (set: (v: string) => void, cur: string, dir: 1 | -1) => {
    const n = Number(cur) || Number(trade.entry_price);
    set((n + dir * step).toFixed(decimals));
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Modify {trade.symbol}</DialogTitle></DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); if (!mut.isPending) mut.mutate(); }}
          className="space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Stop loss</Label>
              <div className="mt-1 flex gap-1">
                <Button type="button" variant="outline" size="icon" className="h-9 w-8 shrink-0" onClick={() => nudge(setSl, sl, -1)} tabIndex={-1}>−</Button>
                <Input autoFocus value={sl} onChange={(e) => setSl(e.target.value)} className="font-mono" inputMode="decimal" placeholder="—" />
                <Button type="button" variant="outline" size="icon" className="h-9 w-8 shrink-0" onClick={() => nudge(setSl, sl, 1)} tabIndex={-1}>+</Button>
              </div>
            </div>
            <div>
              <Label>Take profit</Label>
              <div className="mt-1 flex gap-1">
                <Button type="button" variant="outline" size="icon" className="h-9 w-8 shrink-0" onClick={() => nudge(setTp, tp, -1)} tabIndex={-1}>−</Button>
                <Input value={tp} onChange={(e) => setTp(e.target.value)} className="font-mono" inputMode="decimal" placeholder="—" />
                <Button type="button" variant="outline" size="icon" className="h-9 w-8 shrink-0" onClick={() => nudge(setTp, tp, 1)} tabIndex={-1}>+</Button>
              </div>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">Tip — press <kbd className="rounded bg-muted px-1">Enter</kbd> to save, <kbd className="rounded bg-muted px-1">Esc</kbd> to cancel.</p>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mut.isPending} className="min-w-[80px]">
              {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </form>
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

type Enriched = { t: Trade; sym: ReturnType<typeof findSymbol>; current: number; floating: number; rr: number | null };

function sortEnriched(rows: Enriched[], s: BlotterSort): Enriched[] {
  const mul = s.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    switch (s.key) {
      case "symbol": return a.t.symbol.localeCompare(b.t.symbol) * mul;
      case "pnl":    return (a.floating - b.floating) * mul;
      case "size":   return (Number(a.t.lot_size) - Number(b.t.lot_size)) * mul;
      case "status": return a.t.direction.localeCompare(b.t.direction) * mul;
      case "time":
      default:       return (new Date(a.t.opened_at).getTime() - new Date(b.t.opened_at).getTime()) * mul;
    }
  });
}

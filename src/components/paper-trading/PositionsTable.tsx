import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion, AnimatePresence } from "framer-motion";
import { Pencil, X, Split, Sliders, Shield, Loader2, MoreHorizontal, Settings2, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import {
  closeTrade, listTrades, modifyTrade, partialCloseTrade, moveToBreakEven,
} from "@/lib/paper-trading.functions";
import { findSymbol } from "@/lib/paper-trading/symbols";
import { formatCurrency } from "@/lib/paper-trading/calculations";
import { derivePositionRow } from "@/lib/paper-trading/position-row";
import { useLiveQuotes } from "@/lib/paper-trading/live-quotes";
import { usePaper } from "./context";
import { ClosePositionDialog } from "./ClosePositionDialog";
import { PostTradeSummary, type ClosedTrade } from "./PostTradeSummary";
import { cn } from "@/lib/utils";
import { useWorkspacePrefs, type BlotterSort } from "@/hooks/use-workspace-prefs";
import { ACTIONS_CELL, ACTIONS_CELL_COMPACT, FlashCell, SkeletonRows, SortHeader, useRowKeyNav } from "@/components/trading/blotter-shared";
import {
  POSITION_COLUMNS, visibleColumns,
  type ColumnCtx, type PositionColumn, type PositionRow, type Trade,
} from "./positions-columns";

/**
 * `compact` restricts the table to the columns marked `compact` in the registry.
 *
 * The full layout is built for the full-width blotter. In the ~380px right rail
 * it overflows horizontally, and because the overflow is a scroll rather than a
 * wrap, the rightmost visible cell is simply severed mid-token — which is how
 * `-0.90R` came to read `-0.90`, a different and entirely plausible number.
 * Everything the dropped columns hold is still on the row's edit dialog and in
 * the blotter below.
 *
 * The rail deliberately gets no column picker: with three columns there is
 * nothing to trade off, and a settings icon there would cost more width than
 * the choice is worth.
 */
export function PositionsTable({ compact = false }: { compact?: boolean } = {}) {
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
    // The displayed price is what gets sent as `exit_price`, so the fallbacks
    // here were filling closes at a price that is not the market: `refPrice` is
    // a stale catalog seed (gold 2432 vs ~4355 live) and `entry_price` would
    // book every close as exactly break-even. Refuse instead.
    const current = quotes[t.symbol]?.price ?? null;
    if (!current || current <= 0) {
      toast.error(`No live price for ${t.symbol} — cannot close at an unknown price`);
      return;
    }
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
    const current = quotes[t.symbol]?.price ?? null;
    if (!current || current <= 0) {
      toast.error(`No live price for ${t.symbol} — cannot close at an unknown price`);
      return;
    }
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
  // No quote ⇒ no current price and no derived figures. Substituting `refPrice`
  // made P/L a fiction, and substituting `entry_price` silently reported every
  // unquoted position as flat. Account leverage is what the margin was actually
  // taken at, so it is what the row's margin has to be computed from.
  const enriched = useMemo<PositionRow[]>(() => (data ?? []).map((t) =>
    derivePositionRow(t, {
      current: quotes[t.symbol]?.price ?? null,
      accountLeverage: Number(account?.leverage) || 0,
    }),
  ), [data, quotes, account?.leverage]);

  const rows = useMemo(() => sortEnriched(enriched, prefs.blotterSortOpen), [enriched, prefs.blotterSortOpen]);
  const setSort = (s: BlotterSort) => update("blotterSortOpen", s);
  const rowKey = useRowKeyNav();

  const cols = useMemo(
    () => visibleColumns(prefs.positionsColumns, compact),
    [prefs.positionsColumns, compact],
  );
  const ctx = useMemo(() => ({ currency: account?.currency, compact }), [account?.currency, compact]);
  // +1 for the Actions column, which lives outside the registry: it is pinned,
  // never hidden, and holds controls rather than data.
  const colCount = cols.length + 1;

  const toggleColumn = (id: string, on: boolean) =>
    update("positionsColumns", { ...prefs.positionsColumns, [id]: on });

  return (
    <>
      <div className="overflow-x-auto">
        {isError && (
          <div className="mb-2 flex items-center justify-end gap-2 text-[11px] text-warning">
            Unable to refresh
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => refetch()} disabled={isRefetching}>Retry</Button>
          </div>
        )}
        {/* Distinct ids per mode: the rail renders this same component, and a
            test that cannot tell the two apart will happily assert the full
            layout against the three-column one. */}
        <Table data-testid={compact ? "positions-table-compact" : "positions-table"}>
          <TableHeader>
            <TableRow>
              {cols.map((c) =>
                c.sortKey ? (
                  <SortHeader
                    key={c.id}
                    label={c.label}
                    sortKey={c.sortKey}
                    state={prefs.blotterSortOpen}
                    onChange={setSort}
                    align={c.align}
                  />
                ) : (
                  <TableHead key={c.id} className={c.align === "right" ? "text-right" : undefined}>
                    {c.label}
                  </TableHead>
                ),
              )}
              {/* The picker and the export live in the Actions header rather
                  than above the table: they belong to this table, and a toolbar
                  row above it would cost vertical space in a dock the user
                  already resizes to claw back chart height. */}
              <TableHead className={compact ? ACTIONS_CELL_COMPACT : ACTIONS_CELL}>
                {compact ? (
                  "Actions"
                ) : (
                  <div className="flex items-center justify-end gap-0.5">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                          aria-label="Choose columns"
                          title="Choose columns"
                        >
                          <Settings2 className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Columns
                        </DropdownMenuLabel>
                        {POSITION_COLUMNS.map((c) => (
                          <DropdownMenuCheckboxItem
                            key={c.id}
                            className="cursor-pointer text-xs"
                            checked={c.required || prefs.positionsColumns[c.id] !== false}
                            // Required columns render checked and inert rather
                            // than being left out of the list, so the menu is a
                            // complete account of the table.
                            disabled={c.required}
                            onCheckedChange={(v) => toggleColumn(c.id, !!v)}
                            onSelect={(e) => e.preventDefault()}
                          >
                            {c.label}
                          </DropdownMenuCheckboxItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <button
                      type="button"
                      onClick={() => exportRows(rows, cols, ctx)}
                      disabled={rows.length === 0}
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-40"
                      aria-label="Export positions to CSV"
                      title="Export to CSV"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <SkeletonRows rows={4} cols={colCount} />
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colCount} className="p-0">
                  <EmptyState
                    className="py-8"
                    title="No open positions"
                    description="Place your first paper trade from the order panel to see it here."
                  />
                </TableCell>
              </TableRow>
            ) : (
            <AnimatePresence initial={false}>
              {rows.map((row) => {
                const t = row.t;
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
                    {cols.map((c) =>
                      c.flash ? (
                        // FlashCell emits its own <td>, so it cannot be wrapped.
                        // Its 110px floor is sized for the full blotter; in the
                        // rail that is 40% of the usable width on its own.
                        <FlashCell
                          key={c.id}
                          {...c.flash(row)}
                          className={compact ? "min-w-[76px] p-1 text-[11px]" : undefined}
                        >
                          {c.cell(row, ctx)}
                        </FlashCell>
                      ) : (
                        <TableCell key={c.id} className={c.className}>
                          {c.cell(row, ctx)}
                        </TableCell>
                      ),
                    )}
                    {/* TradingView's two-icon row: edit and close, both
                        monochrome ghost icons, no label and no colour. The red
                        labelled Close button was 68px of the 136px column and
                        sat under the floating assistant bubble, which made the
                        control that closes a position partly unclickable.
                        Colour is not carrying meaning here — the icon and its
                        label already do — and the confirmation for a mis-click
                        is that closing is one keystroke to undo in the summary.

                        The overflow keeps break-even, custom-price close and
                        partial close one click away; it reveals on hover so the
                        row at rest is the two icons TradingView shows. Width is
                        fixed and non-shrinking so the columns to the left cannot
                        squeeze the cell. */}
                    <TableCell className={compact ? ACTIONS_CELL_COMPACT : ACTIONS_CELL}>
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
                          variant="ghost" size="icon"
                          className="h-7 w-7 shrink-0 cursor-pointer text-muted-foreground transition-transform duration-150 hover:bg-danger/10 hover:text-danger active:scale-90 focus-visible:ring-2 focus-visible:ring-danger/50"
                          onClick={() => instantClose(t)}
                          disabled={closingIds.has(t.id)}
                          aria-label="Close at market"
                          title="Close at market (instant)"
                        >
                          {closingIds.has(t.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost" size="icon"
                              // Hidden until the row is hovered or focused, so
                              // the resting row is the two icons and nothing
                              // else. `focus-within` on the row keeps it
                              // reachable by keyboard.
                              className="h-7 w-7 shrink-0 cursor-pointer opacity-0 transition-all duration-150 hover:bg-accent active:scale-90 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-primary/50 group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:opacity-100"
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

/**
 * Download the table as CSV — exactly the columns on screen, in their order.
 *
 * Exporting the full registry regardless of the picker would quietly disagree
 * with what the user is looking at; the point of the picker is that the visible
 * set IS the user's chosen view of their book.
 *
 * Values come from each column's `csv`, which emits raw numbers rather than the
 * formatted cell: `$1,234.56` is a string in every spreadsheet that opens it,
 * and an export nobody can sum is not an export.
 */
function exportRows(rows: PositionRow[], cols: PositionColumn[], ctx: ColumnCtx) {
  const usable = cols.filter((c) => c.csv);
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [
    usable.map((c) => esc(c.label)).join(","),
    ...rows.map((r) => usable.map((c) => esc(c.csv!(r, ctx))).join(",")),
  ];

  const url = URL.createObjectURL(
    new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8;" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `positions-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function sortEnriched(rows: PositionRow[], s: BlotterSort): PositionRow[] {
  const mul = s.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    switch (s.key) {
      case "symbol": return a.t.symbol.localeCompare(b.t.symbol) * mul;
      // Unquoted rows sort last in either direction rather than as zero.
      case "pnl":    return ((a.floating ?? 0) - (b.floating ?? 0)) * mul;
      case "size":   return (Number(a.t.lot_size) - Number(b.t.lot_size)) * mul;
      case "status": return a.t.direction.localeCompare(b.t.direction) * mul;
      case "time":
      default:       return (new Date(a.t.opened_at).getTime() - new Date(b.t.opened_at).getTime()) * mul;
    }
  });
}

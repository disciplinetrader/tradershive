/**
 * Studio blotter — the Replay Studio's bottom dock.
 *
 * Deliberately mirrors the Trading Workspace blotter: same chip filters, same
 * table density, the same Side/Status pills. Traders should not have to learn
 * two different interfaces for positions, working orders and history.
 *
 * Every number is read from the canonical execution stores; this file computes
 * no P/L, no R and no risk.
 */
import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SidePill, StatusPill } from "@/components/trading/blotter-shared";
import { positionMetricsFor } from "@/lib/chart/orders/service";
import { cn } from "@/lib/utils";
import { useReplayStudio } from "./context";

type Tab = "positions" | "orders" | "history";

function num(v: number | null | undefined, digits = 2) {
  return v == null || !Number.isFinite(v) ? "—" : v.toFixed(digits);
}

function money(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v >= 0 ? "" : "-"}${Math.abs(v).toFixed(2)}`;
}

function Pnl({ value }: { value: number | null | undefined }) {
  const v = value ?? 0;
  return (
    <span className={cn("font-mono tabular-nums", v > 0 ? "text-success" : v < 0 ? "text-danger" : "text-muted-foreground")}>
      {money(value)}
    </span>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <TableRow>
      <TableCell colSpan={12} className="py-8 text-center text-xs text-muted-foreground">
        {text}
      </TableCell>
    </TableRow>
  );
}

export function StudioBlotter({ className }: { className?: string }) {
  const {
    positions, pending, trades, price,
    closePositionNow, cancelOrder, partialClose, breakEven,
  } = useReplayStudio();
  const [tab, setTab] = useState<Tab>("positions");
  const [open, setOpen] = useState(true);

  const chips = useMemo(
    () => [
      { k: "positions" as Tab, label: "Positions", count: positions.length },
      { k: "orders" as Tab, label: "Orders", count: pending.length },
      { k: "history" as Tab, label: "History", count: trades.length },
    ],
    [positions.length, pending.length, trades.length],
  );

  return (
    <section
      className={cn("flex shrink-0 flex-col border-t border-border/60 bg-card/30", className)}
      aria-label="Replay blotter"
    >
      <div className="flex items-center gap-1 border-b border-border/40 px-2 py-1.5">
        <div role="tablist" aria-label="Blotter filter" className="flex min-w-0 items-center gap-1 overflow-x-auto">
          {chips.map((c) => (
            <button
              key={c.k}
              role="tab"
              aria-selected={tab === c.k}
              onClick={() => { setTab(c.k); setOpen(true); }}
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                tab === c.k
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              {c.label}
              {c.count ? <span className="ml-1 font-mono opacity-70">{c.count}</span> : null}
            </button>
          ))}
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-7 px-2 text-[11px]"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          {open ? "Hide" : "Show"}
        </Button>
      </div>

      {open ? (
        <ScrollArea className="h-[168px]">
          <Table className="text-xs">
            <TableHeader>
              {tab === "positions" ? (
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Avg entry</TableHead>
                  <TableHead className="text-right">Stop</TableHead>
                  <TableHead className="text-right">Target</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">P/L</TableHead>
                  <TableHead className="text-right">R</TableHead>
                  <TableHead className="text-right">Manage</TableHead>
                </TableRow>
              ) : tab === "orders" ? (
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Entry</TableHead>
                  <TableHead className="text-right">Stop</TableHead>
                  <TableHead className="text-right">Target</TableHead>
                  <TableHead className="text-right">R:R</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right" />
                </TableRow>
              ) : (
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead className="text-right">Entry</TableHead>
                  <TableHead className="text-right">Exit</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Net P/L</TableHead>
                  <TableHead className="text-right">R</TableHead>
                </TableRow>
              )}
            </TableHeader>

            <TableBody>
              {tab === "positions" ? (
                positions.length === 0 ? (
                  <Empty text="No open positions. Use the chart or the Buy/Sell buttons to take a trade." />
                ) : (
                  positions.map((p) => {
                    const m = positionMetricsFor(p, price);
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.symbol}</TableCell>
                        <TableCell><SidePill side={p.direction === "buy" ? "long" : "short"} /></TableCell>
                        <TableCell className="text-right font-mono">{num(m?.remainingQuantity ?? p.size, 2)}</TableCell>
                        <TableCell className="text-right font-mono">{num(m?.averageEntry ?? p.fillPrice ?? p.entry, 5)}</TableCell>
                        <TableCell className="text-right font-mono">{num(p.stop, 5)}</TableCell>
                        <TableCell className="text-right font-mono">{num(p.target, 5)}</TableCell>
                        <TableCell className="text-right font-mono">{num(price, 5)}</TableCell>
                        <TableCell className="text-right"><Pnl value={m?.totalPnl} /></TableCell>
                        <TableCell className="text-right font-mono">{num(m?.totalR, 2)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => breakEven(p.id)}>BE</Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => partialClose(p.id, 0.5)}>50%</Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => closePositionNow(p.id)}>Close</Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )
              ) : tab === "orders" ? (
                pending.length === 0 ? (
                  <Empty text="No working orders. Drop a position tool on the chart to stage one." />
                ) : (
                  pending.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium">{o.symbol}</TableCell>
                      <TableCell><SidePill side={o.direction === "buy" ? "long" : "short"} /></TableCell>
                      <TableCell className="uppercase">{o.orderType}</TableCell>
                      <TableCell className="text-right font-mono">{num(o.entry, 5)}</TableCell>
                      <TableCell className="text-right font-mono">{num(o.stop, 5)}</TableCell>
                      <TableCell className="text-right font-mono">{num(o.target, 5)}</TableCell>
                      <TableCell className="text-right font-mono">{num(o.rr, 2)}</TableCell>
                      <TableCell><StatusPill status={o.status} /></TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => cancelOrder(o.id)}>Cancel</Button>
                      </TableCell>
                    </TableRow>
                  ))
                )
              ) : trades.length === 0 ? (
                <Empty text="Closed trades appear here as the session runs." />
              ) : (
                trades.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.symbol}</TableCell>
                    <TableCell><SidePill side={t.direction === "buy" ? "long" : "short"} /></TableCell>
                    <TableCell className="text-right font-mono">{num(t.fillPrice, 5)}</TableCell>
                    <TableCell className="text-right font-mono">{num(t.exitPrice, 5)}</TableCell>
                    <TableCell className="text-muted-foreground">{t.closeReason}</TableCell>
                    <TableCell className="text-right font-mono">{num(t.quantity, 2)}</TableCell>
                    <TableCell className="text-right"><Pnl value={t.netPnl} /></TableCell>
                    <TableCell className="text-right font-mono">{num(t.realizedR, 2)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      ) : null}
    </section>
  );
}

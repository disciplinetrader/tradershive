import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, ArrowUp, Calculator, ChevronUp, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { openTrade, listTrades } from "@/lib/paper-trading.functions";
import { formatCurrency } from "@/lib/paper-trading/calculations";
import { resolveQuantity } from "@/lib/paper-trading/order-ticket";
import { useLivePrice, useLiveQuotes } from "@/lib/paper-trading/live-quotes";
import { validateNewOrder, type OpenTradeInput } from "@/lib/paper-trading/risk";
import { usePaper } from "./context";
import { OrderPanel } from "./OrderPanel";
import { cn } from "@/lib/utils";

type Side = "long" | "short";

/**
 * Persistent bottom trade dock for mobile. Keeps Buy/Sell one tap away —
 * no floating action button hunt. Advanced controls (SL/TP, limit, tags,
 * notes) live in the full OrderPanel behind the expand chevron.
 */
export function MobileQuickTradeDock() {
  const qc = useQueryClient();
  const { symbol, symbolMeta, account, accountId } = usePaper();
  const livePrice = useLivePrice(symbol);
  const openFn = useServerFn(openTrade);
  const listTradesFn = useServerFn(listTrades);

  const [side, setSide] = useState<Side>("long");
  const [lot, setLot] = useState("0.10");
  const [riskPct, setRiskPct] = useState("1");
  const [expanded, setExpanded] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const balance = Number(account?.balance ?? 0);
  const leverage = Number(account?.leverage ?? 100);
  const lotNum = Number(lot) || 0;
  // No seed fallback: an unquoted symbol has no price, and the dock disables
  // itself rather than quoting a catalog value it cannot fill at.
  const price = livePrice ?? 0;

  const { data: openTrades } = useQuery({
    queryKey: ["paper", "trades", accountId, "open"],
    queryFn: () =>
      listTradesFn({ data: { account_id: accountId!, status: "open" } }) as unknown as Promise<OpenTradeInput[]>,
    enabled: !!accountId,
    refetchInterval: 5000,
  });

  const liveQuotes = useLiveQuotes(openTrades?.map((t) => t.symbol));

  const validation = useMemo(() => {
    if (!account || !symbolMeta || !price || !lotNum) return null;
    return validateNewOrder(
      account as any,
      openTrades ?? [],
      {
        symbol,
        direction: side,
        entry_price: price,
        lot_size: lotNum,
        stop_loss: null,
        risk_amount: null,
      },
      (s) => liveQuotes[s]?.price ?? null,
    );
  }, [account, symbolMeta, openTrades, symbol, side, price, lotNum, liveQuotes]);

  // Auto-size from risk % when user changes it (no SL → uses a 1% price move as proxy)
  const autoSize = () => {
    if (!symbolMeta || !price) return toast.error("No live price yet");
    // Assume a default 1% adverse move to size the ticket when no SL is set.
    const virtualSl = side === "long" ? price * 0.99 : price * 1.01;
    const sizing = resolveQuantity({
      mode: "risk_percent", sym: symbolMeta, entry: price, sl: virtualSl,
      balance, value: Number(riskPct),
    });
    if (sizing.error || sizing.lot == null || sizing.actualRisk == null) {
      return toast.error(sizing.error ?? "Cannot size — check price");
    }
    setLot(String(sizing.lot));
    const actualPct = balance > 0 ? (sizing.actualRisk / balance) * 100 : 0;
    // At min lot the trade can risk far more than asked — say so rather than
    // echoing the requested percent back. See OrderPanel for the full note.
    if (sizing.clamped === "min") {
      return toast.warning(
        `${symbolMeta.symbol} cannot trade below ${symbolMeta.minLot} lot — that risks `
        + `${formatCurrency(sizing.actualRisk, account?.currency)} (${actualPct.toFixed(1)}%), not ${riskPct}%.`,
      );
    }
    toast.success(
      `Sized to ${sizing.lot} — risks ${formatCurrency(sizing.actualRisk, account?.currency)} (${actualPct.toFixed(2)}%)`,
    );
  };

  const submit = useMutation({
    mutationFn: async (s: Side) => {
      if (!accountId || !symbolMeta) throw new Error("No account selected");
      if (!price) throw new Error("No live price");
      if (!lotNum || lotNum < symbolMeta.minLot) throw new Error(`Min lot ${symbolMeta.minLot}`);
      if (validation && !validation.ok) throw new Error(validation.errors[0] ?? "Rejected");
      return openFn({
        data: {
          account_id: accountId,
          symbol,
          market: symbolMeta.market,
          direction: s,
          order_type: "market",
          lot_size: lotNum,
          entry_price: price,
          stop_loss: null,
          take_profit: null,
          commission: 0,
          swap: 0,
        } as any,
      });
    },
    onSuccess: (_r, s) => {
      toast.success(`${s === "long" ? "Bought" : "Sold"} ${lotNum} ${symbol} @ ${price.toFixed(symbolMeta?.decimals ?? 2)}`);
      qc.invalidateQueries({ queryKey: ["paper"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const canTrade = !!accountId && !!price && lotNum > 0 && (!validation || validation.ok);
  const decimals = symbolMeta?.decimals ?? 2;

  return (
    <>
      {/* Persistent bottom dock — mobile only, sits above bottom nav via safe-bottom */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-16 z-40 border-t border-border/70 bg-background/95 backdrop-blur",
          "safe-bottom shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.15)] lg:hidden",
        )}
      >
        {/* Grabber row */}
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex w-full items-center justify-center py-1.5"
          aria-label="Expand trade panel"
        >
          <span className="h-1 w-10 rounded-full bg-border" />
        </button>

        <div className="grid grid-cols-[auto_1fr_1fr_auto] items-end gap-2 px-2 pb-2">
          {/* Symbol + price */}
          <div className="min-w-0 pl-1">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {symbol}
            </div>
            <div className="font-mono text-sm font-semibold tabular-nums">
              {price ? price.toFixed(decimals) : "—"}
              <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                {leverage}×
              </span>
            </div>
          </div>

          {/* Size input */}
          <label className="min-w-0">
            <span className="mb-0.5 block text-[9px] uppercase tracking-wider text-muted-foreground">
              Size
            </span>
            <Input
              inputMode="decimal"
              value={lot}
              onChange={(e) => setLot(e.target.value)}
              className="h-9 rounded-md px-2 font-mono text-sm"
              aria-label="Position size in lots"
            />
          </label>

          {/* Risk % */}
          <label className="min-w-0">
            <span className="mb-0.5 block text-[9px] uppercase tracking-wider text-muted-foreground">
              Risk %
            </span>
            <div className="flex gap-1">
              <Input
                inputMode="decimal"
                value={riskPct}
                onChange={(e) => setRiskPct(e.target.value)}
                className="h-9 rounded-md px-2 font-mono text-sm"
                aria-label="Risk percent"
              />
              <button
                type="button"
                onClick={autoSize}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border/70 text-muted-foreground active:scale-95"
                aria-label="Auto-size from risk"
              >
                <Calculator className="h-4 w-4" />
              </button>
            </div>
          </label>

          {/* Expand chevron */}
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="grid h-9 w-9 place-items-center rounded-md border border-border/70 text-muted-foreground active:scale-95"
            aria-label="Advanced order settings"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
        </div>

        {/* Buy / Sell row */}
        <div className="grid grid-cols-2 gap-2 px-2 pb-2">
          <Button
            disabled={!canTrade || submit.isPending}
            onClick={() => { setSide("short"); submit.mutate("short"); }}
            className="h-12 gap-1.5 bg-danger text-white hover:bg-danger/90 min-h-touch"
          >
            <ArrowDown className="h-4 w-4" /> Sell
          </Button>
          <Button
            disabled={!canTrade || submit.isPending}
            onClick={() => { setSide("long"); submit.mutate("long"); }}
            className="h-12 gap-1.5 bg-success text-white hover:bg-success/90 min-h-touch"
          >
            <ArrowUp className="h-4 w-4" /> Buy
          </Button>
        </div>

        {validation && !validation.ok && (
          <div className="border-t border-danger/30 bg-danger/10 px-3 py-1.5 text-[11px] text-danger">
            {validation.errors[0]}
          </div>
        )}
      </div>

      {/* Full advanced panel */}
      <Sheet open={expanded} onOpenChange={setExpanded}>
        <SheetContent
          side="bottom"
          className="max-h-[92dvh] overflow-y-auto p-4 safe-bottom lg:hidden"
        >
          <SheetHeader className="mb-3 flex-row items-center justify-between text-left">
            <SheetTitle className="text-base">Order · {symbol}</SheetTitle>
            <button
              onClick={() => setExpanded(false)}
              className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </SheetHeader>
          <OrderPanel />
        </SheetContent>
      </Sheet>

      <AnimatePresence>{confirmOpen && <motion.div key="_" />}</AnimatePresence>
    </>
  );
}
